import { PaymentMethod, type CashMovement, type Prisma, type Repair } from '@prisma/client'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import type { AuthData } from '../../middlewares/auth'
import { canViewRepairFinancials } from './repair-response'

const money = z.number().int().min(0).max(2_147_483_647)
export const financialRequestId = z.string().uuid()
export const expenseDecisionSchema = z.object({
  movementId: z.string().min(1),
  disposition: z.enum(['NOT_PURCHASED', 'REFUND_FULL', 'KEEP', 'REFUND_PARTIAL']),
  amount: money.optional(), method: z.nativeEnum(PaymentMethod).optional(),
  confirmed: z.boolean().optional(), reason: z.string().trim().min(5).max(500).optional(),
  stockDisposition: z.enum(['LOST', 'KEPT_FOR_STOCK']).optional(),
}).strict()
export const cancelFinanceSchema = z.object({
  requestId: financialRequestId, reviewFee: money.default(0),
  refundConfirmed: z.boolean().default(false), refundMethod: z.nativeEnum(PaymentMethod).optional(),
  expenses: z.array(expenseDecisionSchema).max(100).default([]),
  expectedVersion: z.string().length(64).optional(),
}).strict()
export type CancellationInput = z.infer<typeof cancelFinanceSchema>
export const financeError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode })
export const operationPayload = (value: unknown) => JSON.stringify(value)
export const ledgerVersion = (repair: Repair, rows: CashMovement[]) => createHash('sha256').update(JSON.stringify([repair.id, repair.status, repair.paid, repair.updatedAt, rows.map(row => [row.id, row.amount])])).digest('hex')

export function requireFinancialWriter(auth: AuthData) {
  if (!canViewRepairFinancials(auth) || auth.role !== 'OWNER' && !auth.permissions?.includes('cash.create')) {
    throw financeError(403, 'Necesitás permisos financieros y de registro de Caja para esta operación')
  }
}
export async function lockRepair(tx: Prisma.TransactionClient, businessId: string, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`
}

type LedgerRow = CashMovement & { warrantyExpense?: { id: string } | null }
export const readRepairLedger = (tx: Pick<Prisma.TransactionClient, 'cashMovement'>, businessId: string, repairId: string) => tx.cashMovement.findMany({
  where: { businessId, repairId }, include: { warrantyExpense: { select: { id: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
})
export const isPartsExpense = (row: LedgerRow) => row.type === 'EXPENSE' && row.amount > 0 && !row.accountingOnly && !row.relatedMovementId && !row.warrantyExpense && (!row.repairFinanceKind || row.repairFinanceKind === 'PURCHASE')
export const remainingExpense = (row: LedgerRow, rows: LedgerRow[]) => row.amount - rows.filter(item => item.relatedMovementId === row.id && ['SUPPLIER_REFUND', 'EXPENSE_CORRECTION'].includes(item.repairFinanceKind ?? '')).reduce((sum, item) => sum + Math.abs(item.amount), 0)

export function repairFinancialSummary(rows: LedgerRow[], repair: Pick<Repair, 'paid' | 'cancellationPaidAmount' | 'cancellationReviewFee' | 'cancellationReviewPaid' | 'cancellationRefundAmount' | 'cancellationRefundPaid' | 'cancellationRefundMovementId'>) {
  const income = rows.filter(row => row.type === 'INCOME').reduce((sum, row) => sum + row.amount, 0)
  const expense = rows.filter(row => row.type === 'EXPENSE').reduce((sum, row) => sum + row.amount, 0)
  const accountingAdjustment = -rows.filter(row => row.accountingOnly).reduce((sum, row) => sum + row.amount, 0)
  const supplierRecovery = rows.filter(row => row.repairFinanceKind === 'SUPPLIER_REFUND').reduce((sum, row) => sum + row.amount, 0)
  const customerRefund = rows.filter(row => row.repairFinanceKind === 'CUSTOMER_REFUND' || row.id === repair.cancellationRefundMovementId).reduce((sum, row) => sum + row.amount, 0)
  const refundPaid = repair.cancellationRefundPaid ?? (repair.cancellationRefundMovementId ? repair.cancellationRefundAmount ?? 0 : 0)
  return {
    income, expense, net: income - expense,
    cashExpense: expense + accountingAdjustment, cashNet: income - expense - accountingAdjustment, accountingAdjustment,
    customerCollected: income - supplierRecovery, customerRefund, supplierRecovery,
    reviewBalance: Math.max(0, (repair.cancellationReviewFee ?? 0) - (repair.cancellationPaidAmount ?? 0) - repair.cancellationReviewPaid),
    refundBalance: Math.max(0, (repair.cancellationRefundAmount ?? 0) - refundPaid),
    unresolvedExpenses: rows.filter(row => isPartsExpense(row) && row.id !== repair.cancellationRefundMovementId && !row.repairFinanceKind && remainingExpense(row, rows) > 0).length,
  }
}
export async function withRepairLedger<T extends Repair>(tx: Pick<Prisma.TransactionClient, 'cashMovement'>, repair: T) {
  const rows = await readRepairLedger(tx, repair.businessId, repair.id)
  return { ...repair, financialSummary: repairFinancialSummary(rows, repair), financialMovements: rows,
    expenseEntries: rows.filter(row => isPartsExpense(row) && row.id !== repair.cancellationRefundMovementId).map(row => ({ id: row.id, amount: row.amount, remaining: remainingExpense(row, rows), description: row.description, method: row.method, createdAt: row.createdAt, historical: !row.repairFinanceKind })),
  }
}

/** Payment and cash evidence must agree. Missing historical links are not reconstructed. */
export async function validatePaymentEvidence(tx: Prisma.TransactionClient, current: Repair, rows: LedgerRow[]) {
  const payments = await tx.payment.findMany({ where: { businessId: current.businessId, repairId: current.id, cancellationReview: false } })
  if (payments.reduce((sum, payment) => sum + payment.amount, 0) !== current.paid || payments.some(payment => {
    const cash = rows.find(row => row.id === payment.cashMovementId)
    return !cash || cash.type !== 'INCOME' || cash.accountingOnly || cash.amount !== payment.amount || cash.repairFinanceKind === 'SUPPLIER_REFUND'
  })) throw financeError(409, 'Los pagos históricos y Caja no coinciden. Necesitan conciliación explícita antes de cancelar; no se reconstruirán automáticamente.')
}

export function planCancellation(current: Repair, rows: LedgerRow[], input: CancellationInput) {
  const eligible = rows.filter(row => isPartsExpense(row) && row.id !== current.cancellationRefundMovementId).filter(row => remainingExpense(row, rows) > 0)
  const ids = new Set<string>()
  for (const decision of input.expenses) {
    if (ids.has(decision.movementId)) throw financeError(400, 'Un gasto no puede aparecer dos veces')
    ids.add(decision.movementId)
    if (!eligible.some(row => row.id === decision.movementId)) throw financeError(400, 'El gasto no pertenece a esta reparación o no admite esa operación')
  }
  if (eligible.some(row => !ids.has(row.id))) throw financeError(409, 'Indicá qué pasó con cada gasto registrado; los históricos no se concilian automáticamente')
  const actions = input.expenses.map(decision => {
    if (decision.disposition === 'KEEP' && !decision.stockDisposition) throw financeError(400, 'Indicá si el repuesto se conserva para stock o el gasto es definitivo')
    const original = eligible.find(row => row.id === decision.movementId)!
    const remaining = remainingExpense(original, rows)
    const amount = decision.disposition === 'KEEP' ? 0 : decision.disposition === 'REFUND_PARTIAL' ? decision.amount ?? 0 : remaining
    if (decision.disposition !== 'KEEP' && (decision.confirmed !== true || amount <= 0 || amount > remaining)) throw financeError(400, 'Confirmá la operación real y un importe que no supere el gasto pendiente')
    if (decision.disposition === 'REFUND_PARTIAL' && amount >= remaining) throw financeError(400, 'Una recuperación parcial debe ser menor que el gasto pendiente')
    if (['REFUND_FULL', 'REFUND_PARTIAL'].includes(decision.disposition) && !decision.method) throw financeError(400, 'Indicá el medio por el que recibiste la devolución')
    if (decision.disposition === 'NOT_PURCHASED' && !decision.reason) throw financeError(400, 'La corrección sin dinero necesita un motivo explícito')
    if (decision.disposition === 'NOT_PURCHASED' && rows.some(row => row.relatedMovementId === original.id && row.repairFinanceKind === 'SUPPLIER_REFUND')) throw financeError(409, 'Un gasto con devolución real no puede declararse inexistente')
    if (decision.disposition !== 'KEEP' && decision.stockDisposition === 'KEPT_FOR_STOCK') throw financeError(400, 'Conservar el repuesto no equivale a recibir una devolución')
    return { ...decision, amount, original }
  })
  const refundDue = Math.max(0, current.paid - input.reviewFee)
  if (refundDue && input.refundConfirmed && !input.refundMethod) throw financeError(400, 'Indicá el medio de la devolución real al cliente')
  const summary = repairFinancialSummary(rows, current)
  const recovery = actions.filter(action => ['REFUND_FULL', 'REFUND_PARTIAL'].includes(action.disposition)).reduce((sum, action) => sum + action.amount, 0)
  const adjustment = actions.filter(action => action.disposition === 'NOT_PURCHASED').reduce((sum, action) => sum + action.amount, 0)
  const refundNow = input.refundConfirmed ? refundDue : 0
  return { actions, refundDue, refundNow, projectedNet: summary.net + recovery + adjustment - refundNow,
    projectedCashNet: summary.cashNet + recovery - refundNow, accountingAdjustment: summary.accountingAdjustment + adjustment,
    reviewBalance: Math.max(0, input.reviewFee - current.paid), refundBalance: refundDue - refundNow,
    income: summary.income + recovery, expense: summary.expense - adjustment + refundNow,
  }
}

export async function recordExpenseCompensation(tx: Prisma.TransactionClient, auth: AuthData, repair: Repair & { client: { name: string } }, action: ReturnType<typeof planCancellation>['actions'][number], operationKey: string, payload: string) {
  if (!action.amount) return
  const correction = action.disposition === 'NOT_PURCHASED'
  return tx.cashMovement.create({ data: {
    businessId: repair.businessId, repairId: repair.id, clientName: repair.client.name, origin: 'REPAIR',
    type: correction ? 'EXPENSE' : 'INCOME', amount: correction ? -action.amount : action.amount,
    method: correction ? null : action.method, accountingOnly: correction,
    repairFinanceKind: correction ? 'EXPENSE_CORRECTION' : 'SUPPLIER_REFUND', relatedMovementId: action.movementId,
    operationKey, operationPayload: payload, performedByUserId: auth.userId, reason: action.reason ?? null,
    description: `${correction ? 'Ajuste sin movimiento de dinero' : 'Devolución real de proveedor'} reparación #${repair.number}`,
  } })
}

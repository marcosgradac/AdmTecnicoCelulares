import { z } from 'zod'
import { PaymentMethod, Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { repairResponse } from './repair-response'
import { authOf, requirePermission } from '../../middlewares/auth'
import type { Express, Response } from 'express'
import { includeRepair } from './repair-query'
import { cancelFinanceSchema, financialRequestId, financeError, ledgerVersion, lockRepair, operationPayload, planCancellation, readRepairLedger, recordExpenseCompensation, requireFinancialWriter, validatePaymentEvidence, withRepairLedger } from './repair-ledger'

const failure = (error: unknown, res: Response) => {
  const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 500
  return res.status(status).json({ success: false, message: error instanceof Error && status !== 500 ? error.message : 'No pudimos registrar la operación financiera' })
}
const transactionOptions = { timeout: 15000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }

export function registerRepairCancellationRoutes(app: Express) {
  for (const preview of [true, false]) app.post(`/api/repairs/:id/${preview ? 'cancel-preview' : 'cancel'}`, requirePermission('repairs.changeStatus'), async (req, res) => {
    const parsed = cancelFinanceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message ?? 'Datos de cancelación inválidos' })
    const auth = authOf(req), repairId = String(req.params.id), input = parsed.data
    try {
      const result = await prisma.$transaction(async tx => {
        await lockRepair(tx, auth.businessId, repairId)
        const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId }, include: { client: true } })
        if (!current) throw financeError(404, 'Reparación no encontrada')
        const payload = operationPayload(input)
        if (current.status === 'CANCELLED') {
          if (!preview && current.cancellationRequestId === input.requestId && current.cancellationRequestPayload === payload) return withRepairLedger(tx, await tx.repair.findUniqueOrThrow({ where: { id: repairId }, include: includeRepair }))
          throw financeError(409, 'La reparación ya fue cancelada; usá su liquidación pendiente o conciliación explícita')
        }
        const usedRequest = await tx.repair.findFirst({ where: { businessId: auth.businessId, cancellationRequestId: input.requestId, id: { not: repairId } }, select: { id: true } })
        if (usedRequest) throw financeError(409, 'El identificador ya corresponde a otra cancelación')
        const rows = await readRepairLedger(tx, auth.businessId, repairId)
        const version = ledgerVersion(current, rows)
        if (!preview && input.expectedVersion && input.expectedVersion !== version) throw financeError(409, 'La liquidación cambió desde la vista previa. Revisala nuevamente antes de confirmar.')
        if (current.paid > 0 || input.reviewFee > 0 || rows.length > 0 || input.expenses.length > 0) requireFinancialWriter(auth)
        await validatePaymentEvidence(tx, current, rows)
        const plan = planCancellation(current, rows, input)
        if (preview) return { version, projectedNet: plan.projectedNet, projectedCashNet: plan.projectedCashNet, accountingAdjustment: plan.accountingAdjustment, income: plan.income, expense: plan.expense, reviewBalance: plan.reviewBalance, refundBalance: plan.refundBalance, refundNow: plan.refundNow }
        for (const action of plan.actions) await recordExpenseCompensation(tx, auth, current, action, `cancel:${input.requestId}:expense:${action.movementId}`, payload)
        let refundMovementId: string | null = null
        if (plan.refundNow > 0) {
          const movement = await tx.cashMovement.create({ data: {
            businessId: auth.businessId, repairId, clientName: current.client.name, type: 'EXPENSE', origin: 'REPAIR',
            description: `Devolución real al cliente por cancelación #${current.number}`, amount: plan.refundNow, method: input.refundMethod,
            repairFinanceKind: 'CUSTOMER_REFUND', operationKey: `cancel:${input.requestId}:customer-refund`, operationPayload: payload, performedByUserId: auth.userId,
          } })
          refundMovementId = movement.id
        }
        await tx.repair.update({ where: { id: repairId, businessId: auth.businessId }, data: {
          status: 'CANCELLED', cancelledAt: new Date(), trackingEnabled: false,
          cancellationPaidAmount: current.paid, cancellationReviewFee: input.reviewFee, cancellationReviewPaid: 0,
          cancellationRefundAmount: plan.refundDue, cancellationRefundPaid: plan.refundNow,
          cancellationRefundMethod: plan.refundNow ? input.refundMethod ?? null : null, cancellationRefundMovementId: refundMovementId,
          cancellationRequestId: input.requestId, cancellationRequestPayload: payload,
        } })
        await tx.repairStatusHistory.create({ data: {
          repairId, previousStatus: current.status, newStatus: 'CANCELLED', changedByUserId: auth.userId,
          internalNote: `Liquidación financiera: revisión ${input.reviewFee}; cobrado ${current.paid}; devuelto realmente ${plan.refundNow}; devolución pendiente ${plan.refundBalance}; ajuste sin dinero ${plan.accountingAdjustment}. Repuestos: ${input.expenses.map(item => `${item.movementId}: ${item.disposition}${item.stockDisposition ? ` / ${item.stockDisposition}` : ''}`).join('; ') || 'sin gastos registrados'}`,
        } })
        return withRepairLedger(tx, await tx.repair.findUniqueOrThrow({ where: { id: repairId }, include: includeRepair }))
      }, transactionOptions)
      return res.json(preview ? result : repairResponse(auth, result))
    } catch (error) { return failure(error, res) }
  })

  const settlementSchema = z.object({ requestId: financialRequestId, amount: z.number().int().min(1).max(2_147_483_647), method: z.nativeEnum(PaymentMethod), confirmed: z.literal(true) }).strict()
  for (const refund of [false, true]) app.post(`/api/repairs/:id/${refund ? 'cancellation-refund' : 'cancellation-payment'}`, requirePermission('repairs.viewFinancials'), requirePermission('cash.create'), async (req, res) => {
    const parsed = settlementSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Confirmá el movimiento real, su importe, medio y solicitud' })
    const auth = authOf(req), repairId = String(req.params.id), input = parsed.data
    try {
      const result = await prisma.$transaction(async tx => {
        await lockRepair(tx, auth.businessId, repairId)
        const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId }, include: { client: true } })
        if (!current) throw financeError(404, 'Reparación no encontrada')
        if (current.status !== 'CANCELLED' || current.cancellationPaidAmount === null) throw financeError(409, 'La reparación necesita una liquidación de cancelación explícita')
        const key = `${refund ? 'customer-refund' : 'review-payment'}:${input.requestId}`, payload = operationPayload(input)
        const previous = await tx.cashMovement.findUnique({ where: { businessId_operationKey: { businessId: auth.businessId, operationKey: key } } })
        if (previous) {
          if (previous.repairId !== repairId || previous.operationPayload !== payload) throw financeError(409, 'El identificador ya corresponde a otra operación')
          return withRepairLedger(tx, await tx.repair.findUniqueOrThrow({ where: { id: repairId }, include: includeRepair }))
        }
        const refunded = current.cancellationRefundPaid ?? (current.cancellationRefundMovementId ? current.cancellationRefundAmount ?? 0 : 0)
        const balance = refund ? (current.cancellationRefundAmount ?? 0) - refunded : (current.cancellationReviewFee ?? 0) - current.cancellationPaidAmount - current.cancellationReviewPaid
        if (balance <= 0) throw financeError(409, 'La liquidación ya fue registrada por completo')
        if (input.amount > balance) throw financeError(400, 'El importe supera el saldo pendiente')
        const movement = await tx.cashMovement.create({ data: {
          businessId: auth.businessId, repairId, clientName: current.client.name, origin: 'REPAIR', type: refund ? 'EXPENSE' : 'INCOME',
          description: `${refund ? 'Devolución real al cliente' : 'Cobro revisión'} reparación #${current.number}`, amount: input.amount, method: input.method,
          repairFinanceKind: refund ? 'CUSTOMER_REFUND' : 'REVIEW_PAYMENT', operationKey: key, operationPayload: payload, performedByUserId: auth.userId,
        } })
        await tx.repair.update({ where: { id: repairId, businessId: auth.businessId }, data: refund
          ? { cancellationRefundPaid: refunded + input.amount, cancellationRefundMethod: input.method, cancellationRefundMovementId: current.cancellationRefundMovementId ?? movement.id }
          : { cancellationReviewPaid: { increment: input.amount } } })
        if (!refund) await tx.payment.create({ data: { businessId: auth.businessId, repairId, clientId: current.clientId, amount: input.amount, method: input.method, cancellationReview: true, note: `Cobro revisión reparación #${current.number}`, cashMovementId: movement.id } })
        await tx.repairStatusHistory.create({ data: { repairId, previousStatus: current.status, newStatus: current.status, changedByUserId: auth.userId, internalNote: `Liquidación financiera: ${refund ? 'devolución real' : 'cobro real de revisión'} ${input.amount}, movimiento ${movement.id}` } })
        return withRepairLedger(tx, await tx.repair.findUniqueOrThrow({ where: { id: repairId }, include: includeRepair }))
      }, transactionOptions)
      return res.json(repairResponse(auth, result))
    } catch (error) { return failure(error, res) }
  })

  app.delete('/api/repairs/:id', requirePermission('repairs.delete'), async (req, res) => {
    const auth = authOf(req), repairId = String(req.params.id)
    try {
      await prisma.$transaction(async tx => {
        await lockRepair(tx, auth.businessId, repairId)
        const repair = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId }, select: { id: true, paid: true, status: true, _count: { select: { payments: true, parts: true, inventoryMovements: true, warrantyClaims: true, photos: true } } } })
        if (!repair) throw financeError(404, 'Reparación no encontrada')
        const cash = await tx.cashMovement.count({ where: { repairId, businessId: auth.businessId } })
        if (repair.status === 'CANCELLED' || repair.status === 'DELIVERED' || repair.paid || cash || Object.values(repair._count).some(Boolean)) throw financeError(409, 'La reparación tiene historial o actividad registrada. Cancelala en lugar de borrarla.')
        await tx.repair.delete({ where: { id: repairId } })
      }, transactionOptions)
      return res.json({ success: true })
    } catch (error) { return failure(error, res) }
  })
}

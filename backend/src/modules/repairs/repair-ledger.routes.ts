import { z } from 'zod'
import { PaymentMethod, Prisma } from '@prisma/client'
import type { Express } from 'express'
import { prisma } from '../../lib/prisma'
import { authOf, requirePermission } from '../../middlewares/auth'
import { includeRepair } from './repair-query'
import { repairResponse } from './repair-response'
import { financialRequestId, financeError, isPartsExpense, lockRepair, operationPayload, planCancellation, readRepairLedger, recordExpenseCompensation, remainingExpense, withRepairLedger } from './repair-ledger'

const operationSchema = z.object({
  requestId: financialRequestId, kind: z.enum(['PURCHASE', 'SUPPLIER_REFUND', 'EXPENSE_CORRECTION']),
  amount: z.number().int().min(1).max(2_147_483_647), confirmed: z.literal(true),
  method: z.nativeEnum(PaymentMethod).optional(), movementId: z.string().min(1).optional(), reason: z.string().trim().min(5).max(500).optional(),
}).strict()

export function registerRepairLedgerRoutes(app: Express) {
  app.post('/api/repairs/:id/financial-operations', requirePermission('repairs.viewFinancials'), requirePermission('cash.create'), async (req, res) => {
    const parsed = operationSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Confirmá la operación real y sus datos' })
    const auth = authOf(req), repairId = String(req.params.id), input = parsed.data
    try {
      const result = await prisma.$transaction(async tx => {
        await lockRepair(tx, auth.businessId, repairId)
        const repair = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId }, include: { client: true } })
        if (!repair) throw financeError(404, 'Reparación no encontrada')
        const key = `repair-operation:${input.requestId}`, payload = operationPayload(input)
        const previous = await tx.cashMovement.findUnique({ where: { businessId_operationKey: { businessId: auth.businessId, operationKey: key } } })
        if (previous) {
          if (previous.repairId !== repairId || previous.operationPayload !== payload) throw financeError(409, 'El identificador ya corresponde a otra operación')
        } else if (input.kind === 'PURCHASE') {
          if (repair.status === 'CANCELLED') throw financeError(409, 'Una reparación cancelada no admite nuevas compras')
          if (!input.method || input.movementId) throw financeError(400, 'La compra necesita medio de pago y no compensa otro movimiento')
          await tx.cashMovement.create({ data: { businessId: auth.businessId, repairId, clientName: repair.client.name, origin: 'REPAIR', type: 'EXPENSE', amount: input.amount, method: input.method, description: `Compra real repuestos reparación #${repair.number}`, repairFinanceKind: 'PURCHASE', performedByUserId: auth.userId, operationKey: key, operationPayload: payload } })
        } else {
          const rows = await readRepairLedger(tx, auth.businessId, repairId)
          const original = rows.find(row => row.id === input.movementId && row.id !== repair.cancellationRefundMovementId && isPartsExpense(row))
          if (!original) throw financeError(400, 'Indicá el gasto original de esta reparación')
          const remaining = remainingExpense(original, rows)
          const decisions = rows.filter(row => isPartsExpense(row) && row.id !== repair.cancellationRefundMovementId).filter(row => remainingExpense(row, rows) > 0).map(row => row.id === original.id
            ? { movementId: row.id, disposition: input.kind === 'EXPENSE_CORRECTION' ? 'NOT_PURCHASED' as const : input.amount === remaining ? 'REFUND_FULL' as const : 'REFUND_PARTIAL' as const, amount: input.amount, confirmed: true, method: input.method, reason: input.reason }
            : { movementId: row.id, disposition: 'KEEP' as const, stockDisposition: 'LOST' as const })
          if (input.amount > remaining || input.kind === 'EXPENSE_CORRECTION' && input.amount !== remaining) throw financeError(400, 'La corrección debe anular el saldo completo de un gasto inexistente; la recuperación no puede excederlo')
          const action = planCancellation(repair, rows, { requestId: input.requestId, reviewFee: 0, refundConfirmed: false, expenses: decisions }).actions.find(item => item.movementId === original.id)!
          await recordExpenseCompensation(tx, auth, repair, action, key, payload)
        }
        if (!previous) await tx.repairStatusHistory.create({ data: { repairId, previousStatus: repair.status, newStatus: repair.status, changedByUserId: auth.userId, internalNote: `Liquidación financiera: ${input.kind}, importe ${input.amount}, solicitud ${input.requestId}${input.reason ? `, motivo ${input.reason}` : ''}` } })
        return withRepairLedger(tx, await tx.repair.findUniqueOrThrow({ where: { id: repairId }, include: includeRepair }))
      }, { timeout: 15000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
      return res.json(repairResponse(auth, result))
    } catch (error) {
      const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 500
      return res.status(status).json({ success: false, message: error instanceof Error && status !== 500 ? error.message : 'No pudimos registrar la operación' })
    }
  })
}

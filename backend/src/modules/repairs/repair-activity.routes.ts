import { z } from 'zod'
import { PaymentMethod, Prisma, RepairStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { financeError, financialRequestId, lockRepair, operationPayload } from './repair-ledger'
import { repairHistoryResponse } from './repair-response'
import { generateTrackingToken } from '../tracking/tracking-token'
import { isTrackingExpired, TRACKING_EXPIRED_CODE, trackingExpiredError } from '../tracking/tracking-expiry'
import { authOf, requirePermission } from '../../middlewares/auth'
import { assertWithinLimitTx, lockBusinessQuota, PlanLimitError } from '../billing/billing.service'
import type { Express } from 'express'

export function registerRepairActivityRoutes(app: Express) {
  app.post('/api/repairs/:id/payments', requirePermission('repairs.viewFinancials'), requirePermission('cash.create'), async (req, res) => {
    const parsed = z.object({ requestId: financialRequestId, confirmed: z.literal(true), amount: z.number().int().positive().max(2_147_483_647), method: z.nativeEnum(PaymentMethod), note: z.string().max(500).optional() }).strict().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de pago inválidos' })
    const auth = authOf(req), repairId = String(req.params.id), input = parsed.data
    try {
      const payment = await prisma.$transaction(async tx => {
        await lockRepair(tx, auth.businessId, repairId)
        const repair = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId }, include: { client: true } })
        if (!repair) throw financeError(404, 'Reparación no encontrada')
        const key = input.requestId ? 'payment:' + input.requestId : null, payload = operationPayload(input)
        if (key) {
          const previous = await tx.cashMovement.findUnique({ where: { businessId_operationKey: { businessId: auth.businessId, operationKey: key } } })
          if (previous) {
            if (previous.repairId !== repairId || previous.operationPayload !== payload) throw financeError(409, 'El identificador ya corresponde a otra operación')
            return tx.payment.findFirstOrThrow({ where: { businessId: auth.businessId, cashMovementId: previous.id } })
          }
        }
        if (repair.status === RepairStatus.CANCELLED) throw financeError(409, 'La reparación está cancelada y no admite nuevos pagos')
        if (input.amount > repair.total - repair.paid) throw financeError(409, 'El pago supera el saldo pendiente')
        await tx.repair.update({ where: { id: repairId }, data: { paid: { increment: input.amount } } })
        const movement = await tx.cashMovement.create({ data: { businessId: auth.businessId, type: 'INCOME', origin: 'REPAIR', description: 'Pago reparación #' + repair.number, amount: input.amount, method: input.method, repairId, clientName: repair.client.name, repairFinanceKind: 'PAYMENT', operationKey: key, operationPayload: payload, performedByUserId: auth.userId } })
        return tx.payment.create({ data: { businessId: auth.businessId, amount: input.amount, method: input.method, note: input.note, repairId, clientId: repair.clientId, cashMovementId: movement.id } })
      }, { timeout: 15000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
      return res.status(201).json(payment)
    } catch (error) {
      const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 500
      return res.status(status).json({ success: false, message: error instanceof Error && status !== 500 ? error.message : 'No pudimos registrar el pago' })
    }
  })
  app.get('/api/repairs/:id/payments', requirePermission('repairs.viewFinancials'), async (req, res) => {
    const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, select: { id: true } })
    if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
    return res.json(await prisma.payment.findMany({ where: { repairId: repair.id, businessId: authOf(req).businessId }, orderBy: { createdAt: 'desc' } }))
  })

  app.get('/api/repairs/:id/history', requirePermission('repairs.view'), async (req, res) => {
    const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, select: { id: true } })
    if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
    return res.json(repairHistoryResponse(authOf(req), await prisma.repairStatusHistory.findMany({ where: { repairId: repair.id }, orderBy: { createdAt: 'desc' } })))
  })

  app.post('/api/repairs/:id/tracking-link', requirePermission('repairs.shareTracking'), async (req, res) => {
    const businessId = authOf(req).businessId
    try {
      const updated = await prisma.$transaction(async tx => {
        await lockBusinessQuota(tx, businessId)
        const now = new Date()
        await assertWithinLimitTx(tx, businessId, 'trackingLinks', now)
        const repair = await tx.repair.findFirst({ where: { id: String(req.params.id), businessId }, select: { id: true, status: true, trackingExpiresAt: true } })
        if (!repair) return null
        if (isTrackingExpired(repair.trackingExpiresAt)) throw trackingExpiredError()
        // Regeneration preserves the existing expiration exactly.
        return tx.repair.update({ where: { id: repair.id }, data: { trackingToken: generateTrackingToken(), trackingEnabled: true, trackingCreatedAt: now }, select: { trackingToken: true, trackingEnabled: true, trackingExpiresAt: true } })
      }, { timeout: 15_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
      if (!updated) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
      return res.json(updated)
    } catch (error) {
      if (error instanceof PlanLimitError) return res.status(error.statusCode).json({ success: false, message: error.message })
      if (error instanceof Error && 'code' in error && error.code === TRACKING_EXPIRED_CODE) {
        const expired = trackingExpiredError()
        return res.status(expired.statusCode).json({ success: false, code: expired.code, message: expired.message })
      }
      throw error
    }
  })

  app.patch('/api/repairs/:id/tracking-link', requirePermission('repairs.shareTracking'), async (req, res) => {
    const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, select: { id: true } })
    if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
    return res.json(await prisma.repair.update({ where: { id: repair.id }, data: { trackingEnabled: false }, select: { trackingToken: true, trackingEnabled: true } }))
  })

}

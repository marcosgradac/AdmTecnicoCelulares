import { z } from 'zod'
import { PaymentMethod, Prisma, RepairStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { repairHistoryResponse } from './repair-response'
import { generateTrackingToken } from '../tracking/tracking-token'
import { isTrackingExpired, TRACKING_EXPIRED_CODE, trackingExpiredError } from '../tracking/tracking-expiry'
import { authOf, requirePermission } from '../../middlewares/auth'
import { assertWithinLimitTx, lockBusinessQuota, PlanLimitError } from '../billing/billing.service'
import type { Express } from 'express'

export function registerRepairActivityRoutes(app: Express) {
  app.post('/api/repairs/:id/payments', requirePermission('repairs.viewFinancials'), async (req, res) => {
    const parsed = z.object({ amount: z.number().int().positive(), method: z.nativeEnum(PaymentMethod), note: z.string().optional() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de pago inválidos' })
    const businessId = authOf(req).businessId
    const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId }, include: { client: true } })
    if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
    if (repair.status === RepairStatus.CANCELLED) return res.status(409).json({ success: false, message: 'La reparación está cancelada y no admite nuevos pagos' })
    const payment = await prisma.$transaction(async tx => {
      const changed = await tx.repair.updateMany({
        where: { id: repair.id, businessId, total: repair.total, status: { not: RepairStatus.CANCELLED }, paid: { lte: repair.total - parsed.data.amount } },
        data: { paid: { increment: parsed.data.amount } },
      })
      if (changed.count !== 1) return null
      // El pago y su ingreso de caja quedan vinculados por ID, no sólo por descripción.
      const movement = await tx.cashMovement.create({ data: { businessId, type: 'INCOME', origin: 'REPAIR', description: `Pago reparación #${repair.number}`, amount: parsed.data.amount, method: parsed.data.method, repairId: repair.id, clientName: repair.client.name } })
      const created = await tx.payment.create({ data: { businessId, ...parsed.data, repairId: repair.id, clientId: repair.clientId, cashMovementId: movement.id } })
      return created
    })
    return payment
      ? res.status(201).json(payment)
      : res.status(409).json({ success: false, message: 'El pago supera el saldo pendiente' })
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

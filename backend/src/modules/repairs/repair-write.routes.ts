import { z } from 'zod'
import { Prisma, RepairStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { allocateRepairNumber } from '../../lib/repair-number'
import { repairResponse } from './repair-response'
import { editRepairInTransaction, editRepairSchema } from './repair-edit'
import { initialRepairFinanceSchema, recordInitialRepairFinance, RepairFinanceError } from './repair-finance'
import { generateTrackingToken } from '../tracking/tracking-token'
import { trackingExpiryFrom } from '../tracking/tracking-expiry'
import { authOf, requirePermission } from '../../middlewares/auth'
import { assertWithinLimitTx, lockBusinessQuota, PlanLimitError } from '../billing/billing.service'
import type { Express } from 'express'
import { includeRepair } from './repair-query'

export function registerRepairWriteRoutes(app: Express) {
  const createRepairSchema = initialRepairFinanceSchema.extend({
    clientId: z.string().min(1),
    deviceBrand: z.string().trim().min(1), deviceModel: z.string().trim().min(1), imei: z.string().optional(),
    color: z.string().optional(), issue: z.string().trim().min(2), diagnosis: z.string().optional(),
    notes: z.string().optional(), estimatedDeliveryDate: z.coerce.date().optional(), status: z.nativeEnum(RepairStatus).default(RepairStatus.RECEIVED)
    , warrantyEnabled: z.boolean().default(false), warrantyDurationDays: z.number().int().min(1).max(365).optional()
  }).superRefine((data, context) => {
    if (data.advanceAmount > data.total) context.addIssue({ code: 'custom', path: ['advanceAmount'], message: 'El adelanto no puede superar el total al cliente' })
    if (data.advanceAmount > 0 && !data.advanceMethod) context.addIssue({ code: 'custom', path: ['advanceMethod'], message: 'Seleccioná el medio de pago del adelanto' })
    // El gasto inicial es un egreso propio: con costo cargando necesita su medio de pago.
    if (data.partsCost > 0 && !data.partsCostMethod) context.addIssue({ code: 'custom', path: ['partsCostMethod'], message: 'Seleccioná el medio de pago del gasto' })
    if (data.advanceAmount > 0 && data.status === RepairStatus.CANCELLED) context.addIssue({ code: 'custom', path: ['status'], message: 'Una reparación cancelada no admite adelantos' })
  })
  app.post('/api/repairs', requirePermission('repairs.create'), async (req, res) => {
    const parsed = createRepairSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos' })
    const auth = authOf(req)
    if ((parsed.data.partsCost > 0 || parsed.data.laborCharge > 0 || parsed.data.advanceAmount > 0)
      && auth.role !== 'OWNER' && !auth.permissions?.includes('repairs.viewFinancials')) {
      return res.status(403).json({ success: false, message: 'No tenés permisos para registrar costos o adelantos' })
    }
    const businessId = authOf(req).businessId
    try {
      const data = parsed.data
      const repair = await prisma.$transaction(async tx => {
        await lockBusinessQuota(tx, businessId)
        const now = new Date()
        await assertWithinLimitTx(tx, businessId, 'repairs', now)
        let trackingAllowed = true
        try { await assertWithinLimitTx(tx, businessId, 'trackingLinks', now) } catch (error) {
          if (!(error instanceof PlanLimitError) || error.resource !== 'trackingLinks') throw error
          trackingAllowed = false
        }
        const client = await tx.client.findFirst({ where: { id: data.clientId, businessId, deletedAt: null } })
        if (!client) throw Object.assign(new Error('El cliente seleccionado fue eliminado o no está disponible.'), { statusCode: 404 })
        const number = await allocateRepairNumber(tx, businessId)
        const deliveredAt = data.status === RepairStatus.DELIVERED ? new Date() : null
        const warrantyStartedAt = data.warrantyEnabled && deliveredAt ? deliveredAt : null
        const warrantyExpiresAt = warrantyStartedAt && data.warrantyDurationDays ? new Date(warrantyStartedAt.getTime() + data.warrantyDurationDays * 86_400_000) : null
        // Si la reparación nace entregada, el enlace vence con la misma regla de siempre.
        const trackingExpiresAt = trackingExpiryFrom(deliveredAt, data.warrantyEnabled)
        const created = await tx.repair.create({ data: { businessId, number, clientId: client.id, deviceId: null, deviceBrand: data.deviceBrand, deviceModel: data.deviceModel, imei: data.imei?.replace(/[\s-]/g, '') || null, color: data.color?.trim() || null, issue: data.issue, diagnosis: data.diagnosis?.trim() || null, notes: data.notes?.trim() || null, total: data.total, partsCost: data.partsCost, laborCharge: data.laborCharge, estimatedDeliveryDate: data.estimatedDeliveryDate, status: data.status, trackingToken: trackingAllowed ? generateTrackingToken() : null, trackingEnabled: trackingAllowed, trackingCreatedAt: trackingAllowed ? new Date() : null, trackingExpiresAt, deliveredAt, warrantyEnabled: data.warrantyEnabled, warrantyDurationDays: data.warrantyEnabled ? data.warrantyDurationDays : null, warrantyStartedAt, warrantyExpiresAt } })
        await recordInitialRepairFinance(tx, created, client.name, data)
        return tx.repair.findUniqueOrThrow({ where: { id: created.id }, include: includeRepair })
      }, { timeout: 15_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
      return res.status(201).json(repairResponse(authOf(req), repair))
    } catch (error) {
      const status = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
      return res.status(status).json({ success: false, message: error instanceof Error && status !== 500 ? error.message : 'Error creando reparación' })
    }
  })

  app.patch('/api/repairs/:id/edit', requirePermission('repairs.update'), async (req, res) => {
    const parsed = editRepairSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message ?? 'Datos de reparación inválidos' })
    const auth = authOf(req), repairId = String(req.params.id)
    try {
      const repair = await prisma.$transaction(async tx => {
        await editRepairInTransaction(tx, auth, repairId, parsed.data)
        return tx.repair.findUniqueOrThrow({ where: { id: repairId, businessId: auth.businessId }, include: includeRepair })
      }, { timeout: 15_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
      return res.json(repairResponse(auth, repair))
    } catch (error) {
      if (error instanceof RepairFinanceError) return res.status(error.statusCode).json({ success: false, message: error.message })
      return res.status(500).json({ success: false, message: 'No pudimos guardar los cambios de la reparación.' })
    }
  })

  const updateRepairSchema = z.object({
    clientId: z.string().min(1).optional(), deviceBrand: z.string().trim().min(1), deviceModel: z.string().trim().min(1),
    imei: z.string().trim().optional().nullable(), color: z.string().trim().optional().nullable(), issue: z.string().trim().min(2),
    diagnosis: z.string().trim().optional().nullable(), notes: z.string().trim().optional().nullable(), total: z.number().int().nonnegative()
  })
  app.patch('/api/repairs/:id', requirePermission('repairs.update'), async (req, res) => {
    const parsed = updateRepairSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de reparación inválidos' })
    const businessId = authOf(req).businessId
    const current = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId } })
    if (!current) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
    if (parsed.data.total < current.paid) return res.status(400).json({ success: false, message: 'El total no puede ser menor que el importe pagado' })
    if (parsed.data.clientId && !await prisma.client.findFirst({ where: { id: parsed.data.clientId, businessId, deletedAt: null } })) return res.status(400).json({ success: false, message: 'El cliente seleccionado fue eliminado o no está disponible.' })
    const repair = await prisma.repair.update({ where: { id: current.id }, data: { ...parsed.data, imei: parsed.data.imei || null, color: parsed.data.color || null, diagnosis: parsed.data.diagnosis || null, notes: parsed.data.notes || null }, include: includeRepair })
    return res.json(repairResponse(authOf(req), repair))
  })
}

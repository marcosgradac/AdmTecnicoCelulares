import { Prisma, RepairStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { repairResponse } from './repair-response'
import { advanceCorrectionNote, correctInitialRepairAdvance, correctInitialRepairCost, initialCostCorrectionNote, repairAdvanceSchema, repairInitialCostSchema, RepairFinanceError } from './repair-finance'
import { statusError } from './repair-status'
import { authOf, requirePermission } from '../../middlewares/auth'
import type { Express } from 'express'
import { includeRepair } from './repair-query'
import { statusFailure } from './repair-status-execution'

export function registerRepairFinanceRoutes(app: Express) {
  app.patch('/api/repairs/:id/advance', requirePermission('repairs.viewFinancials'), async (req, res) => {
    const parsed = repairAdvanceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message ?? 'Datos de adelanto inválidos' })
    const auth = authOf(req)
    const repairId = String(req.params.id)
    try {
      const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "id" = ${repairId} AND "businessId" = ${auth.businessId} FOR UPDATE`
        const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId }, include: { client: true } })
        if (!current) throw statusError(404, 'Reparación no encontrada')
        if (current.status === RepairStatus.CANCELLED) throw statusError(409, 'Una reparación cancelada no se edita: su liquidación tiene su propio flujo.')
        const { previousAmount } = await correctInitialRepairAdvance(tx, current, current.client.name, parsed.data)
        // El historial interno deja el rastro exacto de la corrección del importe.
        if (previousAmount !== parsed.data.amount) {
          await tx.repairStatusHistory.create({
            data: {
              repairId: current.id, previousStatus: current.status, newStatus: current.status, changedByUserId: auth.userId,
              internalNote: advanceCorrectionNote(previousAmount, parsed.data.amount),
            }
          })
        }
        return tx.repair.findFirst({ where: { id: current.id, businessId: auth.businessId }, include: includeRepair })
      }, { timeout: 15_000 })
      return res.json(repairResponse(authOf(req), result))
    } catch (error) {
      if (error instanceof RepairFinanceError) return res.status(error.statusCode).json({ success: false, message: error.message })
      return statusFailure(res, error, 'No pudimos corregir el adelanto')
    }
  })

  /** A workshop expense correction, independent of advance payments and client balance. */
  app.patch('/api/repairs/:id/initial-cost', requirePermission('repairs.viewFinancials'), async (req, res) => {
    const parsed = repairInitialCostSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message ?? 'Datos de costo/gasto inválidos' })
    const auth = authOf(req)
    const repairId = String(req.params.id)
    try {
      const result = await prisma.$transaction(async tx => {
        // Serialize corrections before reading the amount/link: simultaneous 0→cost cannot duplicate Cash.
        await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "id" = ${repairId} AND "businessId" = ${auth.businessId} FOR UPDATE`
        const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId }, include: { client: true } })
        if (!current) throw new RepairFinanceError(404, 'Reparación no encontrada')
        if (current.status === RepairStatus.CANCELLED) throw new RepairFinanceError(409, 'Una reparación cancelada no admite correcciones del costo inicial: su liquidación tiene su propio flujo.')
        const { previousAmount } = await correctInitialRepairCost(tx, current, current.client.name, parsed.data)
        if (previousAmount !== parsed.data.amount) {
          await tx.repairStatusHistory.create({
            data: {
              repairId, previousStatus: current.status, newStatus: current.status, changedByUserId: auth.userId,
              internalNote: initialCostCorrectionNote(previousAmount, parsed.data.amount),
            }
          })
        }
        return tx.repair.findUniqueOrThrow({ where: { id: repairId, businessId: auth.businessId }, include: includeRepair })
      }, { timeout: 15_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
      return res.json(repairResponse(auth, result))
    } catch (error) {
      if (error instanceof RepairFinanceError) return res.status(error.statusCode).json({ success: false, message: error.message })
      return statusFailure(res, error, 'No pudimos corregir el costo/gasto')
    }
  })

}

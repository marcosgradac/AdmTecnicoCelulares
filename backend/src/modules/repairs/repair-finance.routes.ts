import { Prisma, RepairStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { repairResponse } from './repair-response'
import { advanceCorrectionNote, correctInitialRepairAdvance, repairAdvanceSchema, RepairFinanceError } from './repair-finance'
import { statusError } from './repair-status'
import { authOf, requirePermission } from '../../middlewares/auth'
import type { Express } from 'express'
import { withRepairLedger } from './repair-ledger'
import { includeRepair } from './repair-query'
import { statusFailure } from './repair-status-execution'

export function registerRepairFinanceRoutes(app: Express) {
  app.patch('/api/repairs/:id/advance', requirePermission('repairs.viewFinancials'), requirePermission('cash.create'), async (req, res) => {
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
        const existingPayments = await tx.payment.count({ where: { businessId: auth.businessId, repairId: current.id, isAdvance: true } })
        if (existingPayments) throw new RepairFinanceError(409, 'No se modifica ni elimina un adelanto cobrado. Usá la liquidación real para conservar el historial.')
        const { previousAmount } = await correctInitialRepairAdvance(tx, current, current.client.name, parsed.data, auth.userId)
        // El historial interno deja el rastro exacto de la corrección del importe.
        if (previousAmount !== parsed.data.amount) {
          await tx.repairStatusHistory.create({
            data: {
              repairId: current.id, previousStatus: current.status, newStatus: current.status, changedByUserId: auth.userId,
              internalNote: advanceCorrectionNote(previousAmount, parsed.data.amount),
            }
          })
        }
        return withRepairLedger(tx, await tx.repair.findFirstOrThrow({ where: { id: current.id, businessId: auth.businessId }, include: includeRepair }))
      }, { timeout: 15_000 })
      return res.json(repairResponse(authOf(req), result))
    } catch (error) {
      if (error instanceof RepairFinanceError) return res.status(error.statusCode).json({ success: false, message: error.message })
      return statusFailure(res, error, 'No pudimos corregir el adelanto')
    }
  })

  /** A workshop expense correction, independent of advance payments and client balance. */
  app.patch('/api/repairs/:id/initial-cost', requirePermission('repairs.viewFinancials'), async (req, res) => {
    const current = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, select: { id: true } })
    if (!current) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
    return res.status(409).json({ success: false, message: 'El gasto original se conserva. Usá financial-operations para una compra, devolución real o corrección sin dinero.' })
  })

}

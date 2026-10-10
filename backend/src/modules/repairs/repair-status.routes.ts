import { type Request, type Response } from 'express'
import { z } from 'zod'
import { RepairStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { repairResponse } from './repair-response'
import { deliveredLockedMessage, isSpecialRepairStatus, nextRepairStatus, previousRepairStatus, statusError } from './repair-status'
import { authOf, requirePermission, requireRole } from '../../middlewares/auth'
import type { Express } from 'express'
import { includeRepair } from './repair-query'
import { executeStatusChange, statusFailure, statusMessagesSchema } from './repair-status-execution'

export function registerRepairStatusRoutes(app: Express) {
  const advanceStatus = 'advance' as const
  const rewindStatus = 'rewind' as const
  const noStatusStepMessage = (action: string, status: RepairStatus) => {
    if (isSpecialRepairStatus(status)) return 'Una reparación en estado especial no se mueve con el flujo normal.'
    if (status === RepairStatus.DELIVERED) return deliveredLockedMessage
    return action === advanceStatus ? 'La reparación ya está en el último estado del flujo.' : 'La reparación ya está en el primer estado del flujo.'
  }
  const statusStepRoute = (action: typeof advanceStatus | typeof rewindStatus) => async (req: Request, res: Response) => {
    const parsed = statusMessagesSchema.safeParse(req.body ?? {})
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de estado inválidos' })
    const auth = authOf(req)
    const repairId = String(req.params.id)
    try {
      const result = await executeStatusChange(auth, repairId, current => {
        const target = action === advanceStatus ? nextRepairStatus(current) : previousRepairStatus(current)
        if (!target) throw statusError(409, noStatusStepMessage(action, current))
        return target
      }, parsed.data)
      return res.json(repairResponse(authOf(req), result))
    } catch (error) {
      return statusFailure(res, error, 'No pudimos actualizar el estado')
    }
  }
  app.patch('/api/repairs/:id/status/advance', requirePermission('repairs.changeStatus'), statusStepRoute(advanceStatus))
  app.patch('/api/repairs/:id/status/rewind', requirePermission('repairs.changeStatus'), statusStepRoute(rewindStatus))

  app.patch('/api/repairs/:id/status', requirePermission('repairs.changeStatus'), async (req, res) => {
    const parsed = z.object({ status: z.nativeEnum(RepairStatus), ...statusMessagesSchema.shape }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Estado inválido' })
    if (parsed.data.status === RepairStatus.CANCELLED) return res.status(409).json({ success: false, message: 'Para cancelar una reparación con liquidación financiera usá el flujo específico: POST /api/repairs/:id/cancel' })
    const auth = authOf(req)
    const repairId = String(req.params.id)
    try {
      const result = await executeStatusChange(auth, repairId, parsed.data.status, parsed.data)
      return res.json(repairResponse(authOf(req), result))
    } catch (error) {
      return statusFailure(res, error, 'No pudimos actualizar el estado')
    }
  })

  /**
   * Corrección excepcional de entrega.
   *
   * Entregado es el final del flujo normal: esta es la única vía para volver a Listo y existe
   * sólo para una entrega cargada por error. No es un botón de navegación, exige OWNER, motivo
   * y confirmación, y deja el mismo rastro que cualquier cambio de estado. Si ya hay un reclamo
   * de garantía, deshacer la entrega dejaría la cobertura sin origen y la acción se bloquea.
   */
  app.post('/api/repairs/:id/delivery/correction', requireRole('OWNER'), async (req, res) => {
    const parsed = z.object({ reason: z.string().trim().min(5).max(500) }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Indicá el motivo de la corrección de entrega' })
    const auth = authOf(req)
    const repairId = String(req.params.id)
    try {
      const result = await prisma.$transaction(async tx => {
        const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId } })
        if (!current) throw statusError(404, 'Reparación no encontrada')
        if (current.status !== RepairStatus.DELIVERED) throw statusError(409, 'La reparación no está entregada: no hay nada que corregir.')
        const claims = await tx.warrantyClaim.count({ where: { repairId: current.id, businessId: auth.businessId } })
        if (claims > 0) throw statusError(409, 'La reparación tiene reclamos de garantía asociados. No se puede deshacer la entrega porque dejaría la cobertura sin origen.')
        // Se borra también el vencimiento del seguimiento: si la entrega fue un error, el
        // enlace vuelve a quedar activo y sin fecha límite, igual que una reparación que
        // nunca se entregó. `trackingEnabled` NO se toca, así que el mismo link revive.
        // Compare-and-swap sobre el estado: dos correcciones simultáneas no pueden aplicadas dos veces.
        const claimed = await tx.repair.updateMany({
          where: { id: current.id, businessId: auth.businessId, status: RepairStatus.DELIVERED },
          data: { status: RepairStatus.READY, deliveredAt: null, warrantyStartedAt: null, warrantyExpiresAt: null, trackingExpiresAt: null },
        })
        if (claimed.count !== 1) throw statusError(409, 'La entrega ya fue corregida por otra operación')
        await tx.repairStatusHistory.create({
          data: {
            repairId: current.id, previousStatus: RepairStatus.DELIVERED, newStatus: RepairStatus.READY, changedByUserId: auth.userId,
            internalNote: `Corrección de entrega: ${parsed.data.reason}`,
          }
        })
        return tx.repair.findFirst({ where: { id: current.id, businessId: auth.businessId }, include: includeRepair })
      }, { timeout: 15_000 })
      return res.json(repairResponse(authOf(req), result))
    } catch (error) {
      return statusFailure(res, error, 'No pudimos corregir la entrega')
    }
  })

  /**
   * Corrige el adelanto inicial de una reparación ya creada.
   *
   * Todo el trabajo ocurre en una sola transacción: Payment del adelanto, CashMovement INCOME,
   * Repair.paid y el historial. Nunca queda un segundo adelanto ni se duplica la entrada de caja.
   */
}

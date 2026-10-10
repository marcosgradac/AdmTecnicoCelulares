import { type Request, type Response } from 'express'
import { RepairStatus } from '@prisma/client'
import { repairResponse } from './repair-response'
import { authOf, requirePermission } from '../../middlewares/auth'
import type { Express } from 'express'
import { executeStatusChange, statusFailure, statusMessagesSchema } from './repair-status-execution'

export function registerRepairLegacyRoutes(app: Express) {
  const legacyStatusRoute = (target: RepairStatus) => async (req: Request, res: Response) => {
    const parsed = statusMessagesSchema.safeParse(req.body ?? {})
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de estado inválidos' })
    const auth = authOf(req)
    try {
      const result = await executeStatusChange(auth, String(req.params.id), target, parsed.data)
      return res.json(repairResponse(auth, result))
    } catch (error) {
      return statusFailure(res, error, 'No pudimos actualizar el estado')
    }
  }
  app.patch('/api/repairs/:id/approve', requirePermission('repairs.changeStatus'), legacyStatusRoute(RepairStatus.APPROVED))
  app.patch('/api/repairs/:id/start', requirePermission('repairs.changeStatus'), legacyStatusRoute(RepairStatus.REPAIRING))
}

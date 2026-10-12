import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { authOf, requirePermission } from '../../middlewares/auth'
import type { Express } from 'express'
import { deleteRepairInTransaction } from './repair-delete'

export function registerRepairDeleteRoutes(app: Express) {
  app.delete('/api/repairs/:id', requirePermission('repairs.delete'), async (req, res) => {
    const auth = authOf(req)
    try {
      await prisma.$transaction(tx => deleteRepairInTransaction(tx, auth.businessId, String(req.params.id)), { timeout: 15000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
      return res.json({ success: true })
    } catch (error) {
      const status = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
      return res.status(status).json({ success: false, message: error instanceof Error && status !== 500 ? error.message : 'No pudimos eliminar la reparación; los datos se conservaron.' })
    }
  })
}

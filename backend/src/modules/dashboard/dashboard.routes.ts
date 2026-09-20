import { Router } from 'express'
import { z } from 'zod'
import { authOf, requireRole } from '../../middlewares/auth'
import { dashboardOverview } from './dashboard.service'

export const dashboardRouter = Router()
dashboardRouter.get('/overview', requireRole('OWNER'), async (req, res) => {
  const parsed = z.object({ period: z.enum(['today', '7d', '30d', 'month']).default('month') }).safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: 'Período inválido.' })
  res.setHeader('Cache-Control', 'no-store')
  return res.json(await dashboardOverview(authOf(req).businessId, parsed.data.period))
})

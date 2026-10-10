import { prisma } from '../../lib/prisma'
import type { Express } from 'express'

export function registerPublicPlanRoutes(app: Express) {
  app.get('/api/billing/plans', async (_req, res) => res.json(await prisma.plan.findMany({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } })))
}

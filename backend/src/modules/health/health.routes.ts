import { type Request, type Response } from 'express'
import { prisma } from '../../lib/prisma'
import { healthReadinessLimiter } from '../../middlewares/security'
import type { Express } from 'express'

export function registerHealthRoutes(app: Express) {
  const healthyResponse = () => ({ status: 'ok', ok: true, environment: process.env.NODE_ENV ?? 'development', timestamp: new Date().toISOString() })
  const readiness = async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return res.status(200).json(healthyResponse())
    } catch {
      console.error('Health check: la base de datos no está disponible')
      return res.status(503).json({ status: 'error', ok: false, timestamp: new Date().toISOString() })
    }
  }
  app.get('/api/health', healthReadinessLimiter, readiness)
  app.get('/health', (_req, res) => res.status(200).json(healthyResponse()))
}

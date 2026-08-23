import type { NextFunction, Request, Response } from 'express'
import { authOf } from '../../middlewares/auth'
import { refreshSubscriptionStatus } from './billing.service'

export async function requireSubscriptionWriteAccess(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (req.path.startsWith('/billing') || req.path.startsWith('/platform-admin') || req.path === '/profile') return next()
  try {
    const subscription = await refreshSubscriptionStatus(authOf(req).businessId)
    if (subscription.status === 'SUSPENDED' || subscription.status === 'CANCELED') {
      return res.status(403).json({ success: false, code: 'SUBSCRIPTION_SUSPENDED', message: 'Tu suscripción necesita renovarse.' })
    }
    return next()
  } catch {
    return res.status(503).json({ success: false, message: 'No pudimos validar la suscripción.' })
  }
}

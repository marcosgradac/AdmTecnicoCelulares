import type { NextFunction, Request, Response } from 'express'
import { authOf } from '../../middlewares/auth'
import { getBusinessAccessStatus } from './billing.service'

/**
 * Barrera de suscripción para todo el sistema privado. Billing y platform-admin se montan antes
 * de esta capa, así que el OWNER en modo renovación conserva plan, datos de transferencia y pagos,
 * pero cualquier otra ruta (GET incluido) responde 403 mientras la suscripción esté bloqueada.
 */
export async function requireSubscriptionAccess(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith('/billing') || req.path.startsWith('/platform-admin') || req.path === '/profile') return next()
  try {
    const access = 'accountAccess' in req ? req.accountAccess : await getBusinessAccessStatus(authOf(req).businessId)
    if (access?.shouldBlock) {
      return res.status(403).json({ success: false, code: 'SUBSCRIPTION_BLOCKED', message: 'Tu suscripción necesita renovarse.' })
    }
    return next()
  } catch {
    return res.status(503).json({ success: false, message: 'No pudimos validar la suscripción.' })
  }
}

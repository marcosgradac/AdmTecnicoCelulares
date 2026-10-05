import type { NextFunction, Request, Response } from 'express'
import { authOf } from '../../middlewares/auth'
import { getBusinessAccessStatus } from './billing.service'

/**
 * Barrera estricta de suscripción para el sistema privado: si la cuenta está bloqueada, TODO lo que
 * llega a esta capa responde 403, sin excepciones por método ni por ruta.
 *
 * No necesita bypasses porque /api/billing y /api/platform-admin se montan ANTES de esta capa en
 * server.ts y por lo tanto nunca llegan acá. /api/profile tampoco queda exceptuado: se resuelve antes
 * del gate y el modo renovación ya lo rechaza en `authenticate` mediante la allowlist de renovación.
 */
export async function requireSubscriptionAccess(req: Request, res: Response, next: NextFunction) {
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

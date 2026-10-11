import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { PlatformRole, UserRole } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { permissionsFor, type Permission } from '../config/permissions'
import { getAccountAccessStatus, type AccountAccessStatus } from '../modules/billing/billing.service'
import { sessionClaims } from '../modules/auth/token-claims'

export interface AuthData { userId: string; businessId: string; role: UserRole; platformRole: PlatformRole; tokenVersion: number; permissions?: Permission[] }

declare global {
  namespace Express {
    interface Request { auth?: AuthData; accountAccess?: AccountAccessStatus | null }
  }
}

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) throw new Error('JWT_SECRET es obligatorio')

const unauthorized = (res: Response, message = 'No autorizado') =>
  res.status(401).json({ success: false, message })

export const authOf = (req: Request) => req.auth as AuthData

/**
 * Modo renovación: sólo el OWNER con bloqueo AUTOMÁTICO (suscripción vencida) conserva sesión.
 * El bloqueo MANUAL del Super Admin y cualquier otro rol siguen bloqueados.
 */
export const isRenewalMode = (role: UserRole, access: AccountAccessStatus | null | undefined) =>
  Boolean(access?.shouldBlock) && access?.blockType === 'AUTOMATIC' && role === 'OWNER'

/**
 * Rutas que una sesión en modo renovación puede usar. Todo lo demás —incluidas /api/profile,
 * /api/auth/tutorial-seen y /api/auth/password-change/*, que se resuelven antes del gate general—
 * responde 403 SUBSCRIPTION_BLOCKED.
 *
 * /api/auth/me y /api/account se comparan de forma EXACTA: sus subrutas no existen hoy, pero si
 * alguien agregara una, una sesión de renovación no debe heredarla por accidente. Sólo Billing
 * acepta subrutas. /api/account queda permitida porque la eliminación de cuenta es el derecho del
 * OWNER vencido y conserva su propia autenticación, contraseña actual y confirmación.
 */
export const isRenewalPathAllowed = (originalUrl: string) => {
  const path = originalUrl.split('?')[0].replace(/\/+$/, '') || '/'
  if (path === '/api/auth/me' || path === '/api/account') return true
  return path === '/api/billing' || path.startsWith('/api/billing/')
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : ''
  if (!token) return unauthorized(res)
  let payload: ReturnType<typeof sessionClaims.parse>
  try {
    const verified = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] })
    // Capability JWTs (deletion, password-change, etc.) are never ordinary Bearer sessions.
    if (typeof verified !== 'object' || Object.prototype.hasOwnProperty.call(verified, 'purpose')) return unauthorized(res, 'Token de propósito específico no válido para esta API')
    payload = sessionClaims.parse(verified)
  } catch { return unauthorized(res, 'Token inválido o expirado') }
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, businessId: true, role: true, platformRole: true, isActive: true, deletedAt: true, tokenVersion: true, permissions: true, business: { select: { isActive: true, subscription: true } } },
    })
    if (!user || user.deletedAt || user.businessId !== payload.businessId) return unauthorized(res, 'Sesión inválida')
    if (payload.tokenVersion !== user.tokenVersion) return unauthorized(res, 'La sesión fue invalidada')
    if (!user.isActive) return res.status(403).json({ success: false, code: 'USER_INACTIVE', message: 'Usuario inactivo' })
    if (!user.business.isActive && user.platformRole !== 'SUPER_ADMIN') return res.status(403).json({ success: false, message: 'El negocio se encuentra desactivado', code: 'BUSINESS_BLOCKED', audience: user.role })
    req.accountAccess = user.platformRole === 'SUPER_ADMIN'
      ? null
      : user.business.subscription ? await getAccountAccessStatus(user.business.subscription) : null
    // Una suscripción vencida sola (bloqueo AUTOMÁTICO) deja entrar al OWNER en modo renovación:
    // conserva su sesión normal, pero sólo para /auth/me, /billing/* y /api/account. El bloqueo
    // MANUAL del Super Admin no se saltea y ningún otro rol entra.
    if (req.accountAccess?.shouldBlock) {
      const renewal = isRenewalMode(user.role, req.accountAccess)
      if (!renewal) return res.status(403).json({ success: false, message: user.role === 'OWNER' ? 'Tu cuenta está temporalmente bloqueada' : 'El acceso de este negocio está temporalmente suspendido', code: 'SUBSCRIPTION_BLOCKED', audience: user.role })
      if (!isRenewalPathAllowed(req.originalUrl)) return res.status(403).json({ success: false, code: 'SUBSCRIPTION_BLOCKED', message: 'Tu suscripción necesita renovarse.' })
    }
    req.auth = { userId: user.id, businessId: user.businessId, role: user.role, platformRole: user.platformRole, tokenVersion: user.tokenVersion, permissions: permissionsFor(user.role, user.permissions) }
    next()
  } catch {
    return res.status(503).json({ success: false, message: 'No pudimos verificar la sesión. Intentá nuevamente.' })
  }
}

export const requireRoles = (roles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction) =>
    roles.includes(authOf(req).role)
      ? next()
      : res.status(403).json({ success: false, message: 'No tenés permisos para realizar esta acción' })

export const requireRole = (...roles: UserRole[]) => requireRoles(roles)

export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) =>
  authOf(req).platformRole === 'SUPER_ADMIN'
    ? next()
    : res.status(403).json({ success: false, message: 'No tenés permisos para realizar esta acción' })

export const requirePermission = (permission: Permission) =>
  (req: Request, res: Response, next: NextFunction) =>
    authOf(req).role === 'OWNER' || authOf(req).permissions?.includes(permission)
      ? next()
      : res.status(403).json({ success: false, message: 'No tenés permisos para realizar esta acción' })

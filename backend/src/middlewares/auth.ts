import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { PlatformRole, UserRole } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { permissionsFor, type Permission } from '../config/permissions'
import { getAccountAccessStatus, type AccountAccessStatus } from '../modules/billing/billing.service'

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

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : ''
  if (!token) return unauthorized(res)
  try {
    const payload = jwt.verify(token, jwtSecret) as AuthData
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, businessId: true, role: true, platformRole: true, isActive: true, tokenVersion: true, permissions: true, business: { select: { isActive: true, subscription: true } } },
    })
    if (!user || user.businessId !== payload.businessId) return unauthorized(res, 'Sesión inválida')
    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) return unauthorized(res, 'La sesión fue invalidada')
    if (!user.isActive) return res.status(403).json({ success: false, message: 'Usuario inactivo' })
    if (!user.business.isActive && user.platformRole !== 'SUPER_ADMIN') return res.status(403).json({ success: false, message: 'El negocio se encuentra desactivado', code: 'BUSINESS_BLOCKED', audience: user.role })
    req.accountAccess = user.business.subscription ? await getAccountAccessStatus(user.business.subscription) : null
    if (user.platformRole !== 'SUPER_ADMIN' && req.accountAccess?.shouldBlock) return res.status(403).json({ success: false, message: user.role === 'OWNER' ? 'Tu cuenta está temporalmente bloqueada' : 'El acceso de este negocio está temporalmente suspendido', code: 'SUBSCRIPTION_BLOCKED', audience: user.role })
    req.auth = { userId: user.id, businessId: user.businessId, role: user.role, platformRole: user.platformRole, tokenVersion: user.tokenVersion, permissions: permissionsFor(user.role, user.permissions) }
    next()
  } catch {
    return unauthorized(res, 'Token inválido o expirado')
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

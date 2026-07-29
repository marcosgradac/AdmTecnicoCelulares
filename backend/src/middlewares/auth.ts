import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { UserRole } from '@prisma/client'
import { prisma } from '../lib/prisma'

export interface AuthData { userId: string; businessId: string; role: UserRole }

declare global {
  namespace Express {
    interface Request { auth?: AuthData }
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
      select: { id: true, businessId: true, role: true, isActive: true },
    })
    if (!user || user.businessId !== payload.businessId) return unauthorized(res, 'Sesión inválida')
    if (!user.isActive) return res.status(403).json({ success: false, message: 'Usuario inactivo' })
    req.auth = { userId: user.id, businessId: user.businessId, role: user.role }
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

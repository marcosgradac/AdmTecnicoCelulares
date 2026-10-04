import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import type { User } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { authenticate } from '../../middlewares/auth'
import { ownerOnlyMessage, platformAccountMessage } from './account-deletion.service'

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) throw new Error('JWT_SECRET es obligatorio')
const deletionLifetimeSeconds = 600
const claimsSchema = z.object({
  purpose: z.literal('account-deletion'), userId: z.string().min(1), businessId: z.string().min(1),
  tokenVersion: z.number().int().nonnegative(), iat: z.number().int().positive(), exp: z.number().int().positive(),
}).refine(claims => claims.exp > claims.iat && claims.exp - claims.iat <= deletionLifetimeSeconds)

/** Login invokes this only after checking credentials and detecting a blocked business/subscription. */
export function issueAccountDeletionToken(user: Pick<User, 'id' | 'businessId' | 'tokenVersion' | 'role' | 'platformRole' | 'isActive' | 'deletedAt'>): string | undefined {
  if (user.role !== 'OWNER' || user.platformRole !== 'USER' || !user.isActive || user.deletedAt) return undefined
  return jwt.sign({ purpose: 'account-deletion', userId: user.id, businessId: user.businessId, tokenVersion: user.tokenVersion }, jwtSecret!, { algorithm: 'HS256', expiresIn: deletionLifetimeSeconds })
}

/** Mounted exclusively on the account deletion router; never a normal-session authenticator. */
export async function authenticateAccountDeletion(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : ''
  const unauthorized = () => res.status(401).json({ success: false, message: 'La autorización de eliminación es inválida o venció. Volvé a ingresar tus credenciales.' })
  if (!token) return unauthorized()
  try {
    const payload = jwt.verify(token, jwtSecret!, { algorithms: ['HS256'] })
    if (typeof payload !== 'object') return unauthorized()
    // Normal tokens retain authenticate's current business/subscription checks unchanged.
    if (!Object.prototype.hasOwnProperty.call(payload, 'purpose')) return authenticate(req, res, next)
    const parsed = claimsSchema.safeParse(payload)
    if (!parsed.success || req.method !== 'DELETE' || req.path !== '/') return unauthorized()
    const claims = parsed.data
    const user = await prisma.user.findUnique({ where: { id: claims.userId } })
    if (!user || user.businessId !== claims.businessId || user.tokenVersion !== claims.tokenVersion || !user.isActive || user.deletedAt) return unauthorized()
    if (user.platformRole === 'SUPER_ADMIN') return res.status(403).json({ success: false, message: platformAccountMessage })
    if (user.role !== 'OWNER') return res.status(403).json({ success: false, message: ownerOnlyMessage })
    // Only this purpose bypasses business/subscription flags, and only within DELETE /api/account.
    req.auth = { userId: user.id, businessId: user.businessId, role: user.role, platformRole: user.platformRole, tokenVersion: user.tokenVersion }
    return next()
  } catch {
    return unauthorized()
  }
}

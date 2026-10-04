import { Router } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { authenticate, authOf } from '../../middlewares/auth'
import { AccountDeletionError, deleteOwnerAccount, ownerOnlyMessage, platformAccountMessage } from './account-deletion.service'

export const accountRouter = Router()
accountRouter.use(authenticate)
accountRouter.use((req, res, next) => {
  const auth = authOf(req)
  if (auth.platformRole === 'SUPER_ADMIN') return res.status(403).json({ success: false, message: platformAccountMessage })
  if (auth.role !== 'OWNER') return res.status(403).json({ success: false, message: ownerOnlyMessage })
  next()
})
const limitOptions = { windowMs: 15 * 60_000, standardHeaders: 'draft-8' as const, legacyHeaders: false, message: { success: false, message: 'Hiciste demasiados intentos. Esperá unos minutos y volvé a intentar.' } }
const userLimiter = rateLimit({ ...limitOptions, limit: 5, keyGenerator: req => authOf(req).userId })
const ipLimiter = rateLimit({ ...limitOptions, limit: 20, keyGenerator: req => ipKeyGenerator(req.ip ?? '') })
const deletionSchema = z.object({ password: z.string().min(1).max(1024), confirmation: z.literal('ELIMINAR MI CUENTA') }).strict()

accountRouter.delete('/', ipLimiter, userLimiter, async (req, res) => {
  const parsed = deletionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Ingresá tu contraseña actual y escribí exactamente ELIMINAR MI CUENTA.' })
  try {
    await deleteOwnerAccount(authOf(req), parsed.data.password)
    return res.status(200).json({ success: true, message: 'Tu cuenta fue eliminada permanentemente.' })
  } catch (error) {
    if (error instanceof AccountDeletionError) return res.status(error.status).json({ success: false, message: error.message })
    return res.status(409).json({ success: false, message: 'No se pudo eliminar el negocio. Sus datos se conservaron.' })
  }
})

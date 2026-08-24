import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { sendPasswordResetEmail } from '../../services/email/email.service'

export const passwordResetRouter = Router()

const windowMs = Number(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000)
const limit = Number(process.env.PASSWORD_RESET_RATE_LIMIT_MAX ?? 5)
const limiterOptions = {
  windowMs,
  limit,
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
  handler: (_req: unknown, res: { status: (code: number) => { json: (body: object) => unknown } }) =>
    res.status(429).json({ success: false, message: 'Demasiados intentos. Probá nuevamente más tarde.' }),
}
const forgotLimiter = rateLimit(limiterOptions)
const resetLimiter = rateLimit(limiterOptions)

const passwordSchema = z.string().min(8).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/)
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const genericMessage = 'Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña.'

passwordResetRouter.post('/forgot-password', forgotLimiter, async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Ingresá un email válido' })
  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } })
    if (user?.isActive) {
      const token = randomBytes(32).toString('hex')
      const now = new Date()
      const ttlMinutes = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? 30)
      await prisma.$transaction([
        prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
        prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
          },
        }),
      ])
      await sendPasswordResetEmail(user.email, token)
    }
    return res.json({ success: true, message: genericMessage })
  } catch (error) {
    console.error('[mail] No se pudo enviar la recuperación de contraseña:', error instanceof Error ? error.message : 'error desconocido')
    return res.status(502).json({ success: false, message: 'No pudimos enviar el correo de recuperación. Intentá nuevamente más tarde.' })
  }
})

passwordResetRouter.post('/reset-password', resetLimiter, async (req, res) => {
  const parsed = z.object({ token: z.string().length(64), password: passwordSchema }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'El enlace o la contraseña no son válidos' })

  const now = new Date()
  const passwordHash = await bcrypt.hash(parsed.data.password, 12)
  try {
    const changed = await prisma.$transaction(async tx => {
      const resetToken = await tx.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(parsed.data.token) },
        select: { id: true, userId: true, usedAt: true, expiresAt: true, user: { select: { isActive: true } } },
      })
      if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now || !resetToken.user.isActive) return false
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      })
      if (consumed.count !== 1) return false
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      })
      return true
    })
    return changed
      ? res.json({ success: true, message: 'Contraseña restablecida correctamente' })
      : res.status(400).json({ success: false, message: 'El enlace es inválido, ya fue usado o venció' })
  } catch {
    return res.status(500).json({ success: false, message: 'No pudimos restablecer la contraseña' })
  }
})

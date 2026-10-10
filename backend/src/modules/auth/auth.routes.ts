import { clientIp } from '../../middlewares/client-ip'
import { type Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authenticate, authOf, isRenewalMode, type AuthData } from '../../middlewares/auth'
import { buildTrialSubscriptionCreateData, getBusinessAccessStatus } from '../billing/billing.service'
import { issueAccountDeletionToken } from '../account/account-deletion.auth'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../../config/legal'
import { permissionsFor } from '../../config/permissions'
import { authenticatedWriteLimiter, loginIpLimiter, loginRisk, logTurnstileFailure, signupLimiter } from '../../middlewares/security'
import { TurnstileUnavailableError, verifyTurnstileToken } from '../../services/antiBot/turnstile.service'
import type { Express } from 'express'
import { publicBusinessLogoUrl } from '../tracking/business-logo'

export function createAuthRoutes() {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) throw new Error('JWT_SECRET es obligatorio')

  const signToken = (auth: AuthData) => jwt.sign(auth, jwtSecret, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as SignOptions['expiresIn']
  })
  const unauthorized = (res: Response, message = 'No autorizado') => res.status(401).json({ success: false, message })
  const normalizePhone = (value?: string | null) => {
    const normalized = value?.trim().replace(/\D/g, '')
    return normalized || null
  }
  const userResponse = <T extends {
    id: string
    name: string
    firstName: string | null
    lastName: string | null
    phone: string | null
    email: string
    role: 'OWNER' | 'TECHNICIAN'
    platformRole: 'USER' | 'SUPER_ADMIN'
    termsAccepted: boolean
    termsVersion: string | null
    termsAcceptedAt: Date | null
    privacyAccepted: boolean
    privacyVersion: string | null
    privacyAcceptedAt: Date | null
    permissions: unknown
    tutorialSeen: boolean
    business: { id: string; name: string; logoUrl: string | null }
  }>(user: T) => ({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    platformRole: user.platformRole,
    termsAccepted: user.termsAccepted,
    termsVersion: user.termsVersion,
    termsAcceptedAt: user.termsAcceptedAt,
    privacyAccepted: user.privacyAccepted,
    privacyVersion: user.privacyVersion,
    privacyAcceptedAt: user.privacyAcceptedAt,
    profileComplete: Boolean(user.firstName && user.lastName),
    permissions: permissionsFor(user.role, user.permissions),
    tutorialSeen: user.tutorialSeen,
    business: { id: user.business.id, name: user.business.name, logoUrl: publicBusinessLogoUrl(user.business.id, user.business.logoUrl) },
  })

  return (app: Express) => {
    const registerSchema = z.object({
      businessName: z.string().trim().min(2),
      businessPhone: z.string().trim().regex(/^(?=(?:\D*\d){6,15}\D*$)[+\d][\d\s().-]*$/),
      firstName: z.string().trim().min(1),
      lastName: z.string().trim().min(1),
      phone: z.string().trim().regex(/^(?=(?:\D*\d){6,15}\D*$)[+\d][\d\s().-]*$/),
      email: z.string().trim().email(),
      password: z.string().min(8).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/),
      termsAccepted: z.literal(true),
      termsVersion: z.literal(CURRENT_TERMS_VERSION),
      privacyAccepted: z.literal(true),
      privacyVersion: z.literal(CURRENT_PRIVACY_VERSION),
      turnstileToken: z.string().min(1),
    })
    app.post('/api/auth/register', signupLimiter, async (req, res) => {
      const parsed = registerSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de registro inválidos' })
      const email = parsed.data.email.toLowerCase()
      try {
        if (!await verifyTurnstileToken(parsed.data.turnstileToken, clientIp(req))) {
          logTurnstileFailure(req)
          return res.status(403).json({ success: false, code: 'TURNSTILE_INVALID', message: 'No pudimos verificar que la solicitud sea legítima. Intentá nuevamente.' })
        }
        if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ success: false, message: 'No pudimos crear la cuenta con esos datos.' })
        const passwordHash = await bcrypt.hash(parsed.data.password, 12)
        const user = await prisma.$transaction(async tx => {
          const business = await tx.business.create({
            data: { name: parsed.data.businessName, phone: normalizePhone(parsed.data.businessPhone) },
          })
          const now = new Date()
          await tx.subscription.create({ data: buildTrialSubscriptionCreateData(business.id, now) })
          return tx.user.create({
            data: {
              businessId: business.id,
              name: `${parsed.data.firstName} ${parsed.data.lastName}`,
              firstName: parsed.data.firstName,
              lastName: parsed.data.lastName,
              phone: normalizePhone(parsed.data.phone),
              email,
              passwordHash,
              role: 'OWNER',
              termsAccepted: true,
              termsVersion: CURRENT_TERMS_VERSION,
              termsAcceptedAt: new Date(),
              privacyAccepted: true,
              privacyVersion: CURRENT_PRIVACY_VERSION,
              privacyAcceptedAt: new Date(),
              tutorialSeen: false,
            },
            include: { business: true },
          })
        })
        const token = signToken({ userId: user.id, businessId: user.businessId, role: user.role, platformRole: user.platformRole, tokenVersion: user.tokenVersion })
        return res.status(201).json({ token, user: userResponse(user) })
      } catch (error) {
        if (error instanceof TurnstileUnavailableError) return res.status(503).json({ success: false, code: 'TURNSTILE_UNAVAILABLE', message: 'La verificación de seguridad no está disponible. Intentá nuevamente en unos minutos.' })
        if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
          return res.status(409).json({ success: false, message: 'No pudimos crear la cuenta con esos datos.' })
        }
        return res.status(500).json({ success: false, message: 'Error registrando la cuenta' })
      }
    })

    app.post('/api/auth/login', loginIpLimiter, async (req, res) => {
      const parsed = z.object({ email: z.string().trim().email(), password: z.string().min(1), turnstileToken: z.string().optional() }).safeParse(req.body)
      if (!parsed.success) return unauthorized(res, 'Email o contraseña incorrectos')
      const email = parsed.data.email.toLowerCase()
      const risk = loginRisk.get(email)
      if (risk.blockedUntil && risk.blockedUntil > Date.now()) {
        const retryAfter = Math.ceil((risk.blockedUntil - Date.now()) / 1000)
        res.setHeader('Retry-After', String(retryAfter))
        return res.status(429).json({ success: false, code: 'LOGIN_BACKOFF', captchaRequired: true, retryAfter, message: 'Hiciste demasiados intentos. Esperá unos minutos y volvé a intentar.' })
      }
      try {
        if (loginRisk.requiresCaptcha(risk) && !await verifyTurnstileToken(parsed.data.turnstileToken, clientIp(req))) {
          logTurnstileFailure(req)
          return res.status(403).json({ success: false, code: 'TURNSTILE_REQUIRED', captchaRequired: true, message: 'Completá la verificación de seguridad para continuar.' })
        }
        const user = await prisma.user.findUnique({ where: { email }, include: { business: true } })
        if (!user || !await bcrypt.compare(parsed.data.password, user.passwordHash)) {
          const nextRisk = loginRisk.fail(email)
          if (nextRisk.blockedUntil) {
            const retryAfter = Math.ceil((nextRisk.blockedUntil - Date.now()) / 1000)
            res.setHeader('Retry-After', String(retryAfter))
            return res.status(429).json({ success: false, code: 'LOGIN_BACKOFF', captchaRequired: true, retryAfter, message: 'Hiciste demasiados intentos. Esperá unos minutos y volvé a intentar.' })
          }
          return res.status(401).json({ success: false, message: 'Email o contraseña incorrectos', captchaRequired: loginRisk.requiresCaptcha(nextRisk) })
        }
        loginRisk.clear(email)
        if (!user.isActive) return res.status(403).json({ success: false, message: 'Usuario inactivo' })
        if (!user.business.isActive && user.platformRole !== 'SUPER_ADMIN') return res.status(403).json({ success: false, message: user.role === 'OWNER' ? 'Tu cuenta está temporalmente bloqueada' : 'El acceso de este negocio está temporalmente suspendido', code: 'BUSINESS_BLOCKED', audience: user.role, deletionToken: issueAccountDeletionToken(user) })
        if (user.platformRole !== 'SUPER_ADMIN') {
          const access = await getBusinessAccessStatus(user.businessId)
          // El OWNER con vencimiento automático entra en modo renovación: sesión normal, acceso sólo a Billing.
          if (access?.shouldBlock && !isRenewalMode(user.role, access)) return res.status(403).json({ success: false, message: user.role === 'OWNER' ? 'Tu cuenta está temporalmente bloqueada' : 'El acceso de este negocio está temporalmente suspendido', code: 'SUBSCRIPTION_BLOCKED', audience: user.role, deletionToken: issueAccountDeletionToken(user) })
        }
        const token = signToken({ userId: user.id, businessId: user.businessId, role: user.role, platformRole: user.platformRole, tokenVersion: user.tokenVersion })
        return res.json({ token, user: userResponse(user) })
      } catch (error) {
        if (error instanceof TurnstileUnavailableError) return res.status(503).json({ success: false, code: 'TURNSTILE_UNAVAILABLE', message: 'La verificación de seguridad no está disponible. Intentá nuevamente en unos minutos.' })
        return res.status(500).json({ success: false, message: 'Error iniciando sesión' })
      }
    })

    app.get('/api/auth/me', authenticate, async (req, res) => {
      const auth = authOf(req)
      const user = await prisma.user.findFirst({ where: { id: auth.userId, businessId: auth.businessId }, include: { business: true } })
      if (!user) return unauthorized(res)
      return res.json(userResponse(user))
    })

    app.get('/api/profile', authenticate, async (req, res) => {
      const auth = authOf(req)
      const user = await prisma.user.findFirst({ where: { id: auth.userId, businessId: auth.businessId }, include: { business: true } })
      return user ? res.json(userResponse(user)) : unauthorized(res)
    })

    const profileSchema = z.object({
      firstName: z.string().trim().min(1),
      lastName: z.string().trim().min(1),
      phone: z.string().trim().optional().nullable(),
    })
    app.patch('/api/profile', authenticate, authenticatedWriteLimiter, async (req, res) => {
      const parsed = profileSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de perfil inválidos' })
      const auth = authOf(req)
      const current = await prisma.user.findFirst({ where: { id: auth.userId, businessId: auth.businessId } })
      if (!current) return unauthorized(res)
      const user = await prisma.user.update({
        where: { id: current.id },
        data: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          name: `${parsed.data.firstName} ${parsed.data.lastName}`,
          phone: normalizePhone(parsed.data.phone),
        },
        include: { business: true },
      })
      return res.json(userResponse(user))
    })

    app.patch('/api/auth/tutorial-seen', authenticate, authenticatedWriteLimiter, async (req, res) => {
      const auth = authOf(req)
      const updated = await prisma.user.updateMany({ where: { id: auth.userId, businessId: auth.businessId }, data: { tutorialSeen: true } })
      if (updated.count !== 1) return unauthorized(res)
      return res.json({ success: true, tutorialSeen: true })
    })

  }
}

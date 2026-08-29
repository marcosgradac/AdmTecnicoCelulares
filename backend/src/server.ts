import 'dotenv/config'
import express, { type Request, type Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import bcrypt from 'bcryptjs'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { CashMovementType, PaymentMethod, Prisma, RepairStatus, WarrantyClaimStatus } from '@prisma/client'
import { prisma } from './lib/prisma'
import { authenticate, authOf, requirePermission, requireRole, type AuthData } from './middlewares/auth'
import { billingRouter, assertWithinLimit } from './modules/billing/billing.routes'
import { platformAdminRouter } from './modules/platform-admin/platform-admin.routes'
import { requireSubscriptionWriteAccess } from './modules/billing/billing.middleware'
import { addDays, getBusinessAccessStatus } from './modules/billing/billing.service'
import { teamRouter } from './modules/team/team.routes'
import { passwordResetRouter } from './modules/auth/password-reset.routes'
import { passwordChangeRouter } from './modules/auth/password-change.routes'
import { reportsRouter } from './modules/reports/reports.routes'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from './config/legal'
import { permissionsFor } from './config/permissions'
import { settingsRouter } from './modules/settings/settings.routes'
import { securityConfig } from './config/security'
import { authenticatedWriteLimiter, globalApiLimiter, limitAuthenticatedWrites, loginIpLimiter, loginRisk, logTurnstileFailure, publicTrackingLimiter, signupLimiter, trackingRisk } from './middlewares/security'
import { TurnstileUnavailableError, verifyTurnstileToken } from './services/antiBot/turnstile.service'
import { getArgentinaDayBounds } from './lib/argentina-day'

export const app = express()
app.set('trust proxy', 1)
app.use(helmet())
const allowedOrigins = (process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map(value => value.trim().replace(/\/$/, ''))
  .filter(Boolean)
app.use(cors({
  origin: (origin, callback) => {
    const normalizedOrigin = origin?.replace(/\/$/, '')
    const isLocalDevelopmentOrigin = process.env.NODE_ENV !== 'production' && Boolean(normalizedOrigin && (() => {
      try { return ['localhost', '127.0.0.1'].includes(new URL(normalizedOrigin).hostname) }
      catch { return false }
    })())
    if (!origin || allowedOrigins.includes(normalizedOrigin ?? '') || isLocalDevelopmentOrigin) return callback(null, true)
    return callback(new Error('Origen no permitido por CORS'))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: false,
}))
app.use(express.json({ limit: securityConfig.payloadLimit }))
app.use('/api', globalApiLimiter)

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
const publicBusinessLogoUrl = (businessId: string, storedLogo: string | null) => storedLogo?.startsWith('data:') ? `/api/business-logo/${businessId}` : storedLogo
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

const health = async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return res.status(200).json({ status: 'ok', ok: true, environment: process.env.NODE_ENV ?? 'development', timestamp: new Date().toISOString() })
  } catch {
    console.error('Health check: la base de datos no está disponible')
    return res.status(503).json({ status: 'error', ok: false, timestamp: new Date().toISOString() })
  }
}
app.get('/api/health', health)
app.get('/health', health)
app.get('/api/business-logo/:businessId', async (req, res) => {
  const business = await prisma.business.findUnique({ where: { id: String(req.params.businessId) }, select: { logoUrl: true } })
  const match = business?.logoUrl?.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return res.status(404).end()
  const image = Buffer.from(match[2], 'base64')
  res.setHeader('Content-Type', match[1])
  res.setHeader('Content-Length', String(image.length))
  res.setHeader('Cache-Control', 'public, no-cache')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  return res.send(image)
})
app.use('/api/auth', passwordResetRouter)
app.use('/api/auth/password-change', passwordChangeRouter)

const publicRepairSelect = {
  id: true, number: true, deviceBrand: true, deviceModel: true, issue: true,
  status: true, total: true, paid: true, trackingToken: true, trackingEnabled: true,
  estimatedDeliveryDate: true, createdAt: true, updatedAt: true,
  business: { select: { id: true, name: true, logoUrl: true } },
  statusHistory: { where: { publicMessage: { not: null } }, select: { newStatus: true, publicMessage: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
} as const
app.get('/api/tracking/:token', publicTrackingLimiter, async (req, res) => {
  try {
    const ip = req.ip ?? 'unknown'
    const risk = trackingRisk.get(ip)
    if (trackingRisk.requiresCaptcha(risk)) {
      try {
        if (!await verifyTurnstileToken(req.header('x-turnstile-token'), req.ip)) {
          logTurnstileFailure(req)
          return res.status(403).json({ success: false, code: 'TURNSTILE_REQUIRED', message: 'No pudimos verificar que la solicitud sea legítima. Intentá nuevamente.' })
        }
      } catch (error) {
        if (error instanceof TurnstileUnavailableError) return res.status(503).json({ success: false, code: 'TURNSTILE_UNAVAILABLE', message: 'La verificación de seguridad no está disponible. Intentá nuevamente en unos minutos.' })
        throw error
      }
    }
    const repair = await prisma.repair.findUnique({ where: { trackingToken: String(req.params.token) }, select: publicRepairSelect })
    if (!repair?.trackingEnabled) {
      trackingRisk.miss(ip)
      return res.status(404).json({ success: false, message: 'Seguimiento no encontrado' })
    }
    trackingRisk.clear(ip)
    return res.json({ ...repair, business: { name: repair.business.name, logoUrl: publicBusinessLogoUrl(repair.business.id, repair.business.logoUrl) }, clientId: '', imei: null, color: null, diagnosis: null, notes: null, client: { id: '', name: '', phone: null, createdAt: repair.createdAt } })
  } catch { return res.status(500).json({ success: false, message: 'Error obteniendo seguimiento' }) }
})

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
    if (!await verifyTurnstileToken(parsed.data.turnstileToken, req.ip)) {
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
      const trialEndsAt = addDays(now, 30)
      await tx.subscription.create({ data: { businessId: business.id, planCode: 'COMPLETE', status: 'TRIALING', trialStartedAt: now, trialEndsAt, trialConsumedAt: now, accessExpiresAt: trialEndsAt } })
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
    if (loginRisk.requiresCaptcha(risk) && !await verifyTurnstileToken(parsed.data.turnstileToken, req.ip)) {
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
    if (!user.business.isActive && user.platformRole !== 'SUPER_ADMIN') return res.status(403).json({ success: false, message: user.role === 'OWNER' ? 'Tu cuenta está temporalmente bloqueada' : 'El acceso de este negocio está temporalmente suspendido', code: 'BUSINESS_BLOCKED', audience: user.role })
    if (user.platformRole !== 'SUPER_ADMIN') {
      const access = await getBusinessAccessStatus(user.businessId)
      if (access?.shouldBlock) return res.status(403).json({ success: false, message: user.role === 'OWNER' ? 'Tu cuenta está temporalmente bloqueada' : 'El acceso de este negocio está temporalmente suspendido', code: 'SUBSCRIPTION_BLOCKED', audience: user.role })
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

app.get('/api/billing/plans', async (_req, res) => res.json(await prisma.plan.findMany({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } })))

app.use('/api', authenticate)
app.use('/api', limitAuthenticatedWrites)
app.use('/api/billing', billingRouter)
app.use('/api/platform-admin', platformAdminRouter)
app.use('/api', requireSubscriptionWriteAccess)
app.use('/api/team', teamRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/settings', settingsRouter)
const includeRepair = { client: true, device: true, payments: true, statusHistory: { orderBy: { createdAt: 'desc' as const } }, photos: true, warrantyClaims: { orderBy: { createdAt: 'desc' as const } } } as const
const repairListSelect = {
  id: true, number: true, clientId: true, deviceBrand: true, deviceModel: true, imei: true, color: true, issue: true,
  diagnosis: true, notes: true, status: true, total: true, paid: true, trackingToken: true, trackingEnabled: true,
  estimatedDeliveryDate: true, warrantyEnabled: true, warrantyDurationDays: true, warrantyStartedAt: true,
  warrantyExpiresAt: true, createdAt: true, updatedAt: true,
  client: { select: { id: true, name: true, phone: true, createdAt: true } },
} as const

app.get('/api/repairs', requirePermission('repairs.view'), async (req, res) => {
  const parsed = z.object({
    page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().optional(), status: z.nativeEnum(RepairStatus).optional(),
    from: z.coerce.date().optional(), to: z.coerce.date().optional(), order: z.enum(['asc', 'desc']).default('desc'),
  }).safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Filtros inválidos' })
  try {
    const { page, pageSize, search, status, from, to, order } = parsed.data
    const where = {
      businessId: authOf(req).businessId, ...(status ? { status } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(search ? { OR: [
        ...(Number.isInteger(Number(search)) ? [{ number: Number(search) }] : []),
        { client: { name: { contains: search, mode: 'insensitive' as const } } },
        { client: { phone: { contains: search } } },
        { deviceBrand: { contains: search, mode: 'insensitive' as const } },
        { deviceModel: { contains: search, mode: 'insensitive' as const } },
        { imei: { contains: search } },
        { issue: { contains: search, mode: 'insensitive' as const } },
      ] } : {}),
    }
    const [items, total] = await prisma.$transaction([
      prisma.repair.findMany({ where, select: repairListSelect, orderBy: [{ createdAt: order }, { id: order }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.repair.count({ where }),
    ])
    return res.json({ items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) })
  }
  catch { return res.status(500).json({ success: false, message: 'Error obteniendo reparaciones' }) }
})
app.get('/api/repairs/:id', requirePermission('repairs.view'), async (req, res) => {
  const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, include: includeRepair })
  return repair ? res.json(repair) : res.status(404).json({ success: false, message: 'Reparación no encontrada' })
})

const createRepairSchema = z.object({
  clientId: z.string().min(1),
  deviceBrand: z.string().trim().min(1), deviceModel: z.string().trim().min(1), imei: z.string().optional(),
  color: z.string().optional(), issue: z.string().trim().min(2), diagnosis: z.string().optional(),
  notes: z.string().optional(), total: z.number().int().nonnegative().default(0), estimatedDeliveryDate: z.coerce.date().optional(), status: z.nativeEnum(RepairStatus).default(RepairStatus.RECEIVED)
  , warrantyEnabled: z.boolean().default(false), warrantyDurationDays: z.number().int().min(1).max(365).optional()
})
app.post('/api/repairs', requirePermission('repairs.create'), async (req, res) => {
  const parsed = createRepairSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos inválidos' })
  const businessId = authOf(req).businessId
  try {
    await assertWithinLimit(authOf(req).businessId, 'repairs')
    let trackingAllowed = true
    try { await assertWithinLimit(authOf(req).businessId, 'trackingLinks') } catch { trackingAllowed = false }
    const data = parsed.data
    const client = await prisma.client.findFirst({ where: { id: data.clientId, businessId } })
    if (!client) return res.status(404).json({ success: false, message: 'El cliente seleccionado no existe' })
    const repair = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${businessId}))`
      const last = await tx.repair.findFirst({ where: { businessId }, orderBy: { number: 'desc' } })
      const deliveredAt = data.status === RepairStatus.DELIVERED ? new Date() : null
      const warrantyStartedAt = data.warrantyEnabled && deliveredAt ? deliveredAt : null
      const warrantyExpiresAt = warrantyStartedAt && data.warrantyDurationDays ? new Date(warrantyStartedAt.getTime() + data.warrantyDurationDays * 86_400_000) : null
      return tx.repair.create({ data: { businessId, number: (last?.number ?? 1000) + 1, clientId: client.id, deviceId: null, deviceBrand: data.deviceBrand, deviceModel: data.deviceModel, imei: data.imei?.replace(/[\s-]/g, '') || null, color: data.color?.trim() || null, issue: data.issue, diagnosis: data.diagnosis?.trim() || null, notes: data.notes?.trim() || null, total: data.total, estimatedDeliveryDate: data.estimatedDeliveryDate, status: data.status, trackingToken: trackingAllowed ? randomBytes(32).toString('hex') : null, trackingEnabled: trackingAllowed, trackingCreatedAt: trackingAllowed ? new Date() : null, deliveredAt, warrantyEnabled: data.warrantyEnabled, warrantyDurationDays: data.warrantyEnabled ? data.warrantyDurationDays : null, warrantyStartedAt, warrantyExpiresAt }, include: includeRepair })
    }, { timeout: 15_000 })
    return res.status(201).json(repair)
  } catch (error) {
    const status = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
    return res.status(status).json({ success: false, message: error instanceof Error && status !== 500 ? error.message : 'Error creando reparación' })
  }
})

const updateRepairSchema = z.object({
  clientId: z.string().min(1).optional(), deviceBrand: z.string().trim().min(1), deviceModel: z.string().trim().min(1),
  imei: z.string().trim().optional().nullable(), color: z.string().trim().optional().nullable(), issue: z.string().trim().min(2),
  diagnosis: z.string().trim().optional().nullable(), notes: z.string().trim().optional().nullable(), total: z.number().int().nonnegative()
})
app.patch('/api/repairs/:id', requirePermission('repairs.update'), async (req, res) => {
  const parsed = updateRepairSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de reparación inválidos' })
  const businessId = authOf(req).businessId
  const current = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId } })
  if (!current) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  if (parsed.data.total < current.paid) return res.status(400).json({ success: false, message: 'El total no puede ser menor que el importe pagado' })
  if (parsed.data.clientId && !await prisma.client.findFirst({ where: { id: parsed.data.clientId, businessId } })) return res.status(400).json({ success: false, message: 'El cliente seleccionado no existe' })
  const repair = await prisma.repair.update({ where: { id: current.id }, data: { ...parsed.data, imei: parsed.data.imei || null, color: parsed.data.color || null, diagnosis: parsed.data.diagnosis || null, notes: parsed.data.notes || null }, include: includeRepair })
  return res.json(repair)
})
app.patch('/api/repairs/:id/status', requirePermission('repairs.changeStatus'), async (req, res) => {
  const parsed = z.object({ status: z.nativeEnum(RepairStatus), publicMessage: z.string().trim().max(500).optional(), internalNote: z.string().trim().max(1000).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Estado inválido' })
  const current = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId } })
  if (!current) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  const auth = authOf(req)
  const repair = await prisma.$transaction(async tx => {
    await tx.repairStatusHistory.create({ data: { repairId: current.id, previousStatus: current.status, newStatus: parsed.data.status, publicMessage: parsed.data.publicMessage || null, internalNote: parsed.data.internalNote || null, changedByUserId: auth.userId } })
    const deliveredAt = parsed.data.status === 'DELIVERED' ? current.deliveredAt ?? new Date() : current.deliveredAt
    const warrantyStartedAt = parsed.data.status === 'DELIVERED' && current.warrantyEnabled ? current.warrantyStartedAt ?? deliveredAt : current.warrantyStartedAt
    const warrantyExpiresAt = warrantyStartedAt && current.warrantyDurationDays ? current.warrantyExpiresAt ?? new Date(warrantyStartedAt.getTime() + current.warrantyDurationDays * 86_400_000) : current.warrantyExpiresAt
    return tx.repair.update({ where: { id: current.id }, data: { status: parsed.data.status, deliveredAt, warrantyStartedAt, warrantyExpiresAt }, include: includeRepair })
  })
  return res.json(repair)
})
const setRepairStatus = (status: RepairStatus) => async (req: Request, res: Response) => {
  const current = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId } })
  if (!current) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  return res.json(await prisma.repair.update({ where: { id: current.id }, data: { status }, include: includeRepair }))
}
app.patch('/api/repairs/:id/approve', requirePermission('repairs.changeStatus'), setRepairStatus('APPROVED'))
app.patch('/api/repairs/:id/start', requirePermission('repairs.changeStatus'), setRepairStatus('REPAIRING'))

app.get('/api/clients', requirePermission('clients.view'), async (req, res) => {
  const businessId = authOf(req).businessId
  if (req.query.paginated !== 'true') return res.json(await prisma.client.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' } }))
  const parsed = z.object({ page:z.coerce.number().int().positive().default(1), pageSize:z.coerce.number().int().min(1).max(100).default(10), search:z.string().trim().optional() }).safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ success:false, message:'Filtros inválidos' })
  const {page,pageSize,search}=parsed.data
  const where={businessId,...(search?{OR:[{name:{contains:search,mode:'insensitive' as const}},{phone:{contains:search}}]}:{})}
  const [items,total]=await prisma.$transaction([prisma.client.findMany({where,select:{id:true,name:true,phone:true,createdAt:true,_count:{select:{repairs:true}},repairs:{select:{deviceBrand:true,deviceModel:true},orderBy:[{createdAt:'desc'},{id:'desc'}],take:1}},orderBy:{createdAt:'desc'},skip:(page-1)*pageSize,take:pageSize}),prisma.client.count({where})])
  return res.json({items:items.map(({_count,repairs,...client})=>({...client,repairCount:_count.repairs,lastRepair:repairs[0]??null})),total,page,pageSize,totalPages:Math.max(1,Math.ceil(total/pageSize))})
})
app.get('/api/clients/options', requirePermission('clients.view'), async (req, res) => {
  return res.json(await prisma.client.findMany({ where: { businessId: authOf(req).businessId }, select: { id: true, name: true, phone: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }))
})
app.get('/api/clients/:id', requirePermission('clients.view'), async (req, res) => {
  const client = await prisma.client.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, include: { repairs: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] } } })
  return client ? res.json(client) : res.status(404).json({ success: false, message: 'Cliente no encontrado' })
})
app.post('/api/clients', requirePermission('clients.create'), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2), phone: z.string().min(6).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos inválidos' })
  const businessId = authOf(req).businessId
  const phone = parsed.data.phone?.replace(/\D/g, '')
  if (phone && await prisma.client.findFirst({ where: { businessId, phone } })) return res.status(409).json({ success: false, message: 'Ya existe un cliente con ese teléfono' })
  return res.status(201).json(await prisma.client.create({ data: { businessId, name: parsed.data.name, phone } }))
})
app.patch('/api/clients/:id', requirePermission('clients.update'), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().min(6).optional().nullable() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos inválidos' })
  const businessId = authOf(req).businessId
  const current = await prisma.client.findFirst({ where: { id: String(req.params.id), businessId } })
  if (!current) return res.status(404).json({ success: false, message: 'Cliente no encontrado' })
  const phone = parsed.data.phone?.replace(/\D/g, '') || null
  if (phone && await prisma.client.findFirst({ where: { businessId, phone, NOT: { id: current.id } } })) return res.status(409).json({ success: false, message: 'Ya existe un cliente con ese teléfono' })
  return res.json(await prisma.client.update({ where: { id: current.id }, data: { name: parsed.data.name, phone } }))
})

app.post('/api/repairs/:id/payments', requirePermission('repairs.viewFinancials'), async (req, res) => {
  const parsed = z.object({ amount: z.number().int().positive(), method: z.nativeEnum(PaymentMethod), note: z.string().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de pago inválidos' })
  const businessId = authOf(req).businessId
  const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId }, include: { client: true } })
  if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  const payment = await prisma.$transaction(async tx => {
    const changed = await tx.repair.updateMany({
      where: { id: repair.id, businessId, paid: { lte: repair.total - parsed.data.amount } },
      data: { paid: { increment: parsed.data.amount } },
    })
    if (changed.count !== 1) return null
    const created = await tx.payment.create({ data: { businessId, ...parsed.data, repairId: repair.id, clientId: repair.clientId } })
    await tx.cashMovement.create({ data: { businessId, type: 'INCOME', description: `Pago reparación #${repair.number}`, amount: parsed.data.amount, method: parsed.data.method, repairId: repair.id, clientName: repair.client.name } })
    return created
  })
  return payment
    ? res.status(201).json(payment)
    : res.status(409).json({ success: false, message: 'El pago supera el saldo pendiente' })
})
app.get('/api/repairs/:id/payments', async (req, res) => {
  const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, select: { id: true } })
  if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  return res.json(await prisma.payment.findMany({ where: { repairId: repair.id, businessId: authOf(req).businessId }, orderBy: { createdAt: 'desc' } }))
})

app.get('/api/repairs/:id/history', async (req, res) => {
  const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, select: { id: true } })
  if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  return res.json(await prisma.repairStatusHistory.findMany({ where: { repairId: repair.id }, orderBy: { createdAt: 'desc' } }))
})

app.post('/api/repairs/:id/tracking-link', requirePermission('repairs.shareTracking'), async (req, res) => {
  try { await assertWithinLimit(authOf(req).businessId, 'trackingLinks') } catch (error) { return res.status((error as { statusCode?: number }).statusCode ?? 409).json({ success: false, message: error instanceof Error ? error.message : 'Límite alcanzado' }) }
  const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, select: { id: true } })
  if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  const trackingToken = randomBytes(32).toString('hex')
  return res.json(await prisma.repair.update({ where: { id: repair.id }, data: { trackingToken, trackingEnabled: true, trackingCreatedAt: new Date() }, select: { trackingToken: true, trackingEnabled: true } }))
})

app.patch('/api/repairs/:id/tracking-link', requirePermission('repairs.shareTracking'), async (req, res) => {
  const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, select: { id: true } })
  if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  return res.json(await prisma.repair.update({ where: { id: repair.id }, data: { trackingEnabled: false }, select: { trackingToken: true, trackingEnabled: true } }))
})

app.get('/api/cash/movements', requirePermission('cash.view'), async (req, res) => {
  const parsed = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  }).safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Parámetros de paginación inválidos' })

  const { page, pageSize } = parsed.data
  const businessId = authOf(req).businessId
  const { start, end } = getArgentinaDayBounds(new Date())
  const where = { businessId }
  const todayWhere = { businessId, createdAt: { gte: start, lt: end } }
  const [items, total, grouped] = await prisma.$transaction([
    prisma.cashMovement.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.cashMovement.count({ where }),
    prisma.cashMovement.groupBy({ by: ['type'], where: todayWhere, orderBy: { type: 'asc' }, _sum: { amount: true } }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  const incomeToday = grouped.find(row => row.type === CashMovementType.INCOME)?._sum?.amount ?? 0
  const expenseToday = grouped.find(row => row.type === CashMovementType.EXPENSE)?._sum?.amount ?? 0
  return res.json({
    items,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    summary: { incomeToday, expenseToday, balanceToday: incomeToday - expenseToday, totalMovements: total },
  })
})
app.post('/api/cash/movements', requirePermission('cash.create'), async (req, res) => {
  const parsed = z.object({ type: z.nativeEnum(CashMovementType), description: z.string().trim().min(2), amount: z.number().int().positive(), method: z.nativeEnum(PaymentMethod).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Movimiento inválido' })
  return res.status(201).json(await prisma.cashMovement.create({ data: { businessId: authOf(req).businessId, ...parsed.data } }))
})

app.get('/api/warranties', async (req, res) => {
  const businessId = authOf(req).businessId
  const repairs = await prisma.repair.findMany({
    where: { businessId, warrantyEnabled: true, warrantyDeletedAt: null },
    include: { client: true, warrantyClaims: { orderBy: { createdAt: 'desc' } } },
    orderBy: [{ warrantyExpiresAt: 'asc' }, { updatedAt: 'desc' }],
  })
  return res.json(repairs)
})
app.patch('/api/warranties/:repairId', async (req, res) => {
  const parsed = z.object({ durationDays: z.number().int().min(1).max(365), conditions: z.string().trim().max(2000).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de garantía inválidos' })
  const businessId = authOf(req).businessId
  const repair = await prisma.repair.findFirst({ where: { id: req.params.repairId, businessId, warrantyEnabled: true, warrantyDeletedAt: null } })
  if (!repair) return res.status(404).json({ success: false, message: 'Garantía no encontrada' })
  const warrantyExpiresAt = repair.warrantyStartedAt ? new Date(repair.warrantyStartedAt.getTime() + parsed.data.durationDays * 86_400_000) : null
  return res.json(await prisma.repair.update({ where: { id: repair.id }, data: { warrantyDurationDays: parsed.data.durationDays, warrantyConditions: parsed.data.conditions || null, warrantyExpiresAt }, include: { client: true, warrantyClaims: { orderBy: { createdAt: 'desc' } } } }))
})
app.delete('/api/warranties/:repairId', async (req, res) => {
  const businessId = authOf(req).businessId
  const repair = await prisma.repair.findFirst({ where: { id: req.params.repairId, businessId, warrantyEnabled: true, warrantyDeletedAt: null } })
  if (!repair) return res.status(404).json({ success: false, message: 'Garantía no encontrada' })
  await prisma.repair.update({ where: { id: repair.id }, data: { warrantyEnabled: false, warrantyDeletedAt: new Date() } })
  return res.json({ success: true })
})
app.post('/api/warranties/:repairId/claims', async (req, res) => {
  const parsed = z.object({ description: z.string().trim().min(5).max(1500) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Describí el reclamo de garantía' })
  const businessId = authOf(req).businessId
  const repair = await prisma.repair.findFirst({ where: { id: req.params.repairId, businessId, warrantyEnabled: true, warrantyDeletedAt: null } })
  if (!repair) return res.status(404).json({ success: false, message: 'Garantía no encontrada' })
  if (!repair.warrantyStartedAt || !repair.warrantyExpiresAt) return res.status(409).json({ success: false, message: 'La garantía comienza cuando la reparación se entrega' })
  if (repair.warrantyExpiresAt < new Date()) return res.status(409).json({ success: false, message: 'La garantía está vencida' })
  return res.status(201).json(await prisma.warrantyClaim.create({ data: { businessId, repairId: repair.id, description: parsed.data.description } }))
})
app.patch('/api/warranties/claims/:id', async (req, res) => {
  const parsed = z.object({ status: z.nativeEnum(WarrantyClaimStatus), resolution: z.string().trim().max(1500).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Actualización inválida' })
  const businessId = authOf(req).businessId
  const claim = await prisma.warrantyClaim.findFirst({ where: { id: req.params.id, businessId } })
  if (!claim) return res.status(404).json({ success: false, message: 'Reclamo no encontrado' })
  const closed = ['RESOLVED', 'REJECTED'].includes(parsed.data.status)
  return res.json(await prisma.warrantyClaim.update({ where: { id: claim.id }, data: { ...parsed.data, resolution: parsed.data.resolution || null, resolvedAt: closed ? new Date() : null } }))
})
app.get('/api/dashboard/summary', requireRole('OWNER'), async (req, res) => {
  const businessId = authOf(req).businessId
  const canViewFinancials = authOf(req).role === 'OWNER'
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), month = new Date(now.getFullYear(), now.getMonth(), 1)
  const [repairs, clients, movements] = await Promise.all([
    prisma.repair.findMany({ where: { businessId }, include: { client: true }, orderBy: { createdAt: 'desc' } }),
    prisma.client.count({ where: { businessId } }),
    canViewFinancials ? prisma.cashMovement.findMany({ where: { businessId, createdAt: { gte: month } }, orderBy: { createdAt: 'asc' } }) : Promise.resolve([]),
  ])
  const income = movements.filter(m => m.type === 'INCOME').reduce((sum, m) => sum + m.amount, 0)
  const expenses = movements.filter(m => m.type === 'EXPENSE').reduce((sum, m) => sum + m.amount, 0)
  const flow = Array.from({ length: Math.min(31, now.getDate()) }, (_, index) => { const day = index + 1; const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return { label: String(day), key, income: 0, expense: 0 } })
  if (canViewFinancials) {
    for (const movement of movements.filter(m => m.type === 'INCOME')) { const point = flow.find(item => item.key === movement.createdAt.toISOString().slice(0, 10)); if (point) point.income += movement.amount }
    for (const movement of movements.filter(m => m.type === 'EXPENSE')) { const point = flow.find(item => item.key === movement.createdAt.toISOString().slice(0, 10)); if (point) point.expense += movement.amount }
  }
  const pending = canViewFinancials ? repairs.reduce((sum, repair) => sum + Math.max(0, repair.total - repair.paid), 0) : 0
  return res.json({ activeRepairs: repairs.filter(r => !['DELIVERED', 'CANCELLED'].includes(r.status)).length, readyRepairs: repairs.filter(r => r.status === 'READY').length, activeWarranties: repairs.filter(r => r.warrantyEnabled && !r.warrantyDeletedAt && r.warrantyExpiresAt && r.warrantyExpiresAt >= now).length, repairsToday: repairs.filter(r => r.createdAt >= today).length, monthlyIncome: income, monthlyExpenses: expenses, pending, clients, byStatus: Object.values(RepairStatus).map(status => ({ status, value: repairs.filter(r => r.status === status).length })), cashFlow: flow.map(({ key: _key, ...point }) => point), recentRepairs: repairs.slice(0, 5) })
})

const port = Number(process.env.PORT ?? 3000)
export const startServer = () => app.listen(port, '0.0.0.0', () => {
  console.log(`TecnoDesk API iniciada en el puerto ${port} (${process.env.NODE_ENV ?? 'development'})`)
})
if (require.main === module) startServer()

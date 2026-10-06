import 'dotenv/config'
import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import bcrypt from 'bcryptjs'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { z } from 'zod'
import { CashMovementOrigin, CashMovementType, PaymentMethod, Prisma, RepairStatus } from '@prisma/client'
import { prisma } from './lib/prisma'
import { allocateRepairNumber } from './lib/repair-number'
import { canViewRepairFinancials, clientRepairSelect, repairHistoryResponse, repairResponse } from './modules/repairs/repair-response'
import { advanceCorrectionNote, correctInitialRepairAdvance, initialRepairFinanceSchema, recordInitialRepairFinance, repairAdvanceSchema, RepairFinanceError } from './modules/repairs/repair-finance'
import { assertStatusChange, deliveredLockedMessage, deliveryDates, isSpecialRepairStatus, nextRepairStatus, previousRepairStatus, repairFlow, statusError } from './modules/repairs/repair-status'
import { generateTrackingToken } from './modules/tracking/tracking-token'
import {
  classifyTracking,
  isLegitimateTrackingLookup,
  isTrackingExpired,
  trackingExpiryFrom,
  TRACKING_EXPIRED_CODE,
  TRACKING_EXPIRED_MESSAGE,
  trackingExpiredError,
} from './modules/tracking/tracking-expiry'
import { emptyLoose, linkedWhereFor, looseCashMovements, looseColumns, looseWhereFor, repairCashGroups, toLooseBlock } from './modules/cash/cash-groups.service'
import { cashPeriodWhere, DEFAULT_CASH_PERIOD, isCashPeriod } from './modules/cash/cash-period'
import { authenticate, authOf, isRenewalMode, requirePermission, requireRole, type AuthData } from './middlewares/auth'
import { billingRouter, assertWithinLimit } from './modules/billing/billing.routes'
import { platformAdminRouter } from './modules/platform-admin/platform-admin.routes'
import { requireSubscriptionAccess } from './modules/billing/billing.middleware'
import { addDays, assertFeatureAccess, getBusinessAccessStatus } from './modules/billing/billing.service'
import { teamRouter } from './modules/team/team.routes'
import { passwordResetRouter } from './modules/auth/password-reset.routes'
import { passwordChangeRouter } from './modules/auth/password-change.routes'
import { accountRouter } from './modules/account/account.routes'
import { issueAccountDeletionToken } from './modules/account/account-deletion.auth'
import { reportsRouter } from './modules/reports/reports.routes'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from './config/legal'
import { permissionsFor } from './config/permissions'
import { settingsRouter } from './modules/settings/settings.routes'
import { commerceRouter } from './modules/commerce/commerce.routes'
import { equipmentSalesRouter } from './modules/equipment-sales/equipment-sales.routes'
import { warrantiesRouter } from './modules/warranties/warranties.routes'
import { dashboardRouter } from './modules/dashboard/dashboard.routes'
import { deviceSummary } from './modules/equipment-sales/equipment-sales.service'
import { securityConfig } from './config/security'
import { authenticatedApiLimiter, authenticatedWriteLimiter, globalApiLimiter, limitAuthenticatedWrites, loginIpLimiter, loginRisk, logTurnstileFailure, publicTrackingLimiter, signupLimiter, trackingRisk } from './middlewares/security'
import { TurnstileUnavailableError, verifyTurnstileToken } from './services/antiBot/turnstile.service'

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
  status: true, total: true, paid: true, trackingToken: true, trackingEnabled: true, trackingExpiresAt: true,
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
    // El token ES el secreto. El orden importa: primero se busca por token, después
    // se mira si el enlace sigue habilitado, y sólo al final se evalúa el vencimiento.
    const state = classifyTracking(repair)
    if (state === 'not-found' || state === 'disabled' || !repair) {
      // No se distingue entre "no existe" y "existe pero deshabilitado": responder distinto
      // confirmaría que el token fue real alguna vez.
      trackingRisk.miss(ip)
      return res.status(404).json({ success: false, message: 'Seguimiento no encontrado' })
    }
    // Un token válido y vencido NO es un intento de enumeración: es un cliente que abre
    // su propio enlace meses después. Contarlo como fallo lo penalizaría sin motivo.
    if (isLegitimateTrackingLookup(state)) trackingRisk.clear(ip)
    if (state === 'expired') {
      // 410 y no 404: el enlace existió y terminó. El mensaje es genérico y no devuelve
      // ningún dato de la reparación ni del cliente.
      return res.status(410).json({ success: false, code: TRACKING_EXPIRED_CODE, message: TRACKING_EXPIRED_MESSAGE })
    }
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

app.get('/api/billing/plans', async (_req, res) => res.json(await prisma.plan.findMany({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } })))

// The destructive account flow has its own authentication and stricter rate limits.
app.use('/api/account', accountRouter)

app.use('/api', authenticate)
// El presupuesto por usuario va despues de `authenticate` (necesita req.auth.userId) y antes
// de los routers, de modo que cubre igual el orden especial de billing y platform-admin.
// El limite de escrituras queda separado y mas estricto.
app.use('/api', authenticatedApiLimiter)
app.use('/api', limitAuthenticatedWrites)
app.use('/api/billing', billingRouter)
app.use('/api/platform-admin', platformAdminRouter)
app.use('/api', requireSubscriptionAccess)
app.use('/api/commerce', commerceRouter)
app.use('/api/equipment-sales', equipmentSalesRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/team', teamRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/settings', settingsRouter)
const includeRepair = { client: true, device: true, payments: true, statusHistory: { orderBy: { createdAt: 'desc' as const } }, photos: true, warrantyClaims: { orderBy: { createdAt: 'desc' as const } } } as const
const repairListSelect = {
  id: true, number: true, clientId: true, deviceBrand: true, deviceModel: true, imei: true, color: true, issue: true,
  diagnosis: true, notes: true, status: true, total: true, paid: true, trackingToken: true, trackingEnabled: true, trackingExpiresAt: true,
  cancelledAt: true, cancellationPaidAmount: true, cancellationReviewFee: true, cancellationReviewPaid: true, cancellationRefundAmount: true,
  cancellationRefundMethod: true, cancellationRefundMovementId: true,
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
    return res.json({ items: items.map(item => repairResponse(authOf(req), item)), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) })
  }
  catch { return res.status(500).json({ success: false, message: 'Error obteniendo reparaciones' }) }
})
app.get('/api/repairs/:id', requirePermission('repairs.view'), async (req, res) => {
  const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, include: includeRepair })
  return repair ? res.json(repairResponse(authOf(req), repair)) : res.status(404).json({ success: false, message: 'Reparación no encontrada' })
})

const createRepairSchema = initialRepairFinanceSchema.extend({
  clientId: z.string().min(1),
  deviceBrand: z.string().trim().min(1), deviceModel: z.string().trim().min(1), imei: z.string().optional(),
  color: z.string().optional(), issue: z.string().trim().min(2), diagnosis: z.string().optional(),
  notes: z.string().optional(), estimatedDeliveryDate: z.coerce.date().optional(), status: z.nativeEnum(RepairStatus).default(RepairStatus.RECEIVED)
  , warrantyEnabled: z.boolean().default(false), warrantyDurationDays: z.number().int().min(1).max(365).optional()
}).superRefine((data, context) => {
  if (data.advanceAmount > data.total) context.addIssue({ code: 'custom', path: ['advanceAmount'], message: 'El adelanto no puede superar el total al cliente' })
  if (data.advanceAmount > 0 && !data.advanceMethod) context.addIssue({ code: 'custom', path: ['advanceMethod'], message: 'Seleccioná el medio de pago del adelanto' })
  // El gasto inicial es un egreso propio: con costo cargando necesita su medio de pago.
  if (data.partsCost > 0 && !data.partsCostMethod) context.addIssue({ code: 'custom', path: ['partsCostMethod'], message: 'Seleccioná el medio de pago del gasto' })
  if (data.advanceAmount > 0 && data.status === RepairStatus.CANCELLED) context.addIssue({ code: 'custom', path: ['status'], message: 'Una reparación cancelada no admite adelantos' })
})
app.post('/api/repairs', requirePermission('repairs.create'), async (req, res) => {
  const parsed = createRepairSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos' })
  const auth = authOf(req)
  if ((parsed.data.partsCost > 0 || parsed.data.laborCharge > 0 || parsed.data.advanceAmount > 0)
    && auth.role !== 'OWNER' && !auth.permissions?.includes('repairs.viewFinancials')) {
    return res.status(403).json({ success: false, message: 'No tenés permisos para registrar costos o adelantos' })
  }
  const businessId = authOf(req).businessId
  try {
    await assertWithinLimit(authOf(req).businessId, 'repairs')
    let trackingAllowed = true
    try { await assertWithinLimit(authOf(req).businessId, 'trackingLinks') } catch { trackingAllowed = false }
    const data = parsed.data
    const repair = await prisma.$transaction(async tx => {
      const client = await tx.client.findFirst({ where: { id: data.clientId, businessId, deletedAt: null } })
      if (!client) throw Object.assign(new Error('El cliente seleccionado fue eliminado o no está disponible.'), { statusCode: 404 })
      const number = await allocateRepairNumber(tx, businessId)
      const deliveredAt = data.status === RepairStatus.DELIVERED ? new Date() : null
      const warrantyStartedAt = data.warrantyEnabled && deliveredAt ? deliveredAt : null
      const warrantyExpiresAt = warrantyStartedAt && data.warrantyDurationDays ? new Date(warrantyStartedAt.getTime() + data.warrantyDurationDays * 86_400_000) : null
      // Si la reparación nace entregada, el enlace vence con la misma regla de siempre.
      const trackingExpiresAt = trackingExpiryFrom(deliveredAt, data.warrantyEnabled)
      const created = await tx.repair.create({ data: { businessId, number, clientId: client.id, deviceId: null, deviceBrand: data.deviceBrand, deviceModel: data.deviceModel, imei: data.imei?.replace(/[\s-]/g, '') || null, color: data.color?.trim() || null, issue: data.issue, diagnosis: data.diagnosis?.trim() || null, notes: data.notes?.trim() || null, total: data.total, partsCost: data.partsCost, laborCharge: data.laborCharge, estimatedDeliveryDate: data.estimatedDeliveryDate, status: data.status, trackingToken: trackingAllowed ? generateTrackingToken() : null, trackingEnabled: trackingAllowed, trackingCreatedAt: trackingAllowed ? new Date() : null, trackingExpiresAt, deliveredAt, warrantyEnabled: data.warrantyEnabled, warrantyDurationDays: data.warrantyEnabled ? data.warrantyDurationDays : null, warrantyStartedAt, warrantyExpiresAt } })
      await recordInitialRepairFinance(tx, created, client.name, data)
      return tx.repair.findUniqueOrThrow({ where: { id: created.id }, include: includeRepair })
    }, { timeout: 15_000 })
    return res.status(201).json(repairResponse(authOf(req), repair))
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
  if (parsed.data.clientId && !await prisma.client.findFirst({ where: { id: parsed.data.clientId, businessId, deletedAt: null } })) return res.status(400).json({ success: false, message: 'El cliente seleccionado fue eliminado o no está disponible.' })
  const repair = await prisma.repair.update({ where: { id: current.id }, data: { ...parsed.data, imei: parsed.data.imei || null, color: parsed.data.color || null, diagnosis: parsed.data.diagnosis || null, notes: parsed.data.notes || null }, include: includeRepair })
  return res.json(repairResponse(authOf(req), repair))
})
const statusMessagesSchema = z.object({ publicMessage: z.string().trim().max(500).optional(), internalNote: z.string().trim().max(1000).optional() })
const advanceStatus = 'advance' as const
const rewindStatus = 'rewind' as const
const noStatusStepMessage = (action: string, status: RepairStatus) => {
  if (isSpecialRepairStatus(status)) return 'Una reparación en estado especial no se mueve con el flujo normal.'
  if (status === RepairStatus.DELIVERED) return deliveredLockedMessage
  return action === advanceStatus ? 'La reparación ya está en el último estado del flujo.' : 'La reparación ya está en el primer estado del flujo.'
}
const statusFailure = (res: Response, error: unknown, fallback: string) => {
  const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
  if (statusCode >= 500) return res.status(statusCode).json({ success: false, message: fallback })
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined
  return res.status(statusCode).json({ success: false, ...(code ? { code } : {}), message: error instanceof Error ? error.message : fallback })
}
/**
 * Aplica un cambio de estado y deja el rastro en RepairStatusHistory.
 * Entregar sella deliveredAt e inicia la garantía; el resto de los pasos no las tocan.
 */
const applyStatusChange = async (
  tx: Prisma.TransactionClient,
  current: {
    id: string
    status: RepairStatus
    deliveredAt: Date | null
    warrantyEnabled: boolean
    warrantyDurationDays: number | null
    warrantyStartedAt: Date | null
    warrantyExpiresAt: Date | null
    trackingExpiresAt: Date | null
  },
  target: RepairStatus,
  messages: z.infer<typeof statusMessagesSchema>,
  userId: string,
) => {
  assertStatusChange(current.status, target)
  // Reenviar un estado actual no es un cambio: conserva fechas, updatedAt e historial.
  if (current.status === target) return tx.repair.findUniqueOrThrow({ where: { id: current.id }, include: includeRepair })
  const dates = deliveryDates(current, target)
  await tx.repairStatusHistory.create({ data: { repairId: current.id, previousStatus: current.status, newStatus: target, publicMessage: messages.publicMessage || null, internalNote: messages.internalNote || null, changedByUserId: userId } })
  return tx.repair.update({ where: { id: current.id }, data: { status: target, ...dates }, include: includeRepair })
}
/** Una ejecución canónica para el estado explícito, los pasos y las rutas legacy. */
const executeStatusChange = (
  auth: ReturnType<typeof authOf>,
  repairId: string,
  target: RepairStatus | ((current: RepairStatus) => RepairStatus),
  messages: z.infer<typeof statusMessagesSchema>,
) => prisma.$transaction(async tx => {
  const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId } })
  if (!current) throw statusError(404, 'Reparación no encontrada')
  return applyStatusChange(tx, current, typeof target === 'function' ? target(current.status) : target, messages, auth.userId)
}, { timeout: 15_000 })
/** Avance y retroceso de un solo paso. Los estados especiales y Entregado quedan bloqueados. */
const statusStepRoute = (action: typeof advanceStatus | typeof rewindStatus) => async (req: Request, res: Response) => {
  const parsed = statusMessagesSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de estado inválidos' })
  const auth = authOf(req)
  const repairId = String(req.params.id)
  try {
    const result = await executeStatusChange(auth, repairId, current => {
      const target = action === advanceStatus ? nextRepairStatus(current) : previousRepairStatus(current)
      if (!target) throw statusError(409, noStatusStepMessage(action, current))
      return target
    }, parsed.data)
    return res.json(repairResponse(authOf(req), result))
  } catch (error) {
    return statusFailure(res, error, 'No pudimos actualizar el estado')
  }
}
app.patch('/api/repairs/:id/status/advance', requirePermission('repairs.changeStatus'), statusStepRoute(advanceStatus))
app.patch('/api/repairs/:id/status/rewind', requirePermission('repairs.changeStatus'), statusStepRoute(rewindStatus))

app.patch('/api/repairs/:id/status', requirePermission('repairs.changeStatus'), async (req, res) => {
  const parsed = z.object({ status: z.nativeEnum(RepairStatus), ...statusMessagesSchema.shape }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Estado inválido' })
  if (parsed.data.status === RepairStatus.CANCELLED) return res.status(409).json({ success: false, message: 'Para cancelar una reparación con liquidación financiera usá el flujo específico: POST /api/repairs/:id/cancel' })
  const auth = authOf(req)
  const repairId = String(req.params.id)
  try {
    const result = await executeStatusChange(auth, repairId, parsed.data.status, parsed.data)
    return res.json(repairResponse(authOf(req), result))
  } catch (error) {
    return statusFailure(res, error, 'No pudimos actualizar el estado')
  }
})

/**
 * Corrección excepcional de entrega.
 *
 * Entregado es el final del flujo normal: esta es la única vía para volver a Listo y existe
 * sólo para una entrega cargada por error. No es un botón de navegación, exige OWNER, motivo
 * y confirmación, y deja el mismo rastro que cualquier cambio de estado. Si ya hay un reclamo
 * de garantía, deshacer la entrega dejaría la cobertura sin origen y la acción se bloquea.
 */
app.post('/api/repairs/:id/delivery/correction', requireRole('OWNER'), async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().min(5).max(500) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Indicá el motivo de la corrección de entrega' })
  const auth = authOf(req)
  const repairId = String(req.params.id)
  try {
    const result = await prisma.$transaction(async tx => {
      const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId } })
      if (!current) throw statusError(404, 'Reparación no encontrada')
      if (current.status !== RepairStatus.DELIVERED) throw statusError(409, 'La reparación no está entregada: no hay nada que corregir.')
      const claims = await tx.warrantyClaim.count({ where: { repairId: current.id, businessId: auth.businessId } })
      if (claims > 0) throw statusError(409, 'La reparación tiene reclamos de garantía asociados. No se puede deshacer la entrega porque dejaría la cobertura sin origen.')
      // Se borra también el vencimiento del seguimiento: si la entrega fue un error, el
      // enlace vuelve a quedar activo y sin fecha límite, igual que una reparación que
      // nunca se entregó. `trackingEnabled` NO se toca, así que el mismo link revive.
      // Compare-and-swap sobre el estado: dos correcciones simultáneas no pueden aplicadas dos veces.
      const claimed = await tx.repair.updateMany({
        where: { id: current.id, businessId: auth.businessId, status: RepairStatus.DELIVERED },
        data: { status: RepairStatus.READY, deliveredAt: null, warrantyStartedAt: null, warrantyExpiresAt: null, trackingExpiresAt: null },
      })
      if (claimed.count !== 1) throw statusError(409, 'La entrega ya fue corregida por otra operación')
      await tx.repairStatusHistory.create({ data: {
        repairId: current.id, previousStatus: RepairStatus.DELIVERED, newStatus: RepairStatus.READY, changedByUserId: auth.userId,
        internalNote: `Corrección de entrega: ${parsed.data.reason}`,
      } })
      return tx.repair.findFirst({ where: { id: current.id, businessId: auth.businessId }, include: includeRepair })
    }, { timeout: 15_000 })
    return res.json(repairResponse(authOf(req), result))
  } catch (error) {
    return statusFailure(res, error, 'No pudimos corregir la entrega')
  }
})

/**
 * Corrige el adelanto inicial de una reparación ya creada.
 *
 * Todo el trabajo ocurre en una sola transacción: Payment del adelanto, CashMovement INCOME,
 * Repair.paid y el historial. Nunca queda un segundo adelanto ni se duplica la entrada de caja.
 */
app.patch('/api/repairs/:id/advance', requirePermission('repairs.viewFinancials'), async (req, res) => {
  const parsed = repairAdvanceSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message ?? 'Datos de adelanto inválidos' })
  const auth = authOf(req)
  const repairId = String(req.params.id)
  try {
    const result = await prisma.$transaction(async tx => {
      const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId }, include: { client: true } })
      if (!current) throw statusError(404, 'Reparación no encontrada')
      if (current.status === RepairStatus.CANCELLED) throw statusError(409, 'Una reparación cancelada no se edita: su liquidación tiene su propio flujo.')
      const { previousAmount } = await correctInitialRepairAdvance(tx, current, current.client.name, parsed.data)
      // El historial interno deja el rastro exacto de la corrección del importe.
      if (previousAmount !== parsed.data.amount) {
        await tx.repairStatusHistory.create({ data: {
          repairId: current.id, previousStatus: current.status, newStatus: current.status, changedByUserId: auth.userId,
          internalNote: advanceCorrectionNote(previousAmount, parsed.data.amount),
        } })
      }
      return tx.repair.findFirst({ where: { id: current.id, businessId: auth.businessId }, include: includeRepair })
    }, { timeout: 15_000 })
    return res.json(repairResponse(authOf(req), result))
  } catch (error) {
    if (error instanceof RepairFinanceError) return res.status(error.statusCode).json({ success: false, message: error.message })
    return statusFailure(res, error, 'No pudimos corregir el adelanto')
  }
})

const cancellationError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode })
const cancelRepairSchema = z.object({
  reviewFee: z.number().int().nonnegative().default(0),
  refundMethod: z.nativeEnum(PaymentMethod).optional(),
})
app.post('/api/repairs/:id/cancel', requirePermission('repairs.changeStatus'), async (req, res) => {
  const parsed = cancelRepairSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de cancelación inválidos' })
  const auth = authOf(req)
  const repairId = String(req.params.id)
  try {
    const repair = await prisma.$transaction(async tx => {
      const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId }, include: { client: true } })
      if (!current) throw cancellationError(404, 'Reparación no encontrada')
      if (current.status === RepairStatus.CANCELLED) throw cancellationError(409, 'La reparación ya fue cancelada')
      const reviewFee = parsed.data.reviewFee
      if ((current.paid > 0 || reviewFee > 0) && !canViewRepairFinancials(auth)) throw cancellationError(403, 'No tenés permisos para liquidar pagos o devoluciones de una cancelación')
      // El saldo por revisión y la devolución nunca coexisten: el segundo depende de cuál de los dos montos es mayor.
      const refundAmount = Math.max(0, current.paid - reviewFee)
      const reviewBalance = Math.max(0, reviewFee - current.paid)
      if (refundAmount > 0 && !parsed.data.refundMethod) throw cancellationError(400, 'Indicá el medio de devolución')
      const cancelledAt = new Date()
      let refundMovementId: string | null = null
      if (refundAmount > 0) {
        const movement = await tx.cashMovement.create({ data: { businessId: current.businessId, type: CashMovementType.EXPENSE, origin: CashMovementOrigin.REPAIR, description: `Devolución por cancelación reparación #${current.number}`, amount: refundAmount, method: parsed.data.refundMethod, repairId: current.id, clientName: current.client.name } })
        refundMovementId = movement.id
      }
      const claimed = await tx.repair.updateMany({
        where: { id: current.id, businessId: auth.businessId, status: { not: RepairStatus.CANCELLED } },
        data: {
          status: RepairStatus.CANCELLED, cancelledAt,
          cancellationPaidAmount: current.paid, cancellationReviewFee: reviewFee, cancellationReviewPaid: 0, cancellationRefundAmount: refundAmount,
          cancellationRefundMethod: refundAmount > 0 ? parsed.data.refundMethod ?? null : null,
          cancellationRefundMovementId: refundMovementId, trackingEnabled: false,
        },
      })
      if (claimed.count !== 1) throw cancellationError(409, 'La reparación ya fue cancelada por otra operación')
      const settlement = reviewBalance > 0
        ? `Cancelación con saldo de revisión: abonado ${current.paid}, revisión ${reviewFee}, a cobrar ${reviewBalance}`
        : refundAmount > 0
          ? `Cancelación con devolución: abonado ${current.paid}, revisión ${reviewFee}, devuelto ${refundAmount}`
          : `Cancelación sin devolución: abonado ${current.paid}, revisión ${reviewFee}`
      await tx.repairStatusHistory.create({ data: { repairId: current.id, previousStatus: current.status, newStatus: RepairStatus.CANCELLED, internalNote: settlement, changedByUserId: auth.userId } })
      return tx.repair.findFirst({ where: { id: current.id }, include: includeRepair })
    }, { timeout: 15_000 })
    return res.json(repairResponse(authOf(req), repair))
  } catch (error) {
    const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
    return res.status(statusCode).json({ success: false, message: error instanceof Error && statusCode !== 500 ? error.message : 'No pudimos cancelar la reparación' })
  }
})
const cancellationPaymentSchema = z.object({ amount: z.number().int().positive(), method: z.nativeEnum(PaymentMethod) })
app.post('/api/repairs/:id/cancellation-payment', requirePermission('repairs.viewFinancials'), async (req, res) => {
  const parsed = cancellationPaymentSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de cobro de revisión inválidos' })
  const auth = authOf(req)
  const repairId = String(req.params.id)
  try {
    const repair = await prisma.$transaction(async tx => {
      const current = await tx.repair.findFirst({ where: { id: repairId, businessId: auth.businessId }, include: { client: true } })
      if (!current) throw cancellationError(404, 'Reparación no encontrada')
      if (current.status !== RepairStatus.CANCELLED) throw cancellationError(409, 'La reparación no está cancelada: usá el registro de pagos habitual')
      const reviewFee = current.cancellationReviewFee ?? 0
      const covered = current.cancellationReviewPaid ?? 0
      // El saldo descuenta el adelanto que el cliente ya entregó: lo que falta es sólo la diferencia.
      const balance = reviewFee - covered - (current.cancellationPaidAmount ?? 0)
      if (balance <= 0) throw cancellationError(409, 'La revisión ya está cobrada por completo')
      if (parsed.data.amount > balance) throw cancellationError(400, `El monto supera el saldo de revisión pendiente (${balance})`)
      const reviewMovement = await tx.cashMovement.create({ data: { businessId: current.businessId, type: CashMovementType.INCOME, origin: CashMovementOrigin.REPAIR, description: `Cobro revisión reparación #${current.number}`, amount: parsed.data.amount, method: parsed.data.method, repairId: current.id, clientName: current.client.name } })
      // Compare-and-swap sobre el saldo ya cubierto: dos cobros simultáneos del mismo saldo no pueden ocurrir.
      const claimed = await tx.repair.updateMany({
        where: { id: current.id, businessId: auth.businessId, status: RepairStatus.CANCELLED, cancellationReviewFee: reviewFee, cancellationReviewPaid: covered },
        data: { cancellationReviewPaid: { increment: parsed.data.amount } },
      })
      if (claimed.count !== 1) throw cancellationError(409, 'El cobro de revisión ya fue registrado por otra operación')
      // El cobro queda vinculado por ID a su ingreso de caja, igual que los pagos normales.
      await tx.payment.create({ data: { businessId: current.businessId, repairId: current.id, clientId: current.clientId, amount: parsed.data.amount, method: parsed.data.method, note: `Cobro revisión reparación #${current.number}`, cancellationReview: true, cashMovementId: reviewMovement.id } })
      return tx.repair.findFirst({ where: { id: current.id }, include: includeRepair })
    }, { timeout: 15_000 })
    return res.json(repairResponse(authOf(req), repair))
  } catch (error) {
    const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
    return res.status(statusCode).json({ success: false, message: error instanceof Error && statusCode !== 500 ? error.message : 'No pudimos registrar el cobro de revisión' })
  }
})
app.delete('/api/repairs/:id', requirePermission('repairs.delete'), async (req, res) => {
  const auth = authOf(req)
  const repair = await prisma.repair.findFirst({
    where: { id: String(req.params.id), businessId: auth.businessId },
    select: { id: true, paid: true, status: true, cancellationPaidAmount: true, _count: { select: { payments: true, parts: true, inventoryMovements: true, warrantyClaims: true, photos: true } } },
  })
  if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  const cashMovements = await prisma.cashMovement.count({ where: { repairId: repair.id, businessId: auth.businessId } })
  const counts = repair._count
  // Sólo se borra una orden que nunca generó actividad real: nada de dinero, stock ni garantía.
  const blockers: string[] = []
  if (repair.paid !== 0 || counts.payments > 0) blockers.push('pagos')
  if (cashMovements > 0) blockers.push('movimientos de caja')
  if (counts.parts > 0) blockers.push('repuestos usados')
  if (counts.inventoryMovements > 0) blockers.push('movimientos de stock')
  if (counts.warrantyClaims > 0) blockers.push('reclamos de garantía')
  if (counts.photos > 0) blockers.push('fotos')
  if (repair.status === RepairStatus.DELIVERED) blockers.push('fue entregada')
  if (repair.status === RepairStatus.CANCELLED && repair.cancellationPaidAmount != null) blockers.push('tiene una liquidación de cancelación')
  if (blockers.length) return res.status(409).json({ success: false, message: 'Esta reparación tiene actividad registrada. Cancelala en lugar de eliminarla para conservar el historial.', details: blockers })
  try {
    await prisma.repair.delete({ where: { id: repair.id } })
    return res.json({ success: true })
  } catch {
    return res.status(409).json({ success: false, message: 'No pudimos eliminar la reparación porque tiene registros relacionados.' })
  }
})
const legacyStatusRoute = (target: RepairStatus) => async (req: Request, res: Response) => {
  const parsed = statusMessagesSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de estado inválidos' })
  const auth = authOf(req)
  try {
    const result = await executeStatusChange(auth, String(req.params.id), target, parsed.data)
    return res.json(repairResponse(auth, result))
  } catch (error) {
    return statusFailure(res, error, 'No pudimos actualizar el estado')
  }
}
app.patch('/api/repairs/:id/approve', requirePermission('repairs.changeStatus'), legacyStatusRoute(RepairStatus.APPROVED))
app.patch('/api/repairs/:id/start', requirePermission('repairs.changeStatus'), legacyStatusRoute(RepairStatus.REPAIRING))

app.get('/api/clients', requirePermission('clients.view'), async (req, res) => {
  const businessId = authOf(req).businessId
  if (req.query.paginated !== 'true') return res.json(await prisma.client.findMany({ where: { businessId, deletedAt: null }, orderBy: { createdAt: 'desc' } }))
  const parsed = z.object({ page:z.coerce.number().int().positive().default(1), pageSize:z.coerce.number().int().min(1).max(100).default(10), search:z.string().trim().optional() }).safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ success:false, message:'Filtros inválidos' })
  const {page,pageSize,search}=parsed.data
  const where={businessId,deletedAt:null,...(search?{OR:[{name:{contains:search,mode:'insensitive' as const}},{phone:{contains:search}}]}:{})}
  const [items,total]=await prisma.$transaction([prisma.client.findMany({where,select:{id:true,name:true,phone:true,createdAt:true,_count:{select:{repairs:true}},repairs:{select:{deviceBrand:true,deviceModel:true},orderBy:[{createdAt:'desc'},{id:'desc'}],take:1}},orderBy:{createdAt:'desc'},skip:(page-1)*pageSize,take:pageSize}),prisma.client.count({where})])
  return res.json({items:items.map(({_count,repairs,...client})=>({...client,repairCount:_count.repairs,lastRepair:repairs[0]??null})),total,page,pageSize,totalPages:Math.max(1,Math.ceil(total/pageSize))})
})
app.get('/api/clients/options', requirePermission('clients.view'), async (req, res) => {
  return res.json(await prisma.client.findMany({ where: { businessId: authOf(req).businessId, deletedAt: null }, select: { id: true, name: true, phone: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }))
})
app.get('/api/clients/:id', requirePermission('clients.view'), async (req, res) => {
  const client = await prisma.client.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, include: { repairs: { select: clientRepairSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] } } })
  return client ? res.json(client) : res.status(404).json({ success: false, message: 'Cliente no encontrado' })
})
app.post('/api/clients', requirePermission('clients.create'), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2), phone: z.string().min(6).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos inválidos' })
  const businessId = authOf(req).businessId
  const phone = parsed.data.phone?.replace(/\D/g, '')
  if (phone && await prisma.client.findFirst({ where: { businessId, phone, deletedAt: null } })) return res.status(409).json({ success: false, message: 'Ya existe un cliente con ese teléfono' })
  return res.status(201).json(await prisma.client.create({ data: { businessId, name: parsed.data.name, phone } }))
})
app.patch('/api/clients/:id', requirePermission('clients.update'), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().min(6).optional().nullable() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos inválidos' })
  const businessId = authOf(req).businessId
  const current = await prisma.client.findFirst({ where: { id: String(req.params.id), businessId, deletedAt: null } })
  if (!current) return res.status(404).json({ success: false, message: 'Cliente no encontrado' })
  const phone = parsed.data.phone?.replace(/\D/g, '') || null
  if (phone && await prisma.client.findFirst({ where: { businessId, phone, deletedAt: null, NOT: { id: current.id } } })) return res.status(409).json({ success: false, message: 'Ya existe un cliente con ese teléfono' })
  const updated = await prisma.client.updateMany({ where: { id: current.id, businessId, deletedAt: null }, data: { name: parsed.data.name, phone } })
  if (!updated.count) return res.status(404).json({ success: false, message: 'Cliente no encontrado' })
  return res.json(await prisma.client.findFirst({ where: { id: current.id, businessId } }))
})
app.delete('/api/clients/:id', requirePermission('clients.delete'), async (req, res) => {
  const id = String(req.params.id), businessId = authOf(req).businessId
  const client = await prisma.client.findFirst({ where: { id, businessId }, select: { id: true, deletedAt: true } })
  if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' })
  // Guard the write too: repeated/concurrent DELETEs preserve the original timestamp.
  if (!client.deletedAt) await prisma.client.updateMany({ where: { id, businessId, deletedAt: null }, data: { deletedAt: new Date() } })
  return res.json({ success: true })
})

app.post('/api/repairs/:id/payments', requirePermission('repairs.viewFinancials'), async (req, res) => {
  const parsed = z.object({ amount: z.number().int().positive(), method: z.nativeEnum(PaymentMethod), note: z.string().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de pago inválidos' })
  const businessId = authOf(req).businessId
  const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId }, include: { client: true } })
  if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  if (repair.status === RepairStatus.CANCELLED) return res.status(409).json({ success: false, message: 'La reparación está cancelada y no admite nuevos pagos' })
  const payment = await prisma.$transaction(async tx => {
    const changed = await tx.repair.updateMany({
      where: { id: repair.id, businessId, status: { not: RepairStatus.CANCELLED }, paid: { lte: repair.total - parsed.data.amount } },
      data: { paid: { increment: parsed.data.amount } },
    })
    if (changed.count !== 1) return null
    // El pago y su ingreso de caja quedan vinculados por ID, no sólo por descripción.
    const movement = await tx.cashMovement.create({ data: { businessId, type: 'INCOME', origin: 'REPAIR', description: `Pago reparación #${repair.number}`, amount: parsed.data.amount, method: parsed.data.method, repairId: repair.id, clientName: repair.client.name } })
    const created = await tx.payment.create({ data: { businessId, ...parsed.data, repairId: repair.id, clientId: repair.clientId, cashMovementId: movement.id } })
    return created
  })
  return payment
    ? res.status(201).json(payment)
    : res.status(409).json({ success: false, message: 'El pago supera el saldo pendiente' })
})
app.get('/api/repairs/:id/payments', requirePermission('repairs.viewFinancials'), async (req, res) => {
  const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, select: { id: true } })
  if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  return res.json(await prisma.payment.findMany({ where: { repairId: repair.id, businessId: authOf(req).businessId }, orderBy: { createdAt: 'desc' } }))
})

app.get('/api/repairs/:id/history', requirePermission('repairs.view'), async (req, res) => {
  const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, select: { id: true } })
  if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  return res.json(repairHistoryResponse(authOf(req), await prisma.repairStatusHistory.findMany({ where: { repairId: repair.id }, orderBy: { createdAt: 'desc' } })))
})

app.post('/api/repairs/:id/tracking-link', requirePermission('repairs.shareTracking'), async (req, res) => {
  try { await assertWithinLimit(authOf(req).businessId, 'trackingLinks') } catch (error) { return res.status((error as { statusCode?: number }).statusCode ?? 409).json({ success: false, message: error instanceof Error ? error.message : 'Límite alcanzado' }) }
  const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, select: { id: true, status: true, trackingExpiresAt: true } })
  if (!repair) return res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  // Regenerar el enlace NO puede ser la forma de saltear el vencimiento: si el período ya
  // terminó, un token nuevo tampoco serviría de nada y sólo crearía la ilusión de que revive.
  if (isTrackingExpired(repair.trackingExpiresAt)) {
    const error = trackingExpiredError()
    return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message })
  }
  const trackingToken = generateTrackingToken()
  // `trackingExpiresAt` NO se toca: si la reparación ya está entregada y dentro del período,
  // el token nuevo hereda exactamente el mismo vencimiento, sin extenderlo ni acortarlo.
  return res.json(await prisma.repair.update({ where: { id: repair.id }, data: { trackingToken, trackingEnabled: true, trackingCreatedAt: new Date() }, select: { trackingToken: true, trackingEnabled: true, trackingExpiresAt: true } }))
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
    origin: z.nativeEnum(CashMovementOrigin).optional(),
    // Caja de reparaciones agrupada por reparación, con paginación por grupos.
    groupByRepair: z.coerce.boolean().optional(),
    // Período de todas las cajas. Un valor desconocido cae en TODAY en lugar de fallar.
    period: z.string().optional(),
  }).safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Parámetros de paginación inválidos' })

  const { page, pageSize } = parsed.data
  const businessId = authOf(req).businessId
  if (parsed.data.origin === 'COMMERCE') {
    try { await assertFeatureAccess(businessId, 'commerce') }
    catch (error) { return res.status((error as { statusCode?: number }).statusCode ?? 500).json({ success: false, message: error instanceof Error ? error.message : 'No pudimos validar Comercio.' }) }
  }
  // El backend es la única fuente de los límites temporales: el navegador elige el período
  // de una lista cerrada y nunca manda un rango arbitrario.
  const period = isCashPeriod(parsed.data.period) ? parsed.data.period : DEFAULT_CASH_PERIOD
  const now = new Date()
  const createdAt = cashPeriodWhere(period, now)
  const where = { businessId, ...(parsed.data.origin ? { origin: parsed.data.origin } : {}), createdAt }
  // El resumen usa exactamente el mismo rango que el listado: tarjetas y tabla no se contradicen.
  const summaryQuery = prisma.cashMovement.groupBy({ by: ['type'], where, orderBy: { type: 'asc' }, _sum: { amount: true } })
  const countQuery = prisma.cashMovement.count({ where })
  const buildSummary = (grouped: { type: CashMovementType; _sum: { amount: number | null } }[], totalMovements: number) => {
    const income = grouped.find(row => row.type === CashMovementType.INCOME)?._sum?.amount ?? 0
    const expense = grouped.find(row => row.type === CashMovementType.EXPENSE)?._sum?.amount ?? 0
    return { income, expense, balance: income - expense, totalMovements }
  }

  if (parsed.data.groupByRepair) {
    if (parsed.data.origin && parsed.data.origin !== 'REPAIR') {
      return res.status(400).json({ success: false, message: 'La agrupación por reparación sólo existe para la caja de reparaciones.' })
    }
    // El resumen y el total se leen juntos; la agrupación no cambia ninguna cifra.
    const [grouped, movementCount] = await prisma.$transaction([summaryQuery, countQuery], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
    const [groups, loose] = await Promise.all([repairCashGroups(businessId, page, pageSize, period, now), looseCashMovements(businessId, 'REPAIR', period, now)])
    return res.json({
      items: groups.items,
      total: groups.total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(groups.total / pageSize)),
      period,
      summary: buildSummary(grouped, movementCount),
      // Los movimientos manuales van en su propia tabla y NO se paginan con los grupos: la
      // paginación sigue siendo por reparación, así que un manual nunca desplaza un grupo.
      loose,
    })
  }

  // La tabla principal muestra sólo lo vinculado al módulo; los manuales van aparte pero
  // SIGUEN contando en el resumen de la caja: ningún importe se pierde por separarlos.
  const [items, linkedTotal, grouped, loose] = await prisma.$transaction([
    prisma.cashMovement.findMany({ where: { ...where, ...linkedWhereFor(parsed.data.origin) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.cashMovement.count({ where: { ...where, ...linkedWhereFor(parsed.data.origin) } }),
    summaryQuery,
    prisma.cashMovement.findMany({ where: { ...where, ...looseWhereFor(parsed.data.origin) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: looseColumns }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  const equipmentSummary = parsed.data.origin === 'EQUIPMENT' ? await deviceSummary(businessId, createdAt) : undefined
  return res.json({
    items,
    total: linkedTotal,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(linkedTotal / pageSize)),
    period,
    summary: buildSummary(grouped, linkedTotal + loose.length),
    loose: loose.length ? toLooseBlock(loose) : emptyLoose,
    ...(equipmentSummary ? { equipmentSummary } : {}),
  })
})
app.post('/api/cash/movements', requirePermission('cash.create'), async (req, res) => {
  const parsed = z.object({ type: z.nativeEnum(CashMovementType), origin: z.nativeEnum(CashMovementOrigin).default('GENERAL'), description: z.string().trim().min(2), amount: z.number().int().positive(), method: z.nativeEnum(PaymentMethod).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Movimiento inválido' })
  // COMMERCE es un origen válido de movements manuales: se valida el plan y se registra
  // un único CashMovement, igual que GENERAL, REPAIR y EQUIPMENT.
  if (parsed.data.origin === 'COMMERCE') {
    try { await assertFeatureAccess(authOf(req).businessId, 'commerce') }
    catch (error) { return res.status((error as { statusCode?: number }).statusCode ?? 500).json({ success: false, message: error instanceof Error ? error.message : 'No pudimos validar Comercio.' }) }
  }
  return res.status(201).json(await prisma.cashMovement.create({ data: { businessId: authOf(req).businessId, ...parsed.data } }))
})

app.use('/api/warranties', warrantiesRouter)
app.get('/api/dashboard/summary', requireRole('OWNER'), async (req, res) => {
  const businessId = authOf(req).businessId
  const canViewFinancials = authOf(req).role === 'OWNER'
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), month = new Date(now.getFullYear(), now.getMonth(), 1)
  // Every figure here is an aggregate: loading whole repairs (and their clients) just to count
  // them made this endpoint grow with the whole history. Recent repairs are the only rows needed.
  // The active set is "everything not finished", expressed as a negation so a new status is
  // counted automatically instead of needing this list updated.
  const activeWhere = { businessId, status: { notIn: [RepairStatus.DELIVERED, RepairStatus.CANCELLED] } }
  const [byStatusRows, activeRepairs, readyRepairs, activeWarranties, repairsToday, clients, pending, movements, recentRepairs] = await Promise.all([
    prisma.repair.groupBy({ by: ['status'], where: { businessId }, _count: { _all: true } }),
    prisma.repair.count({ where: activeWhere }),
    prisma.repair.count({ where: { businessId, status: RepairStatus.READY } }),
    prisma.repair.count({ where: { businessId, warrantyEnabled: true, warrantyDeletedAt: null, warrantyExpiresAt: { gte: now } } }),
    prisma.repair.count({ where: { businessId, createdAt: { gte: today } } }),
    prisma.client.count({ where: { businessId, deletedAt: null } }),
    // `pending` keeps its original meaning: the unpaid balance of EVERY repair, including
    // delivered and cancelled ones. Prisma cannot sum an expression, so the clamp is done in
    // SQL, always scoped to this business. The raw rows are never sent to the client.
    prisma.$queryRaw<Array<{ pending: number | null }>>`SELECT COALESCE(SUM(GREATEST("total" - "paid", 0)), 0) AS "pending" FROM "Repair" WHERE "businessId" = ${businessId}`,
    canViewFinancials ? prisma.cashMovement.findMany({ where: { businessId, createdAt: { gte: month } }, orderBy: { createdAt: 'asc' }, select: { type: true, amount: true, createdAt: true } }) : Promise.resolve([]),
    prisma.repair.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, number: true, deviceBrand: true, deviceModel: true, issue: true, status: true, total: true, createdAt: true, client: { select: { name: true } } },
    }),
  ])
  const income = movements.filter(m => m.type === 'INCOME').reduce((sum, m) => sum + m.amount, 0)
  const expenses = movements.filter(m => m.type === 'EXPENSE').reduce((sum, m) => sum + m.amount, 0)
  const flow = Array.from({ length: Math.min(31, now.getDate()) }, (_, index) => { const day = index + 1; const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return { label: String(day), key, income: 0, expense: 0 } })
  if (canViewFinancials) {
    for (const movement of movements.filter(m => m.type === 'INCOME')) { const point = flow.find(item => item.key === movement.createdAt.toISOString().slice(0, 10)); if (point) point.income += movement.amount }
    for (const movement of movements.filter(m => m.type === 'EXPENSE')) { const point = flow.find(item => item.key === movement.createdAt.toISOString().slice(0, 10)); if (point) point.expense += movement.amount }
  }
  const pendingBalance = Number(pending[0]?.pending ?? 0)
  const countByStatus = (status: RepairStatus) => byStatusRows.find(row => row.status === status)?._count._all ?? 0
  return res.json({ activeRepairs, readyRepairs, activeWarranties, repairsToday, monthlyIncome: income, monthlyExpenses: expenses, pending: canViewFinancials ? pendingBalance : 0, clients, byStatus: Object.values(RepairStatus).map(status => ({ status, value: countByStatus(status) })), cashFlow: flow.map(({ key: _key, ...point }) => point), recentRepairs })
})

const port = Number(process.env.PORT ?? 3000)
// Last resort: without these, Express answers with an HTML page that leaks the Node stack
// trace and absolute server paths. The message stays generic; the detail only goes to logs.
app.use((req: Request, res: Response) => res.status(404).json({ success: false, message: 'Recurso no encontrado' }))
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error)
  // Express attaches `type` to body-parser failures; route handlers may throw `statusCode`.
  const failure = error as { type?: string; statusCode?: unknown }
  // A malformed or oversized body is the caller's fault, not a server failure.
  if (failure.type === 'entity.parse.failed' || failure.type === 'entity.too.large') {
    return res.status(failure.type === 'entity.too.large' ? 413 : 400).json({ success: false, message: 'El contenido enviado no es válido' })
  }
  // A thrown `statusCode` is only trusted when it is a real HTTP error status; anything else
  // (0, 200, 999, NaN, a string) must not produce an absurd or crashing response.
  const candidate = failure.statusCode
  const statusCode = Number.isInteger(candidate) && Number(candidate) >= 400 && Number(candidate) <= 599 ? Number(candidate) : 500
  if (statusCode >= 500) {
    console.error('[error] No se pudo completar la petición', {
      method: req.method, path: `${req.baseUrl}${req.path}`,
      userId: req.auth?.userId, businessId: req.auth?.businessId,
      message: error?.message, stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack,
    })
  }
  return res.status(statusCode).json({ success: false, message: statusCode >= 500 ? 'Ocurrió un error inesperado' : error.message })
})
export const startServer = () => app.listen(port, '0.0.0.0', () => {
  console.log(`TecnoDesk API iniciada en el puerto ${port} (${process.env.NODE_ENV ?? 'development'})`)
})
if (require.main === module) startServer()

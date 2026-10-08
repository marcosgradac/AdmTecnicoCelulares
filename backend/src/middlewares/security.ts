import { clientIp, clientIpConfig, clientIpKey } from './client-ip'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { createHash } from 'node:crypto'
import { securityConfig } from '../config/security'

const retryAfter = (req: Request) => {
  const resetTime = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime?.getTime()
  return resetTime ? Math.max(1, Math.ceil((resetTime - Date.now()) / 1000)) : undefined
}

const event = (name: string, req: Request) => console.warn(name, {
  endpoint: `${req.method} ${req.baseUrl}${req.path}`,
  userId: req.auth?.userId,
  ipHash: createHash('sha256').update(`${process.env.JWT_SECRET ?? 'local'}:${clientIp(req) || 'unknown'}`).digest('hex').slice(0, 16),
  timestamp: new Date().toISOString(),
})

const handler = (eventName: string, message = 'Hiciste demasiados intentos. Esperá unos minutos y volvé a intentar.') =>
  (req: Request, res: Response) => {
    event(eventName, req)
    const seconds = retryAfter(req)
    if (seconds) res.setHeader('Retry-After', String(seconds))
    return res.status(429).json({ success: false, message, retryAfter: seconds })
  }

const ipKey = clientIpKey

// Los preflight CORS no representan una operacion del usuario: se responden antes de
// llegar a las rutas, asi que contarlos solo agotaria el presupuesto del cliente legitimo.
const isPreflight = (req: Request) => req.method === 'OPTIONS'

// /health y /api/health los consulta la plataforma de hosting desde IPs de
// infraestructura, no los usuarios. Si contaran aqui, un health check podria
// contribuir a bloquear el trafico real del comercio.
const isHealthCheck = (req: Request) => {
  const path = req.originalUrl.split('?')[0]
  return path === '/health' || path === '/api/health'
}

const limiter = (
  windowMs: number,
  limit: number,
  eventName: string,
  keyGenerator?: (req: Request) => string,
  skip?: (req: Request) => boolean,
) => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: keyGenerator ?? ipKey,
  skip: skip ?? (() => false),
  handler: handler(eventName),
})

export const globalApiLimiter = limiter(
  securityConfig.rateLimits.global.windowMs,
  securityConfig.rateLimits.global.limit,
  'RATE_LIMIT_HIT',
  undefined,
  req => isPreflight(req) || isHealthCheck(req),
)

// Presupuesto por usuario autenticado. Debe montarse DESPUES de `authenticate` para que
// `req.auth.userId` exista; si faltara, cae a la IP para no dejar el endpoint sin proteccion.
export const authenticatedApiLimiter = limiter(
  securityConfig.rateLimits.authenticatedApi.windowMs,
  securityConfig.rateLimits.authenticatedApi.limit,
  'RATE_LIMIT_HIT',
  req => req.auth?.userId ?? ipKey(req),
  isPreflight,
)

export const loginIpLimiter = limiter(securityConfig.rateLimits.loginIp.windowMs, securityConfig.rateLimits.loginIp.limit, 'LOGIN_RATE_LIMIT')
export const signupLimiter = limiter(securityConfig.rateLimits.signup.windowMs, securityConfig.rateLimits.signup.limit, 'SIGNUP_RATE_LIMIT')
// Readiness has its own IP budget; liveness must remain unthrottled and DB-free.
export const healthReadinessLimiter = rateLimit({
  windowMs: securityConfig.rateLimits.health.windowMs,
  limit: securityConfig.rateLimits.health.limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: ipKey,
  handler: (req, res) => {
    const seconds = retryAfter(req)
    if (seconds) res.setHeader('Retry-After', String(seconds))
    return res.status(429).json({ status: 'error', ok: false, message: 'Demasiadas solicitudes. Intentá nuevamente más tarde.', retryAfter: seconds })
  },
})
// Separate IP budget for social previews; do not log the token-bearing request path.
const previewHandler = (req: Request, res: Response) => {
  const seconds = retryAfter(req)
  if (seconds) res.setHeader('Retry-After', String(seconds))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
  return res.status(429).json({ success: false, message: 'Demasiadas solicitudes. Intentá nuevamente más tarde.', retryAfter: seconds })
}
export const trackingPreviewLimiter: RequestHandler[] = [rateLimit({
  windowMs: securityConfig.rateLimits.trackingPreview.windowMs,
  // CF can represent a shared crawler/Vercel egress. Never infer trust from UA/XFF.
  limit: clientIpConfig.mode === 'cf' ? securityConfig.rateLimits.trackingPreviewCf.limit : securityConfig.rateLimits.trackingPreview.limit,
  standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: ipKey,
  handler: previewHandler,
}), rateLimit({
  windowMs: securityConfig.rateLimits.trackingPreview.windowMs,
  limit: securityConfig.rateLimits.trackingPreview.limit,
  standardHeaders: 'draft-8', legacyHeaders: false,
  skip: () => clientIpConfig.mode !== 'cf',
  // Pair budget is additional to the IP ceiling; rotating links cannot evade that ceiling.
  keyGenerator: req => `${ipKey(req)}:${createHash('sha256').update(String(req.params.token ?? '').slice(0, 128)).digest('hex')}`,
  handler: previewHandler,
})]
export const publicTrackingLimiter = limiter(
  securityConfig.rateLimits.publicTracking.windowMs,
  securityConfig.rateLimits.publicTracking.limit,
  'PUBLIC_TRACKING_ABUSE',
  req => `${ipKey(req)}:${String(req.params.token ?? '').slice(0, 128)}`,
)
export const passwordCodeUserLimiter = limiter(
  securityConfig.rateLimits.passwordCodeUser.windowMs,
  securityConfig.rateLimits.passwordCodeUser.limit,
  'PASSWORD_CODE_RATE_LIMIT',
  req => req.auth?.userId ?? ipKey(req),
)
export const passwordCodeIpLimiter = limiter(securityConfig.rateLimits.passwordCodeIp.windowMs, securityConfig.rateLimits.passwordCodeIp.limit, 'PASSWORD_CODE_RATE_LIMIT')
export const passwordVerifyLimiter = limiter(
  securityConfig.rateLimits.passwordVerify.windowMs,
  securityConfig.rateLimits.passwordVerify.limit,
  'PASSWORD_CODE_RATE_LIMIT',
  req => `${req.auth?.userId ?? 'anonymous'}:${ipKey(req)}`,
)
export const authenticatedWriteLimiter = limiter(
  securityConfig.rateLimits.authenticatedWrites.windowMs,
  securityConfig.rateLimits.authenticatedWrites.limit,
  'RATE_LIMIT_HIT',
  req => req.auth?.userId ?? ipKey(req),
)
export const superAdminWriteLimiter = limiter(
  securityConfig.rateLimits.superAdminWrites.windowMs,
  securityConfig.rateLimits.superAdminWrites.limit,
  'RATE_LIMIT_HIT',
  req => req.auth?.userId ?? ipKey(req),
)

export const limitAuthenticatedWrites = (req: Request, res: Response, next: NextFunction) =>
  ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? authenticatedWriteLimiter(req, res, next) : next()

export const limitSuperAdminWrites = (req: Request, res: Response, next: NextFunction) =>
  ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? superAdminWriteLimiter(req, res, next) : next()

type RiskState = { count: number; updatedAt: number; blockedUntil?: number }
const loginFailures = new Map<string, RiskState>()
const trackingMisses = new Map<string, RiskState>()

const current = (store: Map<string, RiskState>, key: string, ttl: number) => {
  const value = store.get(key)
  if (value && Date.now() - value.updatedAt <= ttl) return value
  store.delete(key)
  return { count: 0, updatedAt: Date.now() }
}

export const loginRisk = {
  get: (email: string) => current(loginFailures, email, securityConfig.login.stateTtlMs),
  fail: (email: string) => {
    const previous = current(loginFailures, email, securityConfig.login.stateTtlMs)
    const count = previous.count + 1
    const extra = count >= securityConfig.login.backoffAfterFailures ? count - securityConfig.login.backoffAfterFailures + 1 : 0
    const blockedUntil = extra ? Date.now() + Math.min(5 * 60_000, 30_000 * (2 ** (extra - 1))) : undefined
    const next = { count, updatedAt: Date.now(), blockedUntil }
    loginFailures.set(email, next)
    return next
  },
  clear: (email: string) => loginFailures.delete(email),
  requiresCaptcha: (state: RiskState) => state.count >= securityConfig.login.captchaAfterFailures,
}

export const trackingRisk = {
  get: (ip: string) => current(trackingMisses, ip, securityConfig.tracking.stateTtlMs),
  miss: (ip: string) => {
    const previous = current(trackingMisses, ip, securityConfig.tracking.stateTtlMs)
    const next = { count: previous.count + 1, updatedAt: Date.now() }
    trackingMisses.set(ip, next)
    return next
  },
  clear: (ip: string) => trackingMisses.delete(ip),
  requiresCaptcha: (state: RiskState) => state.count >= securityConfig.tracking.captchaAfterMisses,
}

export const logTurnstileFailure = (req: Request) => event('TURNSTILE_FAILED', req)

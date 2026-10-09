import type { Request, RequestHandler } from 'express'
import { isIP } from 'node:net'
import { performance } from 'node:perf_hooks'
import { ipKeyGenerator } from 'express-rate-limit'

export type ClientIpConfig = Readonly<{ mode: 'baseline' | 'cf'; invalidLimit?: number }>
export function readClientIpConfig(environment: Record<string, string | undefined>): ClientIpConfig {
  const mode = environment.CLIENT_IP_MODE ?? 'baseline'
  if (mode !== 'baseline' && mode !== 'cf') throw new Error('Invalid client IP mode')
  if (mode === 'baseline') return Object.freeze({ mode })
  if (environment.CLIENT_IP_CF_TRUST_ACK !== 'render-public-web-service') {
    throw new Error('CF identity requires explicit public Render ingress acknowledgment')
  }
  const invalidLimit = Number(environment.CLIENT_IP_INVALID_MAX ?? 60)
  if (!Number.isInteger(invalidLimit) || invalidLimit < 1 || invalidLimit > 600) {
    throw new Error('Invalid CF header budget: use an integer between 1 and 600')
  }
  return Object.freeze({ mode, invalidLimit })
}
export const clientIpConfig = readClientIpConfig(process.env)
const identities = new WeakMap<Request, { ip: string; mode: ClientIpConfig['mode'] }>()

// Canonicalize IPv6 and both dotted/hex IPv4-mapped spellings before computing budgets.
function normalizeIp(value: string): string {
  if (isIP(value) === 4) return value
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1)
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical)
  if (!mapped) return canonical
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16)
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}
function parseCfIp(req: Request): string | undefined {
  let occurrences = 0
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i].toLowerCase() === 'cf-connecting-ip' && ++occurrences > 1) return undefined
  }
  const value = req.get('cf-connecting-ip')
  if (occurrences !== 1 || typeof value !== 'string' || value.length > 45 || value.includes('%') || !isIP(value)) {
    return undefined
  }
  return normalizeIp(value)
}
export function createClientIpMiddleware(
  config: ClientIpConfig = clientIpConfig,
  now: () => number = () => performance.now(),
): RequestHandler {
  const invalidLimit = config.invalidLimit ?? 60
  if (config.mode === 'cf' && (!Number.isInteger(invalidLimit) || invalidLimit < 1 || invalidLimit > 600)) {
    throw new Error('Invalid CF header budget')
  }
  // One saturated counter per middleware/process; no attacker-controlled identity map.
  let windowStart = now()
  let invalidAttempts = 0
  return (req, res, next) => {
    const ip = config.mode === 'cf' ? parseCfIp(req) : req.ip ?? ''
    if (ip === undefined) {
      const time = now()
      if (time - windowStart >= 60_000) {
        windowStart = time
        invalidAttempts = 0
      }
      const blocked = invalidAttempts >= invalidLimit
      if (!blocked) invalidAttempts++
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
      if (blocked) res.setHeader('Retry-After', String(Math.max(1, Math.ceil((60_000 - (time - windowStart)) / 1000))))
      res.status(blocked ? 429 : 400).json({ success: false, message: 'Solicitud inválida.' })
      return
    }
    // Valid traffic never consumes or is rejected by the invalid-header counter.
    identities.set(req, { ip, mode: config.mode })
    next()
  }
}
export function clientIp(req: Request): string {
  const selected = identities.get(req)
  if (selected) return selected.ip
  // CF identity is usable only after the centralized middleware validated this request.
  if (clientIpConfig.mode === 'baseline') return req.ip ?? ''
  throw new Error('Client IP middleware is required in CF mode')
}
export const clientIpKey = (req: Request) => ipKeyGenerator(clientIp(req))
export function clientRiskKey(req: Request): string {
  const mode = identities.get(req)?.mode ?? clientIpConfig.mode
  return mode === 'cf' ? clientIpKey(req) : clientIp(req) || 'unknown'
}

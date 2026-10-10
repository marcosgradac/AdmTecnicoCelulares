import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
const headerName = 'x-tecnodesk-origin-auth'
const configurationError = () => new Error('Origin authentication configuration is invalid')
/** Validates at startup. No configured value is included in errors or logs. */
export function createOriginAuthMiddleware(environment: NodeJS.ProcessEnv = process.env): RequestHandler {
  const flag = environment.ORIGIN_AUTH_ENABLED
  if (flag !== undefined && flag !== 'false' && flag !== 'true') throw configurationError()
  if (flag !== 'true') {
    console.info('[origin-auth] disabled')
    return (_req, _res, next) => next()
  }
  const configuredSecret = environment.ORIGIN_AUTH_SECRET
  if (!configuredSecret || !/^[a-f0-9]{64}$/.test(configuredSecret)) throw configurationError()
  const expected = Buffer.from(configuredSecret, 'ascii')
  console.info('[origin-auth] enabled')
  return (req, res, next) => {
    // Exact liveness path only; HEAD, OPTIONS and readiness are not exempt.
    if (req.method === 'GET' && req.path === '/health') return next()
    let occurrences = 0
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if (req.rawHeaders[i].toLowerCase() === headerName) occurrences++
    }
    const supplied = req.headers[headerName]
    const valid = occurrences === 1 && typeof supplied === 'string'
      && /^[a-f0-9]{64}$/.test(supplied)
      && timingSafeEqual(expected, Buffer.from(supplied, 'ascii'))
    if (valid) return next()
    // No credential, IP, path or token is logged. Reject before CORS/body/DB.
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
    res.status(403).json({ success: false, message: 'Solicitud no autorizada.' })
  }
}

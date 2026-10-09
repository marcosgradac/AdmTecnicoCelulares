import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { RequestHandler, Response } from 'express'
import { clientIpKey } from './client-ip'

export class PreviewCapacityError extends Error {
  constructor() { super('Preview lookup capacity exhausted') }
}
export function rejectTrackingPreview(res: Response, seconds: number) {
  res.setHeader('Retry-After', String(seconds))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
  return res.status(429).json({ success: false, message: 'Demasiadas solicitudes. Intentá nuevamente más tarde.', retryAfter: seconds })
}

type Options = { windowMs: number; linkMax: number; ipMax: number; globalMax: number; maxEntries?: number; maxConcurrent?: number }
export function createTrackingPreviewProtection(options: Options, now: () => number = () => performance.now()) {
  const maxEntries = options.maxEntries ?? 2048
  const maxConcurrent = options.maxConcurrent ?? 4
  for (const value of [options.windowMs, options.linkMax, options.ipMax, options.globalMax, maxEntries, maxConcurrent]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid preview protection configuration')
  }
  // Fixed-size keys and a hard entry ceiling. No eviction that could reset a budget.
  const counters = new Map<string, number>()
  let windowStart = now(), accepted = 0, active = 0
  const middleware: RequestHandler = (req, res, next) => {
    const time = now()
    if (time - windowStart >= options.windowMs) {
      counters.clear(); accepted = 0; windowStart = time
    }
    const seconds = Math.max(1, Math.ceil((options.windowMs - (time - windowStart)) / 1000))
    const ip = clientIpKey(req)
    const ipKey = `ip:${ip}`
    const linkKey = `link:${ip}:${createHash('sha256').update(String(req.params.token ?? '').slice(0, 128)).digest('hex')}`
    const linkCount = counters.get(linkKey) ?? 0
    // Reject an exhausted link BEFORE charging either shared budget.
    if (linkCount >= options.linkMax) return void rejectTrackingPreview(res, seconds)
    const ipCount = counters.get(ipKey) ?? 0
    const needed = Number(!counters.has(linkKey)) + Number(!counters.has(ipKey))
    if (ipCount >= options.ipMax || accepted >= options.globalMax || counters.size + needed > maxEntries) {
      return void rejectTrackingPreview(res, seconds)
    }
    // Admission and the route's runLookup call are synchronous, without an await
    // between them. Reject full capacity before creating entries or charging budgets.
    if (active >= maxConcurrent) return void rejectTrackingPreview(res, 1)
    counters.set(linkKey, linkCount + 1); counters.set(ipKey, ipCount + 1); accepted++
    next()
  }
  const runLookup = async <T>(query: () => Promise<T>): Promise<T> => {
    if (active >= maxConcurrent) throw new PreviewCapacityError()
    active++
    // Hold the slot until Prisma settles, even if the HTTP client disconnects.
    try { return await query() } finally { active-- }
  }
  return { middleware, runLookup, state: () => ({ entries: counters.size, accepted, active }) }
}
import { PreviewCapacityError, rejectTrackingPreview } from '../../middlewares/tracking-preview-protection'
import { type Request, type Response } from 'express'
import { prisma } from '../../lib/prisma'
import { isTrackingPreviewToken, renderTrackingPreview, trackingPreviewSelect } from './tracking-preview'
import { trackingPreviewLimiter, trackingPreviewLookup } from '../../middlewares/security'
import type { Express } from 'express'
import { publicBusinessLogoUrl } from './business-logo'

export function registerTrackingPreviewRoutes(app: Express) {
  // Social metadata is independent of interactive tracking risk and lookup budgets.
  // This route is BEFORE globalApiLimiter: only its own preview limits protect Prisma.
  app.get('/api/tracking-preview/:token', trackingPreviewLimiter, async (req: Request, res: Response) => {
    const token = String(req.params.token)
    const clientSlug = typeof req.query.clientSlug === 'string' ? req.query.clientSlug : undefined
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
    if (!isTrackingPreviewToken(token)) {
      return res.type('html').send(renderTrackingPreview(null, token, clientSlug, publicBusinessLogoUrl))
    }
    try {
      const repair = await trackingPreviewLookup(() => prisma.repair.findUnique({ where: { trackingToken: token }, select: trackingPreviewSelect }))
      return res.type('html').send(renderTrackingPreview(repair, token, clientSlug, publicBusinessLogoUrl))
    } catch (error) {
      if (error instanceof PreviewCapacityError) return rejectTrackingPreview(res, 1)
      // A lookup failure must not leak partial tenant metadata or database details.
      return res.status(503).type('html').send(renderTrackingPreview(null, token, clientSlug, publicBusinessLogoUrl))
    }
  })
}

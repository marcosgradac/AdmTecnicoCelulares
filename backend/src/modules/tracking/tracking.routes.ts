import { clientIp, clientRiskKey } from '../../middlewares/client-ip'
import { prisma } from '../../lib/prisma'
import { classifyTracking, isLegitimateTrackingLookup, TRACKING_EXPIRED_CODE, TRACKING_EXPIRED_MESSAGE } from './tracking-expiry'
import { logTurnstileFailure, publicTrackingLimiter, trackingRisk } from '../../middlewares/security'
import { TurnstileUnavailableError, verifyTurnstileToken } from '../../services/antiBot/turnstile.service'
import type { Express } from 'express'
import { publicBusinessLogoUrl } from './business-logo'

export function registerBusinessLogoRoutes(app: Express) {
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
}
export function registerPublicTrackingRoutes(app: Express) {
  const publicRepairSelect = {
    id: true, number: true, deviceBrand: true, deviceModel: true, issue: true,
    status: true, total: true, paid: true, trackingToken: true, trackingEnabled: true, trackingExpiresAt: true,
    estimatedDeliveryDate: true, createdAt: true, updatedAt: true,
    business: { select: { id: true, name: true, logoUrl: true } },
    statusHistory: { where: { publicMessage: { not: null } }, select: { newStatus: true, publicMessage: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
  } as const
  app.get('/api/tracking/:token', publicTrackingLimiter, async (req, res) => {
    try {
      const ip = clientRiskKey(req)
      const risk = trackingRisk.get(ip)
      if (trackingRisk.requiresCaptcha(risk)) {
        try {
          if (!await verifyTurnstileToken(req.header('x-turnstile-token'), clientIp(req))) {
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
}

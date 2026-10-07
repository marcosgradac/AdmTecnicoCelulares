import { classifyTracking } from './tracking-expiry'
import { isShortTrackingToken } from './tracking-token'

export const isTrackingPreviewToken = (token: string): boolean =>
  (token.length === 16 && isShortTrackingToken(token)) || (token.length === 64 && /^[a-fA-F0-9]{64}$/.test(token))

const FRONTEND_ORIGIN = 'https://www.tecnodeskpro.com'
const BACKEND_ORIGIN = 'https://tecnodesk-api.onrender.com'
const FALLBACK_IMAGE = `${FRONTEND_ORIGIN}/tecnodesk-192.png`
const DESCRIPTION = 'Seguí el estado de tu reparación en tiempo real.'

/** This projection deliberately excludes all repair and client details. */
export const trackingPreviewSelect = {
  trackingEnabled: true,
  trackingExpiresAt: true,
  business: { select: { id: true, name: true, logoUrl: true } },
} as const

type PreviewRepair = {
  trackingEnabled: boolean
  trackingExpiresAt: Date | null
  business: { id: string; name: string | null; logoUrl: string | null }
}

export const escapePreviewHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!))

/** Only HTTP(S) images; data logos must go through the existing public image endpoint. */
const absoluteImage = (logo: string | null): string => {
  if (!logo) return FALLBACK_IMAGE
  try {
    const url = new URL(logo, BACKEND_ORIGIN)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : FALLBACK_IMAGE
  } catch { return FALLBACK_IMAGE }
}

export function renderTrackingPreview(
  repair: PreviewRepair | null,
  token: string,
  clientSlug: string | undefined,
  publicBusinessLogoUrl: (businessId: string, storedLogo: string | null) => string | null,
): string {
  const business = classifyTracking(repair) === 'valid' ? repair?.business : undefined
  const title = business?.name?.trim() || 'TecnoDesk'
  const image = business ? absoluteImage(publicBusinessLogoUrl(business.id, business.logoUrl)) : FALLBACK_IMAGE
  // The slug only reconstructs the shared URL; it never participates in the DB lookup.
  const path = clientSlug === undefined
    ? `/seguimiento/${encodeURIComponent(token)}`
    : `/s/${encodeURIComponent(clientSlug)}/${encodeURIComponent(token)}`
  const values = { title, image, url: `${FRONTEND_ORIGIN}${path}`, description: DESCRIPTION }
  const escaped = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, escapePreviewHtml(value)]))
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<title>${escaped.title}</title>
<meta name="description" content="${escaped.description}">
<meta property="og:title" content="${escaped.title}">
<meta property="og:description" content="${escaped.description}">
<meta property="og:type" content="website">
<meta property="og:image" content="${escaped.image}">
<meta property="og:url" content="${escaped.url}">
<meta name="robots" content="noindex,nofollow,noarchive">
</head><body></body></html>`
}

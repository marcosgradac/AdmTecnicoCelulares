const LEGACY_API_ORIGIN = 'https://tecnodesk-api.onrender.com'

/** Public image origin, never derived from request headers. HTTPS origins only. */
export function parsePublicApiOrigin(value: string | undefined): string {
  if (value === undefined) return LEGACY_API_ORIGIN
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/'
      || url.search || url.hash) throw new Error('invalid origin')
    return url.origin
  } catch {
    // Do not include the configured value: it could accidentally contain credentials.
    throw new Error('PUBLIC_API_ORIGIN debe ser un origen HTTPS sin credenciales, ruta, query ni fragmento')
  }
}

export const publicApiOrigin = parsePublicApiOrigin(process.env.PUBLIC_API_ORIGIN)

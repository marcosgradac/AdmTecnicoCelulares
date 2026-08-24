type TurnstileResponse = {
  success: boolean
  'error-codes'?: string[]
}

export class TurnstileUnavailableError extends Error {}

const unavailable = (reason: string) => {
  console.error('[security] TURNSTILE_UNAVAILABLE', { reason, timestamp: new Date().toISOString() })
  return new TurnstileUnavailableError(reason)
}

export async function verifyTurnstileToken(token: string | undefined, ip?: string) {
  if (!token) return process.env.NODE_ENV === 'test'
  const secret = process.env.TURNSTILE_SECRET_KEY
    || (process.env.NODE_ENV !== 'production' ? '1x0000000000000000000000000000000AA' : '')
  if (!secret) throw unavailable('missing-secret')

  const body = new URLSearchParams({ secret, response: token })
  if (ip) body.set('remoteip', ip)

  let response: Response
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    throw unavailable('siteverify-unreachable')
  }

  if (!response.ok) throw unavailable(`siteverify-http-${response.status}`)
  const result = await response.json() as TurnstileResponse
  return result.success === true
}

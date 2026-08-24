type TurnstileResponse = {
  success: boolean
  'error-codes'?: string[]
}

export class TurnstileUnavailableError extends Error {}

export async function verifyTurnstileToken(token: string | undefined, ip?: string) {
  if (!token) return process.env.NODE_ENV === 'test'
  const secret = process.env.TURNSTILE_SECRET_KEY
    || (process.env.NODE_ENV !== 'production' ? '1x0000000000000000000000000000000AA' : '')
  if (!secret) throw new TurnstileUnavailableError('Turnstile no está configurado')

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
    throw new TurnstileUnavailableError('No se pudo contactar a Turnstile')
  }

  if (!response.ok) throw new TurnstileUnavailableError('Turnstile respondió con error')
  const result = await response.json() as TurnstileResponse
  return result.success === true
}

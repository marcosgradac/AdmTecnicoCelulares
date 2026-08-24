import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'

process.env.MAIL_MODE = 'fake'
process.env.NODE_ENV = 'test'
process.env.FRONTEND_URL = 'http://localhost:5173'
process.env.PASSWORD_RESET_RATE_LIMIT_MAX = '8'
process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = '60000'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

async function main() {
const [{ app }, { prisma }, mail] = await Promise.all([
  import('../src/server'),
  import('../src/lib/prisma'),
  import('../src/services/email/email.service'),
])

const server = app.listen(0)
await new Promise<void>(resolve => server.once('listening', resolve))
const address = server.address()
assert.ok(address && typeof address === 'object')
const base = `http://127.0.0.1:${address.port}/api`
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const email = `password-reset-${suffix}@example.com`
const oldPassword = 'ClaveAnterior123'
const validPassword = 'ClaveNueva456'
let passed = 0

const check = (condition: unknown, label: string) => {
  assert.ok(condition, label)
  console.log(`OK ${++passed}: ${label}`)
}
const request = async (path: string, body?: object, token?: string) => {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}
const tokenFromLastMail = () => {
  const sent = mail.getFakeOutbox().at(-1)
  assert.ok(sent)
  return new URL(sent.resetUrl).searchParams.get('token') ?? ''
}

try {
  const registered = await request('/auth/register', {
    firstName: 'Recuperación',
    lastName: 'QA',
    email,
    password: oldPassword,
    businessName: `Negocio reset ${suffix}`,
    businessPhone: '+54 11 4444-2222',
    phone: '+54 11 5555-1111',
    termsAccepted: true,
    termsVersion: '1.0',
    privacyAccepted: true,
    privacyVersion: '1.0',
    turnstileToken: 'test-token',
  })
  check(registered.status === 201, 'cuenta de prueba registrada')
  const oldSession = registered.body.token as string

  mail.clearFakeOutbox()
  const unknown = await request('/auth/forgot-password', { email: `unknown-${suffix}@example.com` })
  check(unknown.status === 200 && mail.getFakeOutbox().length === 0, 'email inexistente recibe respuesta genérica sin correo')

  const forgot = await request('/auth/forgot-password', { email })
  check(forgot.status === 200 && mail.getFakeOutbox().length === 1, 'email registrado genera un correo fake')
  const validToken = tokenFromLastMail()
  check(/^[a-f0-9]{64}$/.test(validToken), 'token aleatorio tiene 256 bits codificados en hexadecimal')

  const tokenRecord = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: createHash('sha256').update(validToken).digest('hex') },
  })
  check(Boolean(tokenRecord) && tokenRecord?.tokenHash !== validToken, 'base almacena solamente el hash SHA-256')

  const reset = await request('/auth/reset-password', { token: validToken, password: validPassword })
  check(reset.status === 200, 'token válido restablece la contraseña')
  check((await request('/auth/login', { email, password: oldPassword })).status === 401, 'contraseña anterior deja de funcionar')
  check((await request('/auth/login', { email, password: validPassword })).status === 200, 'contraseña nueva permite iniciar sesión')
  check((await request('/auth/me', undefined, oldSession)).status === 401, 'tokenVersion invalida la sesión anterior')

  const reused = await request('/auth/reset-password', { token: validToken, password: 'OtraClave789' })
  check(reused.status === 400, 'token usado no puede reutilizarse')

  const expiredRaw = randomBytes(32).toString('hex')
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(expiredRaw).digest('hex'),
      expiresAt: new Date(Date.now() - 60_000),
    },
  })
  check((await request('/auth/reset-password', { token: expiredRaw, password: 'ClaveVencida123' })).status === 400, 'token vencido es rechazado')

  await request('/auth/forgot-password', { email })
  const concurrentToken = tokenFromLastMail()
  const concurrent = await Promise.all([
    request('/auth/reset-password', { token: concurrentToken, password: 'ConcurrenteA123' }),
    request('/auth/reset-password', { token: concurrentToken, password: 'ConcurrenteB123' }),
  ])
  check(concurrent.filter(result => result.status === 200).length === 1, 'dos consumos concurrentes producen un solo éxito')
  check(concurrent.filter(result => result.status === 400).length === 1, 'el segundo consumo concurrente es rechazado')

  const concurrentLogins = await Promise.all([
    request('/auth/login', { email, password: 'ConcurrenteA123' }),
    request('/auth/login', { email, password: 'ConcurrenteB123' }),
  ])
  check(concurrentLogins.filter(result => result.status === 200).length === 1, 'solo la contraseña de la transacción ganadora queda activa')
  const consumed = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: createHash('sha256').update(concurrentToken).digest('hex') },
  })
  check(Boolean(consumed?.usedAt), 'token concurrente queda marcado como usado')

  let forgotLimited = false
  for (let index = 0; index < 8; index += 1) {
    if ((await request('/auth/forgot-password', { email: `rate-${index}-${suffix}@example.com` })).status === 429) {
      forgotLimited = true
      break
    }
  }
  check(forgotLimited, 'forgot-password aplica su rate limiting específico')

  let resetLimited = false
  const invalidToken = randomBytes(32).toString('hex')
  for (let index = 0; index < 8; index += 1) {
    if ((await request('/auth/reset-password', { token: invalidToken, password: 'RateLimit123' })).status === 429) {
      resetLimited = true
      break
    }
  }
  check(resetLimited, 'reset-password aplica su rate limiting específico e independiente')
  console.log(`PASSWORD RESET TESTS PASSED: ${passed}`)
} finally {
  await prisma.$disconnect()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

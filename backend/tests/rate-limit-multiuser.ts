// Multi-user rate limit probe: several employees behind the SAME public IP must not
// starve each other. Limits are lowered through the documented env vars so the test
// stays fast while still exercising the real middleware chain.
import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'

// Refuse remote databases before touching Prisma.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Use only a local test database')

process.env.NODE_ENV = 'test'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
// Small windows keep the test quick; the middleware behaviour under test is identical.
// These must be set BEFORE the config module is evaluated, hence the dynamic import below.
process.env.RATE_LIMIT_GLOBAL_MAX = '600'
process.env.RATE_LIMIT_AUTH_MAX = '20'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '5'

// Loaded after the env is in place so the limits above actually take effect.
// Top-level await is unavailable in the CJS output, so this resolves inside main().
const securityConfig = () => import('../src/config/security').then(module => module.securityConfig)

const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

let app: typeof import('../src/server').app
let prisma: typeof import('../src/lib/prisma').prisma

const USERS = 4
const READS_PER_USER = 15
// The per-user budgets are read from the config once the env is in place, inside main().

type Account = { userId: string, businessId: string, token: string }

const request = async (base: string, method: string, path: string, token?: string, body?: object) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) as Record<string, unknown> : null, headers: response.headers }
}

async function main() {
  const config = await securityConfig()
  ;({ app } = await import('../src/server'))
  ;({ prisma } = await import('../src/lib/prisma'))
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const root = `http://127.0.0.1:${address.port}`
  const suffix = randomBytes(6).toString('hex')
  const businessIds: string[] = []
  // 4 users x 15 reads = 60 real authenticated calls that previously shared a single
  // 120/min IP bucket and now live in 4 separate per-user buckets.
  const READS = config.rateLimits.authenticatedApi.limit
  const WRITES = config.rateLimits.authenticatedWrites.limit

  try {
    console.log(`limites: global=${config.rateLimits.global.limit} auth=${READS} writes=${WRITES} por usuario`)

    // Four distinct users created straight through Prisma and signed locally.
    // Registering over HTTP is avoided on purpose: the signup limiter (3/hour per IP)
    // would block this test before it could even build four accounts, and that limit
    // must stay untouched.
    const passwordHash = 'unused'
    const accounts: Account[] = []
    for (let index = 0; index < USERS; index += 1) {
      const user = await prisma.user.create({
        data: {
          business: { create: { name: `Rate limit ${suffix} ${index}` } },
          name: `Rate User${index}`,
          email: `rate-limit-${index}-${suffix}@example.com`,
          passwordHash,
          role: 'OWNER',
        },
      })
      businessIds.push(user.businessId)
      const token = jwt.sign(
        { userId: user.id, businessId: user.businessId, role: 'OWNER', platformRole: 'USER', tokenVersion: user.tokenVersion },
        process.env.JWT_SECRET!,
        { expiresIn: '8h' },
      )
      accounts.push({ userId: user.id, businessId: user.businessId, token })
    }
    console.log(`  ${USERS} usuarios autenticados creados (misma IP local)`)

    // --- Escenario 1: trafico simultaneo e intercalado de los 4 usuarios ---
    const statuses: number[] = []
    for (let round = 0; round < READS_PER_USER; round += 1) {
      const results = await Promise.all(accounts.map(account => request(base, 'GET', '/repairs?page=1&pageSize=5', account.token)))
      statuses.push(...results.map(result => result.status))
    }
    const throttled = statuses.filter(status => status === 429).length
    assert.equal(throttled, 0, `ningun usuario deberia recibir 429 compartiendo IP (hubo ${throttled})`)
    assert.ok(statuses.every(status => status === 200), `todos los GET libres deben responder 200, vistos: ${[...new Set(statuses)].join(', ')}`)
    console.log(`  ok  ${USERS} usuarios x ${READS_PER_USER} GET intercalados = ${statuses.length} requests, 0 bloqueos`)

    // --- Escenario 2: un usuario excede su propio limite por usuario ---
    const abuser = accounts[0]
    const abuserStatuses: number[] = []
    for (let index = 0; index < READS - READS_PER_USER + 3; index += 1) {
      abuserStatuses.push((await request(base, 'GET', '/repairs?page=1&pageSize=5', abuser.token)).status)
    }
    const abuserBlocked = abuserStatuses.filter(status => status === 429).length
    assert.ok(abuserBlocked > 0, 'un usuario que excede su limite por usuario debe recibir 429')
    const first429 = await request(base, 'GET', '/repairs?page=1&pageSize=5', abuser.token)
    assert.equal(first429.status, 429, 'el usuario abusivo sigue bloqueado')
    assert.ok(first429.headers.get('retry-after'), 'la respuesta 429 conserva la cabecera Retry-After')
    assert.equal(first429.body?.success, false)
    assert.equal(typeof first429.body?.message, 'string')
    console.log(`  ok  usuario abusivo recibe 429 (${abuserBlocked} bloqueos) y conserva Retry-After`)

    // --- Escenario 3: otro usuario, misma IP, sigue trabajando ---
    // The bystander already spent READS_PER_USER reads in the first scenario, so it has
    // exactly its remaining budget left. Spending that must still yield 200 while the
    // abusive account is blocked on the very same IP.
    const bystander = accounts[1]
    const bystanderRemaining = READS - READS_PER_USER
    const bystanderStatuses: number[] = []
    for (let index = 0; index < bystanderRemaining; index += 1) {
      bystanderStatuses.push((await request(base, 'GET', '/repairs?page=1&pageSize=5', bystander.token)).status)
    }
    assert.ok(
      bystanderStatuses.every(status => status === 200),
      `otro usuario desde la misma IP debe seguir recibiendo 200, vistos: ${[...new Set(bystanderStatuses)].join(', ')}`,
    )
    console.log('  ok  segundo usuario desde la MISMA IP sigue obteniendo 200 (contadores separados)')

    // --- Escenario 4: el limite de escrituras sigue siendo independiente ---
    // Uses a third account (accounts[2]) whose read budget is still available, so the
    // "reads survive exhausted writes" assertion below is meaningful.
    // PATCH /auth/tutorial-seen is an idempotent write, so the probe has no side effects.
    const writer = accounts[2]
    const writeStatuses: number[] = []
    for (let index = 0; index < WRITES + 2; index += 1) {
      writeStatuses.push((await request(base, 'PATCH', '/auth/tutorial-seen', writer.token, {})).status)
    }
    const writeBlocked = writeStatuses.filter(status => status === 429).length
    assert.ok(writeBlocked > 0, 'el limite de escrituras debe seguir bloqueando por encima de su tope')
    assert.ok(
      writeStatuses.slice(0, WRITES).every(status => status === 200),
      `las primeras ${WRITES} escrituras deben pasar, vistos: ${writeStatuses.join(', ')}`,
    )
    // Reads stay available: exhausting the write budget must not consume the read budget.
    const readAfterWrites = await request(base, 'GET', '/repairs?page=1&pageSize=5', writer.token)
    assert.equal(readAfterWrites.status, 200, 'agotar las escrituras no debe agotar las lecturas del mismo usuario')
    console.log(`  ok  escrituras limitadas a ${WRITES}/usuario e independientes de las lecturas`)

    // --- Escenario 5: health no consume el presupuesto global ---
    for (let index = 0; index < 30; index += 1) {
      assert.equal((await fetch(`${root}/health`)).status, 200, 'health debe seguir respondiendo 200')
    }
    const afterHealth = await request(base, 'GET', '/repairs?page=1&pageSize=5', accounts[2].token)
    assert.equal(afterHealth.status, 200, 'los health checks no deben agotar el limite global de los usuarios')
    console.log('  ok  30 health checks no consumieron el presupuesto global')

    // --- Escenario 6: los preflight OPTIONS no consumen el presupuesto ---
    for (let index = 0; index < 30; index += 1) {
      const preflight = await fetch(`${base}/repairs`, {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' },
      })
      assert.ok([200, 204].includes(preflight.status), `preflight respondio ${preflight.status}`)
    }
    const afterPreflight = await request(base, 'GET', '/repairs?page=1&pageSize=5', accounts[3].token)
    assert.equal(afterPreflight.status, 200, 'los preflight CORS no deben agotar el limite global')
    console.log('  ok  30 preflight OPTIONS no consumieron el presupuesto global')

    console.log('rate limit multiusuario: todas las verificaciones pasaron')
  } finally {
    for (const businessId of businessIds) {
      await prisma.$transaction([
        prisma.subscription.deleteMany({ where: { businessId } }),
        prisma.user.deleteMany({ where: { businessId } }),
        prisma.business.deleteMany({ where: { id: businessId } }),
      ])
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

main().catch(error => { console.error('rate limit multiusuario fallo:', error); process.exitCode = 1 })



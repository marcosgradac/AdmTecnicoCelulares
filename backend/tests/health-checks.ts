// Loopback HTTP and mocked Prisma only: never connect to a real database.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'isolated-health-check-only'
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/health_never_connected'
process.env.RATE_LIMIT_HEALTH_MAX = '3'
process.env.RATE_LIMIT_GLOBAL_MAX = '1'

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  let queries = 0
  let unavailable = false
  const original = prisma.$queryRaw
  const originalError = console.error
  const errors: unknown[][] = []
  console.error = (...args: unknown[]) => { errors.push(args) }
  prisma.$queryRaw = (async (sql: TemplateStringsArray) => {
    queries++
    assert.equal(sql.join(''), 'SELECT 1')
    if (unavailable) throw new Error('PRIVATE_DATABASE_URL_AND_CREDENTIALS')
    return [{ '?column?': 1 }]
  }) as typeof original
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(done => server.once('listening', done))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const request = async (path: string, ip = '198.51.100.1') => {
    const response = await fetch(base + path, { headers: { 'X-Forwarded-For': ip } })
    return { response, body: await response.json() as Record<string, unknown> }
  }
  const healthy = (body: Record<string, unknown>) => {
    assert.equal(body.ok, true)
    assert.equal(body.status, 'ok')
    assert.equal(body.environment, 'test')
    assert.ok(Number.isFinite(Date.parse(String(body.timestamp))))
  }
  try {
    for (let index = 0; index < 6; index++) {
      const { response, body } = await request('/health')
      assert.equal(response.status, 200)
      healthy(body)
      assert.equal(response.headers.get('ratelimit'), null)
    }
    assert.equal(queries, 0, 'Liveness must never query PostgreSQL')
    for (let index = 0; index < 3; index++) {
      const before = queries
      const { response, body } = await request('/api/health')
      assert.equal(response.status, 200)
      healthy(body)
      assert.equal(queries, before + 1, 'Readiness checks SELECT 1')
    }
    const beforeBlocked = queries
    for (let index = 0; index < 2; index++) {
      const { response, body } = await request('/api/health')
      assert.equal(response.status, 429)
      assert.equal(body.ok, false)
      const retry = Number(response.headers.get('retry-after'))
      assert.ok(Number.isInteger(retry) && retry >= 1 && retry <= 60)
      assert.equal(body.retryAfter, retry)
      assert.ok(!JSON.stringify(body).includes('PRIVATE_'))
    }
    assert.equal(queries, beforeBlocked, 'Blocked readiness must not query PostgreSQL')
    for (let index = 0; index < 3; index++) assert.equal((await request('/api/health', '198.51.100.2')).response.status, 200)
    assert.equal((await request('/api/health', '198.51.100.2')).response.status, 429)
    for (let index = 0; index < 3; index++) assert.equal((await request('/api/health', '2001:db8:1111:aa00::1')).response.status, 200)
    assert.equal((await request('/api/health', '2001:db8:1111:aa00::2')).response.status, 429)
    assert.equal((await request('/api/health', '2001:db8:2222::1')).response.status, 200)
    unavailable = true
    const failed = await request('/api/health', '198.51.100.3')
    assert.equal(failed.response.status, 503)
    assert.equal(failed.body.ok, false)
    assert.equal(failed.body.status, 'error')
    assert.ok(Number.isFinite(Date.parse(String(failed.body.timestamp))))
    assert.ok(!JSON.stringify(failed.body).includes('PRIVATE_'))
    assert.ok(!JSON.stringify(errors).includes('PRIVATE_'))
    const beforeLiveness = queries
    const alive = await request('/health')
    assert.equal(alive.response.status, 200)
    healthy(alive.body)
    assert.equal(queries, beforeLiveness, 'Liveness stays healthy even when DB is unavailable')
    // An unauthenticated ordinary route consumes global budget without business DB calls.
    assert.equal((await request('/api/isolated-health-global-probe')).response.status, 401)
    assert.equal((await request('/api/isolated-health-global-probe')).response.status, 429)
    unavailable = false
    assert.equal((await request('/api/health', '198.51.100.4')).response.status, 200)
    assert.equal((await request('/api/isolated-health-global-probe', '198.51.100.4')).response.status, 401)
    assert.equal((await request('/api/isolated-health-global-probe', '198.51.100.4')).response.status, 429)
    assert.equal((await request('/api/health', '198.51.100.4')).response.status, 200, 'Global exhaustion does not block readiness')
    assert.equal((await request('/health', '198.51.100.4')).response.status, 200)
    const frontend = readFileSync(resolve(__dirname, '../../frontend/src/services/api.ts'), 'utf8')
    assert.match(frontend, /api\.get<\{ ok: boolean \}>\('\/health', \{ timeout: 5000 \}\)\)\.data\.ok/)
    console.log('HEALTH CHECKS PASSED: liveness without DB, readiness SELECT 1, per-IP and IPv6 budgets, 429/Retry-After before DB, safe 503, independent global budget and frontend ok contract; local HTTP and mocked Prisma only.')
  } finally {
    console.error = originalError
    prisma.$queryRaw = original
    await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done()))
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

// HTTP on loopback only; Prisma is replaced with invented fixtures before requests.
// The unused DB URL cannot connect to the developer's or production databases.
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'isolated-preview-rate-limit-only'
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/preview_never_connected'
process.env.RATE_LIMIT_TRACKING_PREVIEW_MAX = '3'
process.env.RATE_LIMIT_PUBLIC_TRACKING_MAX = '2'
process.env.RATE_LIMIT_GLOBAL_MAX = '600'

const shortToken = 'AbCdEf012345_-xy'
const legacyToken = 'aB'.repeat(32)

async function main() {
  const [{ app }, { prisma }, { trackingRisk }, { securityConfig }] = await Promise.all([
    import('../src/server'), import('../src/lib/prisma'), import('../src/middlewares/security'), import('../src/config/security'),
  ])
  let queries = 0
  const originalFind = prisma.repair.findUnique
  const originalWarn = console.warn
  const warnings: unknown[][] = []
  console.warn = (...args: unknown[]) => { warnings.push(args) }
  let fixture: Record<string, unknown> | null = {
    id: 'invented-repair', trackingEnabled: true, trackingExpiresAt: null, status: 'RECEIVED',
    business: { id: 'invented-business', name: '<Taller & prueba>', logoUrl: 'https://images.example.test/logo.png' },
    createdAt: new Date('2026-01-01'), imei: 'PRIVATE_IMEI', notes: 'PRIVATE_NOTES',
    client: { id: 'invented-client', name: 'PRIVATE_CLIENT', phone: 'PRIVATE_PHONE' },
  }
  prisma.repair.findUnique = (async () => { queries++; return fixture }) as typeof originalFind
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(done => server.once('listening', done))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const request = async (token: string, ip: string, endpoint = 'tracking-preview', query = '') => {
    const response = await fetch(`${base}/api/${endpoint}/${encodeURIComponent(token)}${query}`, { headers: { 'X-Forwarded-For': ip } })
    return { response, body: await response.text() }
  }
  const privacy = (response: Response) => {
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive')
  }
  try {
    const riskBefore = structuredClone(trackingRisk.get('198.51.100.1'))
    const invalidTokens = ['bad', 'a'.repeat(15), 'a'.repeat(17), 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'a'.repeat(15) + '+', 'a'.repeat(15) + '=', 'á'.repeat(16), shortToken + '\n', legacyToken + '\n']
    for (const [index, token] of invalidTokens.entries()) {
      const before = queries
      const { response, body } = await request(token, `192.0.2.${index + 1}`)
      assert.equal(response.status, 200)
      assert.equal(queries, before, 'Invalid token must not execute a Prisma query')
      privacy(response)
      assert.match(body, /<title>TecnoDesk<\/title>/)
      assert.ok(!body.includes('PRIVATE_'))
    }
    assert.equal(trackingRisk.get('198.51.100.1').count, riskBefore.count)

    for (const [index, token] of [shortToken, legacyToken].entries()) {
      const before = queries
      const { response, body } = await request(token, `192.0.2.${50 + index}`, 'tracking-preview', '?clientSlug=cliente')
      assert.equal(response.status, 200)
      assert.equal(queries, before + 1)
      privacy(response)
      assert.match(body, /property="og:title" content="&lt;Taller &amp; prueba&gt;"/)
      assert.match(body, /property="og:image" content="https:\/\/images.example.test\/logo.png"/)
      assert.ok(body.includes(`/s/cliente/${token}`))
      assert.ok(!body.includes('<Taller & prueba>'))
      assert.ok(!body.includes('PRIVATE_'))
    }

    const ip = '198.51.100.1'
    for (const token of [shortToken, legacyToken, '0123456789abcdef']) assert.equal((await request(token, ip)).response.status, 200)
    const beforeBlocked = queries
    for (const token of [shortToken, 'FEDCBA9876543210', 'invalid']) {
      const { response, body } = await request(token, ip)
      assert.equal(response.status, 429, 'Changing tokens must not bypass the IP budget')
      const retry = Number(response.headers.get('retry-after'))
      assert.ok(Number.isInteger(retry) && retry >= 1 && retry <= 60)
      privacy(response)
      assert.ok(!body.includes(token) && !body.includes('PRIVATE_'))
    }
    assert.equal(queries, beforeBlocked, 'Rate limiting must happen before Prisma')
    assert.equal(warnings.length, 0, 'Preview requests must not log tokens or personal data')
    assert.equal(trackingRisk.get(ip).count, riskBefore.count)

    for (let index = 0; index < 3; index++) assert.equal((await request(shortToken, '198.51.100.2')).response.status, 200)
    assert.equal((await request(shortToken, '198.51.100.2')).response.status, 429)

    // Invalid formats still consume the IP budget without touching the DB.
    const beforeInvalidBudget = queries
    for (let index = 0; index < 3; index++) assert.equal((await request('bad', '198.51.100.3')).response.status, 200)
    assert.equal((await request(shortToken, '198.51.100.3')).response.status, 429)
    assert.equal(queries, beforeInvalidBudget)

    // express-rate-limit's IPv6 generator groups addresses in the default /56 subnet.
    for (let index = 0; index < 3; index++) assert.equal((await request(shortToken, '2001:db8:1111:aa00::1')).response.status, 200)
    assert.equal((await request(legacyToken, '2001:db8:1111:aa00::2')).response.status, 429)
    assert.equal((await request(shortToken, '2001:db8:2222::1')).response.status, 200)

    // With the existing trusted final proxy hop, changing the untrusted left entry is ineffective.
    for (let index = 0; index < 3; index++) assert.equal((await request(shortToken, `192.0.2.${index + 1}, 198.51.100.4`)).response.status, 200)
    assert.equal((await request(legacyToken, '192.0.2.99, 198.51.100.4')).response.status, 429)

    // Exhausting preview leaves the interactive tracking budget and response intact.
    for (let index = 0; index < 2; index++) {
      const { response, body } = await request(shortToken, ip, 'tracking')
      assert.equal(response.status, 200)
      const data = JSON.parse(body)
      assert.equal(data.business.name, '<Taller & prueba>')
      assert.equal(data.imei, null)
      assert.equal(data.notes, null)
      assert.equal(data.client.name, '')
    }
    assert.equal((await request(shortToken, ip, 'tracking')).response.status, 429)
    // Exhausting interactive tracking does not consume a different client's preview budget.
    const otherIp = '198.51.100.5'
    for (let index = 0; index < 2; index++) assert.equal((await request(shortToken, otherIp, 'tracking')).response.status, 200)
    assert.equal((await request(shortToken, otherIp, 'tracking')).response.status, 429)
    assert.equal((await request(shortToken, otherIp)).response.status, 200)

    for (const value of [null, { ...fixture, trackingEnabled: false }, { ...fixture, trackingExpiresAt: new Date(0) }]) {
      fixture = value
      const { response, body } = await request(shortToken, `203.0.113.${queries + 1}`)
      assert.equal(response.status, 200)
      privacy(response)
      assert.match(body, /property="og:title" content="TecnoDesk"/)
      assert.match(body, /property="og:image" content="https:\/\/www.tecnodeskpro.com\/tecnodesk-192.png"/)
    }
    assert.equal(securityConfig.rateLimits.publicTracking.limit, 2)
    console.log('TRACKING PREVIEW RATE LIMIT PASSED: valid modern/legacy tokens, no DB for malformed/limited requests, rotating tokens, independent IPv4 clients, IPv6 subnet keys, trusted proxy IP, privacy/OG/fallback and independent interactive tracking; loopback HTTP and mocked Prisma only.')
  } finally {
    console.warn = originalWarn
    prisma.repair.findUnique = originalFind
    await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done()))
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

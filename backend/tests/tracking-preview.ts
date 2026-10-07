import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'local-preview-test-only'
process.env.DATABASE_URL = 'postgresql://local:local@127.0.0.1:55432/local_preview_not_connected'

async function main() {
  const [{ app }, { prisma }, { trackingRisk }] = await Promise.all([
    import('../src/server'), import('../src/lib/prisma'), import('../src/middlewares/security'),
  ])
  const business = { id: 'workshop-a', name: ' TecnoMarcos ', logoUrl: 'https://images.example.test/logo.png' }
  let fixture: Record<string, unknown> | null = { trackingEnabled: true, trackingExpiresAt: null, business,
    clientName: 'PRIVATE_CLIENT', phone: 'PRIVATE_PHONE', device: 'PRIVATE_DEVICE', issue: 'PRIVATE_ISSUE',
    diagnosis: 'PRIVATE_DIAGNOSIS', notes: 'PRIVATE_NOTES', imei: 'PRIVATE_IMEI', total: 987654, paid: 123456, number: 999999 }
  const queries: unknown[] = []
  let lookupFails = false
  const original = prisma.repair.findUnique
  prisma.repair.findUnique = (async (args: unknown) => {
    queries.push(args)
    if (lookupFails) throw new Error('PRIVATE_DATABASE_ERROR')
    return fixture
  }) as typeof original
  const riskBefore = structuredClone(trackingRisk.get('127.0.0.1'))
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(done => server.once('listening', done))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const request = async (query = '?clientSlug=cliente', status = 200) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/tracking-preview/local-token${query}`)
    assert.equal(response.status, status)
    assert.match(response.headers.get('content-type')!, /^text\/html; charset=utf-8$/)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('ratelimit'), null, 'preview must not consume the shared API limiter')
    return response.text()
  }
  const meta = (html: string, property: string) => html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`))?.[1]
  try {
    let html = await request()
    assert.match(html, /<title>TecnoMarcos<\/title>/)
    assert.equal(meta(html, 'og:title'), 'TecnoMarcos')
    assert.equal(meta(html, 'og:description'), 'Seguí el estado de tu reparación en tiempo real.')
    assert.equal(meta(html, 'og:image'), business.logoUrl)
    assert.equal(meta(html, 'og:url'), 'https://www.tecnodeskpro.com/s/cliente/local-token')
    assert.match(html, /noindex,nofollow,noarchive/)
    console.log('Local HTTP response for a simulated valid workshop:\n' + html)
    for (const secret of ['PRIVATE_', '987654', '123456', '999999']) assert.ok(!html.includes(secret))
    assert.deepEqual(queries[0], { where: { trackingToken: 'local-token' }, select: {
      trackingEnabled: true, trackingExpiresAt: true, business: { select: { id: true, name: true, logoUrl: true } },
    } })
    business.name = '<script>"A&B\'</script>'
    html = await request('?clientSlug=%22%3E%3Cscript%3E')
    assert.match(html, /&lt;script&gt;&quot;A&amp;B&#39;&lt;\/script&gt;/)
    assert.ok(!html.includes('<script>'))
    business.name = 'TecnoMarcos'
    business.logoUrl = 'javascript:alert(1)'
    assert.equal(meta(await request(), 'og:image'), 'https://www.tecnodeskpro.com/tecnodesk-192.png')
    business.logoUrl = 'data:image/png;base64,AA=='
    assert.equal(meta(await request(), 'og:image'), 'https://tecnodesk-api.onrender.com/api/business-logo/workshop-a')
    business.logoUrl = '/logos/workshop.png'
    assert.equal(meta(await request(), 'og:image'), 'https://tecnodesk-api.onrender.com/logos/workshop.png')
    business.logoUrl = ''
    assert.equal(meta(await request(), 'og:image'), 'https://www.tecnodeskpro.com/tecnodesk-192.png')
    business.name = '  '
    assert.equal(meta(await request(), 'og:title'), 'TecnoDesk')
    business.name = 'PRIVATE_BUSINESS'
    for (const invalid of [
      { trackingEnabled: false, trackingExpiresAt: null, business },
      { trackingEnabled: true, trackingExpiresAt: new Date(0), business },
      null,
    ]) {
      fixture = invalid
      html = await request()
      assert.equal(meta(html, 'og:title'), 'TecnoDesk')
      assert.ok(!html.includes('PRIVATE_BUSINESS'))
      assert.equal(meta(html, 'og:image'), 'https://www.tecnodeskpro.com/tecnodesk-192.png')
    }
    assert.equal(meta(await request(''), 'og:url'), 'https://www.tecnodeskpro.com/seguimiento/local-token')
    fixture = { trackingEnabled: true, trackingExpiresAt: null,
      business: { id: 'workshop-b', name: 'Otro taller', logoUrl: 'https://images.example.test/other.png' } }
    html = await request()
    assert.equal(meta(html, 'og:title'), 'Otro taller')
    assert.equal(meta(html, 'og:image'), 'https://images.example.test/other.png')
    lookupFails = true
    html = await request('?clientSlug=cliente', 503)
    assert.equal(meta(html, 'og:title'), 'TecnoDesk')
    assert.ok(!html.includes('PRIVATE_DATABASE_ERROR'))
    assert.equal(trackingRisk.get('127.0.0.1').count, riskBefore.count)
    assert.ok(readFileSync(resolve(__dirname, '../../frontend/public/tecnodesk-192.png')).length > 0)
    // Local rule-resolution checks complement schema validation; they do not deploy to Vercel.
    const config = JSON.parse(readFileSync(resolve(__dirname, '../../frontend/vercel.json'), 'utf8'))
    const destination = (path: string, userAgent: string) => {
      for (const rule of config.rewrites) {
        const names: string[] = []
        const source = rule.source.replace(/:([A-Za-z]+)/g, (_: string, name: string) => {
          names.push(name)
          return '([^/]+)'
        })
        const match = path.match(new RegExp(`^${source}$`))
        if (!match || (rule.has && !rule.has.every((condition: { type: string; key: string; value: string }) =>
          condition.type === 'header' && condition.key === 'user-agent' && new RegExp(`^(?:${condition.value})$`).test(userAgent)))) continue
        return names.reduce((url: string, name, index) => url.replaceAll(`:${name}`, match[index + 1]), rule.destination)
      }
      return undefined
    }
    for (const agent of ['facebookexternalhit/1.1', 'Facebot', 'WhatsApp/2.24', 'WhatsApp/2.24 iOS']) {
      assert.equal(destination('/s/cliente/local-token', agent), 'https://tecnodesk-api.onrender.com/api/tracking-preview/local-token?clientSlug=cliente')
      assert.equal(destination('/seguimiento/local-token', agent), 'https://tecnodesk-api.onrender.com/api/tracking-preview/local-token')
      for (const path of ['/', '/login', '/admin', '/politica-de-privacidad']) assert.equal(destination(path, agent), '/index.html')
    }
    for (const agent of ['Mozilla/5.0 Chrome/130', '', 'UnknownBot']) {
      for (const path of ['/s/cliente/local-token', '/seguimiento/local-token', '/', '/login', '/admin', '/politica-de-privacidad'])
        assert.equal(destination(path, agent), '/index.html')
    }
    console.log('VERCEL RULE RESOLUTION PASSED: Meta/WhatsApp modern + legacy links and unchanged browser/SPA routes.')
    console.log('TRACKING PREVIEW HTTP PASSED: A–I, minimal SELECT, escaping, absolute/relative/data/fallback logos, generic invalid tokens, legacy URL and unchanged risk counters; no DB connection or writes.')
  } finally {
    prisma.repair.findUnique = original
    await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done()))
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

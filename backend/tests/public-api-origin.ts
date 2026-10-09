import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'local-origin-test-only'
process.env.DATABASE_URL = 'postgresql://local:local@127.0.0.1:1/never_connected'
process.env.PUBLIC_API_ORIGIN = 'https://api.tecnodeskpro.com/'
process.env.RATE_LIMIT_TRACKING_PREVIEW_MAX = '2'
process.env.CORS_ORIGINS = 'https://www.tecnodeskpro.com'
process.env.MAIL_MODE = 'fake'
process.env.FRONTEND_URL = 'https://www.tecnodeskpro.com'

async function main() {
  const { parsePublicApiOrigin } = await import('../src/config/public-api')
  assert.equal(parsePublicApiOrigin(undefined), 'https://tecnodesk-api.onrender.com')
  assert.equal(parsePublicApiOrigin('https://api.tecnodeskpro.com/'), 'https://api.tecnodeskpro.com')
  for (const invalid of ['', 'http://api.tecnodeskpro.com', 'https://user:password@example.test',
    'https://example.test/api', 'https://example.test?secret=value', 'https://example.test#fragment', 'not-a-url']) {
    assert.throws(() => parsePublicApiOrigin(invalid), /PUBLIC_API_ORIGIN/)
  }
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const original = prisma.repair.findUnique
  let queries = 0
  prisma.repair.findUnique = (async () => {
    queries++
    return { trackingEnabled: true, trackingExpiresAt: null,
      business: { id: 'local-business', name: 'Taller <local>', logoUrl: 'data:image/png;base64,AA==' } }
  }) as typeof original
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(done => server.once('listening', done))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const request = (token: string, spoof: string, query = '') => fetch(
    `http://127.0.0.1:${address.port}/api/tracking-preview/${token}${query}`, {
      headers: { 'CF-Connecting-IP': spoof, 'X-Forwarded-For': `${spoof}, 192.0.2.10`,
        'X-Forwarded-Host': 'evil.example.test', 'X-Forwarded-Proto': 'http' },
    })
  try {
    const { sendPasswordResetEmail, clearFakeOutbox, getFakeOutbox } = await import('../src/services/email/email.service')
    clearFakeOutbox()
    await sendPasswordResetEmail('local@example.test', 'local-reset-token')
    assert.equal(getFakeOutbox()[0].resetUrl, 'https://www.tecnodeskpro.com/restablecer-contrasena?token=local-reset-token')
    clearFakeOutbox()
    const base = `http://127.0.0.1:${address.port}`
    for (const path of ['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/repairs']) {
      const response = await fetch(base + path, { method: 'OPTIONS', headers: {
        Origin: 'https://www.tecnodeskpro.com', 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,x-turnstile-token',
      } })
      assert.equal(response.status, 204)
      assert.equal(response.headers.get('access-control-allow-origin'), 'https://www.tecnodeskpro.com')
      assert.match(response.headers.get('access-control-allow-headers')!, /authorization/i)
      assert.match(response.headers.get('access-control-allow-headers')!, /x-turnstile-token/i)
      assert.match(response.headers.get('access-control-allow-methods')!, /POST/)
      assert.match(response.headers.get('vary')!, /Origin/)
    }
    const liveness = await fetch(base + '/health', { headers: { Origin: 'https://www.tecnodeskpro.com' } })
    assert.equal(liveness.status, 200)
    assert.equal((await liveness.json() as { ok: boolean }).ok, true)
    for (const headers of [{}, { Authorization: 'Bearer invalid-local-jwt' }]) {
      const response = await fetch(base + '/api/repairs', { headers: { ...headers, Origin: 'https://www.tecnodeskpro.com' } })
      assert.equal(response.status, 401)
      assert.equal(response.headers.get('access-control-allow-origin'), 'https://www.tecnodeskpro.com')
    }
    assert.equal(queries, 0, 'preflight and unauthorized requests do not reach repair lookup')
    for (const [token, suffix, path] of [
      ['AbCdEf012345_-xy', '?clientSlug=cliente', '/s/cliente/AbCdEf012345_-xy'],
      ['a'.repeat(64), '', `/seguimiento/${'a'.repeat(64)}`],
    ]) {
      const response = await request(token, `198.51.100.${queries + 1}`, suffix)
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const html = await response.text()
      assert.match(html, /https:\/\/api\.tecnodeskpro\.com\/api\/business-logo\/local-business/)
      assert.ok(html.includes(`https://www.tecnodeskpro.com${path}`))
      assert.match(html, /Taller &lt;local&gt;/)
      assert.match(html, /noindex,nofollow,noarchive/)
      assert.ok(!html.includes('evil.example.test'))
    }
    const blocked = await request('b'.repeat(64), '203.0.113.9')
    assert.equal(blocked.status, 429, 'rotating untrusted headers cannot rotate the trusted last-hop IP budget')
    assert.ok(blocked.headers.get('retry-after'))
    assert.equal(queries, 2)
    const invalid = await fetch(`http://127.0.0.1:${address.port}/api/tracking-preview/invalid`, {
      headers: { 'X-Forwarded-For': '192.0.2.11' },
    })
    assert.equal(invalid.status, 200)
    assert.match(await invalid.text(), /https:\/\/www\.tecnodeskpro\.com\/tecnodesk-192\.png/)
    assert.equal(queries, 2)
    console.log('Public API origin: configuration, modern/legacy links, OG, fallback and proxy-header isolation OK (mocked Prisma).')
  } finally {
    prisma.repair.findUnique = original
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()))
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

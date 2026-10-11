import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname) && database.pathname === '/tecnodesk_role_permissions_test', 'Disposable local cluster required')
process.env.DOTENV_CONFIG_PATH = 'security8-no-env'
process.env.ORIGIN_AUTH_ENABLED = 'false'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'tenant-isolation-local-only'

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { app } = await import('../src/app')
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const payload = '<img src=x onerror=alert(1)><svg onload=alert(1)>'
  try {
    const business = await prisma.business.create({ data: { name: payload } })
    const owner = await prisma.user.create({ data: { businessId: business.id, name: 'Synthetic owner', email: `${randomUUID()}@example.test`, passwordHash: 'not-used', role: 'OWNER' } })
    const now = new Date()
    await prisma.subscription.create({ data: { businessId: business.id, planCode: 'COMPLETE', status: 'ACTIVE', trialStartedAt: now, trialEndsAt: now, trialConsumedAt: now, accessExpiresAt: new Date(Date.now() + 86400000), currentPeriodStart: now, currentPeriodEnd: new Date(Date.now() + 86400000) } })
    const token = jwt.sign({ userId: owner.id, businessId: business.id, tokenVersion: owner.tokenVersion }, process.env.JWT_SECRET!, { expiresIn: '8h' })
    const request = async (method: string, path: string, body?: object) => {
      const response = await fetch(base + path, { method, redirect: 'error', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const result = await response.json() as any
      assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(result)}`)
      return result
    }
    const client = await request('POST', '/clients', { name: payload, phone: '12345678' })
    assert.equal(client.name, payload)
    const repair = await request('POST', '/repairs', { clientId: client.id, deviceBrand: payload, deviceModel: payload, issue: payload })
    await request('PATCH', `/repairs/${repair.id}/edit`, { diagnosis: payload, notes: payload })
    await request('PATCH', `/repairs/${repair.id}/status/advance`, { publicMessage: payload, internalNote: payload })
    const detail = await request('GET', `/repairs/${repair.id}`)
    assert.equal(detail.issue, payload); assert.equal(detail.diagnosis, payload)
    const stored = await prisma.repair.findUniqueOrThrow({ where: { id: repair.id } })
    assert.equal(stored.issue, payload)
    assert.ok(stored.trackingToken)
    const preview = await fetch(base + '/tracking-preview/' + stored.trackingToken, { redirect: 'error' })
    assert.equal(preview.status, 200)
    const html = await preview.text()
    assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img')); assert.ok(!html.includes('<svg'))
    assert.equal(preview.headers.get('x-content-type-options'), 'nosniff')
    for (const contentType of ['image/svg+xml', 'image/png']) {
      const rejected = await fetch(base + '/settings/business/logo', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': contentType }, body: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>' })
      assert.equal(rejected.status, 400)
      await rejected.text()
      assert.equal((await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).logoUrl, null)
    }
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA1sAAAAASUVORK5CYII=', 'base64')
    const uploaded = await fetch(base + '/settings/business/logo', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' }, body: png })
    assert.equal(uploaded.status, 200)
    await uploaded.text()
    const image = await fetch(base + '/business-logo/' + business.id)
    assert.equal(image.status, 200)
    assert.equal(image.headers.get('content-type'), 'image/png')
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png)
    console.log('Stored user fields passed: synthetic client/repair/history persist as text; real PostgreSQL → OG HTML is escaped')
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })

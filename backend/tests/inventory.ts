import 'dotenv/config'
import assert from 'node:assert/strict'
import { validRegistrationPayload } from './helpers/registration'

process.env.NODE_ENV = 'test'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  let businessId = ''
  try {
    const registration = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validRegistrationPayload({
        firstName: 'Inventario', lastName: 'QA', email: `inventory-removed-${Date.now()}@example.com`,
        password: 'Inventario123', businessName: `Inventory removed ${Date.now()}`,
      })),
    })
    assert.equal(registration.status, 201)
    const body = await registration.json() as { token: string; user: { business: { id: string } } }
    businessId = body.user.business.id
    const response = await fetch(`${base}/inventory`, { headers: { authorization: `Bearer ${body.token}` } })
    assert.equal(response.status, 404)
    console.log('INVENTORY REMOVAL TEST PASSED: el módulo Stock no expone endpoints')
  } finally {
    if (businessId) await prisma.$transaction([
      prisma.subscription.deleteMany({ where: { businessId } }),
      prisma.user.deleteMany({ where: { businessId } }),
      prisma.business.deleteMany({ where: { id: businessId } }),
    ])
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })

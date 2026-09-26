import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { validRegistrationPayload } from './helpers/registration'

process.env.NODE_ENV = 'test'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

async function main() {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Use a local test database')
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const businesses: string[] = []
  const request = async (method: string, path: string, token?: string, body?: object) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, body: await response.json() as any }
  }
  const register = async (label: string) => {
    const result = await request('POST', '/auth/register', undefined, validRegistrationPayload({
      firstName: 'Number', lastName: label, email: `numbers-${label}-${randomBytes(8).toString('hex')}@example.com`,
      password: `Qa-${randomBytes(12).toString('base64url')}9!`, businessName: `Numbers ${label}`,
    }))
    assert.equal(result.status, 201)
    const businessId = result.body.user.business.id as string
    businesses.push(businessId)
    const token = result.body.token as string
    const client = await request('POST', '/clients', token, { name: 'Cliente correlativo', phone: '1111111111' })
    assert.equal(client.status, 201)
    return { businessId, token, clientId: client.body.id as string }
  }
  const create = async (owner: { token: string; clientId: string }) => {
    const result = await request('POST', '/repairs', owner.token, {
      clientId: owner.clientId, deviceBrand: 'Nokia', deviceModel: 'Test', issue: 'No enciende', total: 0,
    })
    assert.equal(result.status, 201, JSON.stringify(result.body))
    return result.body as { id: string; number: number }
  }
  try {
    const a = await register('A'), b = await register('B')
    // Existing/imported numbers must remain unchanged and establish the floor.
    const legacy = await prisma.repair.create({ data: { businessId: a.businessId, clientId: a.clientId,
      number: 1043, deviceBrand: 'Nokia', deviceModel: 'Legacy', issue: 'Sin actividad' } })
    const first = await create(a)
    assert.equal(first.number, 1044)
    assert.equal((await request('DELETE', `/repairs/${first.id}`, a.token)).status, 200)
    assert.equal((await request('GET', `/repairs/${first.id}`, a.token)).status, 404)
    const second = await create(a)
    assert.equal(second.number, 1045, 'Deleting the highest number must not reuse it')
    assert.equal((await prisma.repair.findUniqueOrThrow({ where: { id: legacy.id } })).number, 1043)
    assert.equal((await request('DELETE', `/repairs/${legacy.id}`, a.token)).status, 200)
    assert.equal((await create(a)).number, 1046, 'Deleting an earlier number must not reset the counter')
    const concurrent = await Promise.all([create(a), create(a)])
    assert.deepEqual(concurrent.map(repair => repair.number).sort((x, y) => x - y), [1047, 1048])
    const bFirst = await create(b)
    assert.equal(bFirst.number, 1001, 'Each business has an independent counter')
    assert.equal((await request('DELETE', `/repairs/${bFirst.id}`, b.token)).status, 200)
    assert.equal((await create(b)).number, 1002, 'An empty business must retain its counter')
    assert.equal((await create(a)).number, 1049)
    console.log('REPAIR NUMBERING PASSED: highest/earlier deletion, empty business, legacy numbers, concurrent creation, tenant isolation')
  } finally {
    for (const businessId of businesses) await prisma.$transaction([
      prisma.repair.deleteMany({ where: { businessId } }), prisma.client.deleteMany({ where: { businessId } }),
      prisma.subscription.deleteMany({ where: { businessId } }), prisma.user.deleteMany({ where: { businessId } }),
      prisma.business.deleteMany({ where: { id: businessId } }),
    ])
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

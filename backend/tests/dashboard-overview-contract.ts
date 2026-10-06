// Dashboard overview preserves active repairs and unpaid balances:
// WARRANTY counts as an active repair and `pending` sums the unpaid balance of EVERY repair.
import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import type { Server } from 'node:http'

// Refuse remote databases before importing the app/Prisma.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['postgres:', 'postgresql:'].includes(database.protocol))
assert.ok(database.pathname.endsWith('_test') && database.pathname !== '/tecnodesk_visual_test')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Use only a local test database')

process.env.NODE_ENV = 'test'

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { app } = await import('../src/server')
  let server: Server | undefined
  const suffix = randomBytes(6).toString('hex')
  const jwt = (await import('jsonwebtoken')).default
  // Declared up front so the finally block can clean a partial setup, including the
  // second tenant used to prove the figures are not contaminated.
  let businessId: string | undefined
  let ownerId: string | undefined
  let clientId: string | undefined
  let otherBusinessId: string | undefined
  let otherOwnerId: string | undefined
  let otherClientId: string | undefined
  try {
    server = app.listen(0)
    await new Promise<void>(resolve => server!.once('listening', resolve))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const BASE = `http://127.0.0.1:${address.port}/api`
    const owner = await prisma.user.create({ data: { business: { create: { name: `Dashboard ${suffix}` } }, name: 'Owner', email: `dashboard-${suffix}@local.test`, passwordHash: 'unused', role: 'OWNER' } })
    businessId = owner.businessId
    ownerId = owner.id
    const client = await prisma.client.create({ data: { businessId, name: 'Cliente Dashboard' } })
    clientId = client.id
    const token = jwt.sign({ userId: owner.id, businessId, role: 'OWNER', platformRole: 'USER', tokenVersion: owner.tokenVersion }, process.env.JWT_SECRET!)

    // Open, WARRANTY and DELIVERED repairs, all with an unpaid balance.
    const cases = [
      { number: 1001, status: 'RECEIVED' as const, total: 10000, paid: 0 },
      { number: 1002, status: 'WARRANTY' as const, total: 20000, paid: 0 },
      { number: 1003, status: 'DELIVERED' as const, total: 30000, paid: 0 },
    ]
    for (const item of cases) {
      await prisma.repair.create({ data: {
        businessId, number: item.number, clientId: client.id, deviceBrand: 'Audit', deviceModel: 'Dash',
        issue: 'Dashboard', total: item.total, paid: item.paid, status: item.status,
        trackingToken: `dash-${suffix}-${item.number}`, trackingEnabled: false, updatedAt: new Date(),
      } })
    }
    const response = await fetch(`${BASE}/dashboard/overview`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(response.status, 200)
    // This literal is deliberately retained solely to prove the removed endpoint is 404.
    assert.equal((await fetch(`${BASE}/dashboard/summary`, { headers: { authorization: `Bearer ${token}` } })).status, 404)
    const tech = await prisma.user.create({ data: { businessId, name: 'Technician', email: `tech-${suffix}@local.test`, passwordHash: 'unused', role: 'TECHNICIAN' } })
    const techToken = jwt.sign({ userId: tech.id, businessId, tokenVersion: tech.tokenVersion }, process.env.JWT_SECRET!)
    assert.equal((await fetch(`${BASE}/dashboard/overview`, { headers: { authorization: `Bearer ${techToken}` } })).status, 403)
    const body = await response.json() as {
      current: { activeRepairs: number; readyRepairs: number; pending: number }
    }

    // WARRANTY is an active repair: only DELIVERED and CANCELLED are excluded.
    assert.equal(body.current.activeRepairs, 2, 'RECEIVED + WARRANTY must be active; DELIVERED must not')
    assert.equal(body.current.readyRepairs, 0)
    // `pending` keeps its original scope: the balance of ALL repairs, delivered included.
    assert.equal(body.current.pending, 60000, 'pending must total 10k + 20k + 30k, delivered included')

    // A second tenant must not contribute to either figure.
    const other = await prisma.user.create({ data: { business: { create: { name: `Otro ${suffix}` } }, name: 'Otro', email: `otro-${suffix}@local.test`, passwordHash: 'unused', role: 'OWNER' } })
    otherBusinessId = other.businessId
    otherOwnerId = other.id
    const otherClient = await prisma.client.create({ data: { businessId: other.businessId, name: 'Cliente ajeno' } })
    otherClientId = otherClient.id
    await prisma.repair.create({ data: {
      businessId: other.businessId, number: 1001, clientId: otherClient.id, deviceBrand: 'Otro', deviceModel: 'Ajeno',
      issue: 'Ajeno', total: 999000, paid: 0, status: 'RECEIVED', trackingToken: `otro-${suffix}`, trackingEnabled: false, updatedAt: new Date(),
    } })
    const after = await fetch(`${BASE}/dashboard/overview`, { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()) as typeof body
    assert.equal(after.current.activeRepairs, 2, 'another business must not inflate activeRepairs')
    assert.equal(after.current.pending, 60000, 'another business must not inflate pending')
    console.log('  ok  WARRANTY counts as active; pending covers every repair of the business only')
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
    // Both tenants are removed here, never inside the happy path: an assertion that throws
    // after the second business was created would otherwise leave it behind.
    for (const tenant of [businessId, otherBusinessId]) {
      if (!tenant) continue
      await prisma.cashMovement.deleteMany({ where: { businessId: tenant } })
      await prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId: tenant } } })
      await prisma.repair.deleteMany({ where: { businessId: tenant } })
      // Registration also creates a Subscription, which RESTRICTs the business deletion.
      await prisma.user.deleteMany({ where: { businessId: tenant } })
      await prisma.subscription.deleteMany({ where: { businessId: tenant } })
    }
    if (clientId) await prisma.client.deleteMany({ where: { id: clientId } })
    if (otherClientId) await prisma.client.deleteMany({ where: { id: otherClientId } })
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } })
    if (otherOwnerId) await prisma.user.deleteMany({ where: { id: otherOwnerId } })
    if (businessId) await prisma.business.deleteMany({ where: { id: businessId } })
    if (otherBusinessId) await prisma.business.deleteMany({ where: { id: otherBusinessId } })
    await prisma.$disconnect()
  }
  console.log('PASS: dashboard overview preserves active/pending contract; OWNER 200, TECHNICIAN 403, removed endpoint 404')
}
main().catch(error => { console.error(error); process.exitCode = 1 })

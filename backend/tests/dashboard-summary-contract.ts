// Dashboard summary must keep its original contract after the aggregate optimisation:
// WARRANTY counts as an active repair and `pending` sums the unpaid balance of EVERY repair.
import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

// Refuse remote databases before importing the app/Prisma.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Use only a local test database')

const prisma = new PrismaClient()
const BASE = 'http://127.0.0.1:3000/api'

async function main() {
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
    const response = await fetch(`${BASE}/dashboard/summary`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(response.status, 200)
    const body = await response.json() as {
      activeRepairs: number; readyRepairs: number; clients: number
      pending: number; byStatus: Array<{ status: string; value: number }>
    }

    // WARRANTY is an active repair: only DELIVERED and CANCELLED are excluded.
    assert.equal(body.activeRepairs, 2, 'RECEIVED + WARRANTY must be active; DELIVERED must not')
    const warranty = body.byStatus.find(row => row.status === 'WARRANTY')
    assert.equal(warranty?.value, 1, 'WARRANTY must appear in the status breakdown')
    assert.equal(body.readyRepairs, 0)
    assert.equal(body.clients, 1)
    // `pending` keeps its original scope: the balance of ALL repairs, delivered included.
    assert.equal(body.pending, 60000, 'pending must total 10k + 20k + 30k, delivered included')

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
    const after = await fetch(`${BASE}/dashboard/summary`, { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()) as typeof body
    assert.equal(after.activeRepairs, 2, 'another business must not inflate activeRepairs')
    assert.equal(after.pending, 60000, 'another business must not inflate pending')
    console.log('  ok  WARRANTY counts as active; pending covers every repair of the business only')
  } finally {
    // Both tenants are removed here, never inside the happy path: an assertion that throws
    // after the second business was created would otherwise leave it behind.
    for (const tenant of [businessId, otherBusinessId]) {
      if (!tenant) continue
      await prisma.cashMovement.deleteMany({ where: { businessId: tenant } })
      await prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId: tenant } } })
      await prisma.repair.deleteMany({ where: { businessId: tenant } })
      // Registration also creates a Subscription, which RESTRICTs the business deletion.
      await prisma.subscription.deleteMany({ where: { businessId: tenant } })
    }
    if (clientId) await prisma.client.deleteMany({ where: { id: clientId } })
    if (otherClientId) await prisma.client.deleteMany({ where: { id: otherClientId } })
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } })
    if (otherOwnerId) await prisma.user.deleteMany({ where: { id: otherOwnerId } })
    if (businessId) await prisma.business.deleteMany({ where: { id: businessId } })
    if (otherBusinessId) await prisma.business.deleteMany({ where: { id: otherBusinessId } })
  }
  console.log('PASS: dashboard summary keeps its contract after the aggregate rewrite')
}
main().finally(() => prisma.$disconnect())

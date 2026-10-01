// Cross-tenant probe: business B must never read or mutate business A's data.
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
  // Self-contained: this test owns both businesses so it never depends on seeded demo data.
  const suffix = randomBytes(6).toString('hex')
  const jwt = (await import('jsonwebtoken')).default
  const passwordHash = 'unused'
  // Declared up front so the finally block can clean a partial setup of either tenant.
  let businessA: string | undefined
  let businessB: string | undefined
  let ownerAId: string | undefined
  let ownerBId: string | undefined
  let clientAId: string | undefined
  try {
    const ownerA = await prisma.user.create({ data: { business: { create: { name: `Tenant A ${suffix}` } }, name: 'Owner A', email: `tenant-a-${suffix}@local.test`, passwordHash, role: 'OWNER' } })
    businessA = ownerA.businessId
    ownerAId = ownerA.id
    const ownerB = await prisma.user.create({ data: { business: { create: { name: `Tenant B ${suffix}` } }, name: 'Owner B', email: `tenant-b-${suffix}@local.test`, passwordHash, role: 'OWNER' } })
    businessB = ownerB.businessId
    ownerBId = ownerB.id
    const clientA = await prisma.client.create({ data: { businessId: businessA, name: 'Cliente A' } })
    clientAId = clientA.id
    const repairA = await prisma.repair.create({ data: {
      businessId: businessA, number: 1001, clientId: clientA.id, deviceBrand: 'Audit', deviceModel: 'Tenant',
      issue: 'Aislamiento', total: 20000, status: 'RECEIVED', trackingToken: `tenant-${suffix}`, trackingEnabled: false, updatedAt: new Date(),
    } })

    const tokenA = jwt.sign({ userId: ownerA.id, businessId: businessA, role: 'OWNER', platformRole: 'USER', tokenVersion: ownerA.tokenVersion }, process.env.JWT_SECRET!)
    const tokenB = jwt.sign({ userId: ownerB.id, businessId: businessB, role: 'OWNER', platformRole: 'USER', tokenVersion: ownerB.tokenVersion }, process.env.JWT_SECRET!)
    const call = async (method: string, path: string, body?: object, token = tokenB) => {
      const res = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined })
      return { status: res.status, text: await res.text() }
    }

    // All generated records are removed in the finally block below, so a failed assertion
    // never leaves a business, user, client or repair behind in the local database.
    const probes: Array<[string, string, string, object?]> = [
      ['GET', `/repairs/${repairA.id}`, 'repair detail'],
      ['GET', `/repairs/${repairA.id}/payments`, 'repair payments'],
      ['GET', `/repairs/${repairA.id}/history`, 'repair history'],
      ['POST', `/repairs/${repairA.id}/payments`, 'repair payment', { amount: 1000, method: 'CASH' }],
      ['PATCH', `/repairs/${repairA.id}`, 'edit repair', { deviceBrand: 'Hack', deviceModel: 'Hack', issue: 'Hack', total: repairA.total }],
      ['POST', `/repairs/${repairA.id}/cancel`, 'cancel repair', { reviewFee: 0 }],
      ['GET', `/clients/${clientA.id}`, 'client detail'],
      ['PATCH', `/clients/${clientA.id}`, 'edit client', { name: 'Hack' }],
      ['DELETE', `/clients/${clientA.id}`, 'delete client'],
    ]
    for (const [method, path, label, body] of probes) {
      const result = await call(method, path, body)
      assert.notEqual(result.status, 200, `${label} leaked data across tenants (200)`)
      assert.ok([403, 404].includes(result.status), `${label} answered ${result.status}, expected 403/404`)
      console.log(`  ok  ${label} -> ${result.status}`)
    }
    // List endpoints must answer 200 with their own (empty) scope, never with A's rows.
    for (const path of ['/warranties', '/repairs?paginated=true&page=1&pageSize=10', '/clients?paginated=true&page=1&pageSize=10', '/cash/movements?page=1&pageSize=10']) {
      const result = await call('GET', path)
      assert.equal(result.status, 200, `${path} should list the caller's own scope`)
      const parsed = JSON.parse(result.text)
      const rows = Array.isArray(parsed) ? parsed : parsed.items
      assert.equal(rows.length, 0, `${path} returned rows from another tenant`)
      assert.ok(!result.text.includes(repairA.id), `${path} leaked a foreign repair id`)
      console.log(`  ok  ${path} -> 200, scope empty`)
    }
    // Business A must still be intact.
    const after = await prisma.repair.findUniqueOrThrow({ where: { id: repairA.id } })
    assert.equal(after.deviceBrand, repairA.deviceBrand, 'repair was mutated cross-tenant')
    assert.equal(after.paid, repairA.paid, 'payment was recorded cross-tenant')
    const movements = await prisma.cashMovement.count({ where: { repairId: repairA.id } })
    assert.equal(movements, await prisma.cashMovement.count({ where: { repairId: repairA.id, businessId: businessA } }), 'orphan cash movement created')
    console.log('PASS: no cross-tenant read, write, payment or deletion')
  } finally {
    // Remove only what this test created, in dependency order and scoped to its own ids.
    // Tenants that were never created are simply skipped.
    const created = [businessA, businessB].filter((id): id is string => Boolean(id))
    if (created.length) {
      // Pagos antes que caja: Payment.cashMovementId usa ON DELETE RESTRICT sobre CashMovement.
      await prisma.payment.deleteMany({ where: { businessId: { in: created } } })
      await prisma.cashMovement.deleteMany({ where: { businessId: { in: created } } })
      await prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId: { in: created } } } })
      await prisma.repair.deleteMany({ where: { businessId: { in: created } } })
      // Registration also creates a Subscription, which RESTRICTs the business deletion.
      await prisma.subscription.deleteMany({ where: { businessId: { in: created } } })
    }
    if (clientAId) await prisma.client.deleteMany({ where: { id: clientAId } })
    const ownerIds = [ownerAId, ownerBId].filter((id): id is string => Boolean(id))
    if (ownerIds.length) await prisma.user.deleteMany({ where: { id: { in: ownerIds } } })
    if (created.length) await prisma.business.deleteMany({ where: { id: { in: created } } })
  }
}
main().finally(() => prisma.$disconnect())

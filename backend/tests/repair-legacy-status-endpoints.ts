import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { RepairStatus } from '@prisma/client'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.equal(database.protocol, 'postgresql:')
assert.equal(database.hostname, '127.0.0.1', 'Local PostgreSQL only')
assert.ok(database.pathname.endsWith('_test') && database.pathname !== '/tecnodesk_visual_test', 'Isolated test database required')
process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '500'

async function main() {
  const [{ app }, { prisma }, { assertStatusChange }] = await Promise.all([import('../src/server'), import('../src/lib/prisma'), import('../src/modules/repairs/repair-status')])
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const businesses: string[] = []
  const failures: string[] = []
  let passed = 0
  const check = async (label: string, test: () => void | Promise<void>) => {
    try { await test(); console.log(`OK ${++passed}: ${label}`) }
    catch (error) { failures.push(label); console.error(`FAIL ${label}:`, error) }
  }
  const tokenFor = (user: { id: string; businessId: string; role: string; tokenVersion: number }) => jwt.sign({ userId: user.id, businessId: user.businessId, role: user.role, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET!)
  const call = async (token: string, id: string, route: string, body?: object) => {
    const response = await fetch(`${base}/repairs/${id}/${route}`, { method: 'PATCH', headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, body: await response.json() as any }
  }
  try {
    const tenant = async () => {
      const business = await prisma.business.create({ data: { name: `Legacy repair ${randomUUID()}` } }); businesses.push(business.id)
      const user = await prisma.user.create({ data: { businessId: business.id, name: 'Owner', email: `${randomUUID()}@local.test`, passwordHash: 'unused', role: 'OWNER' } })
      const now = new Date(), end = new Date(now.getTime() + 30 * 86400000)
      await prisma.subscription.create({ data: { businessId: business.id, status: 'ACTIVE', planCode: 'COMPLETE', trialStartedAt: now, trialEndsAt: now, trialConsumedAt: now, currentPeriodStart: now, currentPeriodEnd: end, accessExpiresAt: end } })
      return { business, user, token: tokenFor(user) }
    }
    const a = await tenant(), b = await tenant()
    const client = await prisma.client.create({ data: { businessId: a.business.id, name: 'Client' } })
    const worker = async (permissions: string[]) => prisma.user.create({ data: { businessId: a.business.id, name: 'Tech', email: `${randomUUID()}@local.test`, passwordHash: 'unused', role: 'TECHNICIAN', permissions } })
    const restricted = tokenFor(await worker(['repairs.view']))
    const authorizedUser = await worker(['repairs.view', 'repairs.changeStatus'])
    const authorized = tokenFor(authorizedUser)
    let number = 1000
    const fixture = (status: RepairStatus) => prisma.repair.create({ data: {
      businessId: a.business.id, clientId: client.id, number: ++number, deviceBrand: 'Test', deviceModel: 'Legacy', issue: 'Workflow test', status,
      partsCost: 2500, laborCharge: 5000, total: 10000,
      warrantyEnabled: true, warrantyDurationDays: 30,
      ...(status === 'DELIVERED' ? { deliveredAt: new Date('2026-09-20T12:00:00Z'), warrantyStartedAt: new Date('2026-09-20T12:00:00Z'), warrantyExpiresAt: new Date('2026-10-20T12:00:00Z'), trackingExpiresAt: new Date('2026-12-19T12:00:00Z') } : {}),
    } })
    const history = (id: string) => prisma.repairStatusHistory.findMany({ where: { repairId: id }, orderBy: { createdAt: 'asc' } })
    const snapshot = async (id: string) => ({ repair: await prisma.repair.findUniqueOrThrow({ where: { id } }), history: await history(id) })
    const unchanged = async (id: string, token: string, route: string, status: number, code?: string, body?: object) => {
      const before = await snapshot(id)
      const response = await call(token, id, route, body)
      assert.equal(response.status, status, JSON.stringify(response.body))
      if (code) assert.equal(response.body.code, code)
      assert.deepEqual(await snapshot(id), before, 'Rejected/no-op request must preserve entire repair and history')
      return response
    }

    for (const target of ['BUDGET', 'APPROVED', 'TESTING'] as const) await check(`legacy ${target} is rejected even when current equals target`, () => {
      for (const current of [target, 'REVIEW', 'DELIVERED'] as const) assert.throws(() => assertStatusChange(current, target), (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'LEGACY_STATUS')
    })
    for (const [label, from, body] of [
      ['A REVIEW start empty body', 'REVIEW', {}],
      ['B REVIEW start with messages', 'REVIEW', { publicMessage: 'Comenzamos la reparación', internalNote: 'Equipo abierto en banco 2' }],
      ['C historical APPROVED start without body', 'APPROVED', undefined],
    ] as const) await check(label, async () => {
      const repair = await fixture(from)
      const response = await call(a.token, repair.id, 'start', body)
      assert.equal(response.status, 200, JSON.stringify(response.body))
      assert.equal(response.body.status, 'REPAIRING')
      assert.ok(response.body.client && Array.isArray(response.body.statusHistory), 'Canonical included response')
      const rows = await history(repair.id)
      assert.equal(rows.length, 1)
      assert.equal(rows[0].previousStatus, from)
      assert.equal(rows[0].newStatus, 'REPAIRING')
      assert.equal(rows[0].changedByUserId, a.user.id)
      assert.equal(rows[0].publicMessage, body && 'publicMessage' in body ? body.publicMessage : null)
      assert.equal(rows[0].internalNote, body && 'internalNote' in body ? body.internalNote : null)
    })
    for (const [label, from, code] of [
      ['D DELIVERED start preserves all dates', 'DELIVERED', 'DELIVERED_LOCKED'],
      ['E CANCELLED start locked', 'CANCELLED', 'STATUS_LOCKED'],
      ['F WARRANTY start locked', 'WARRANTY', 'STATUS_LOCKED'],
    ] as const) await check(label, async () => { const repair = await fixture(from); await unchanged(repair.id, a.token, 'start', 409, code) })
    for (const from of ['REVIEW', 'APPROVED'] as const) await check(`/approve rejects ${from} with LEGACY_STATUS`, async () => {
      const repair = await fixture(from); await unchanged(repair.id, a.token, 'approve', 409, 'LEGACY_STATUS', {})
    })
    for (const route of ['start', 'approve']) {
      await check(`I tenant isolation ${route}`, async () => {
        const repair = await fixture('DELIVERED'); await unchanged(repair.id, b.token, route, 404, undefined, {})
      })
      await check(`J permission denied ${route}`, async () => {
        const repair = await fixture('REVIEW'); await unchanged(repair.id, restricted, route, 403, undefined, {})
      })
      await check(`missing repair ${route}`, async () => { assert.equal((await call(a.token, randomUUID(), route, {})).status, 404) })
    }
    await check('K modern REPAIRING generic no-op has no writes/history', async () => {
      const repair = await fixture('REPAIRING')
      const response = await unchanged(repair.id, a.token, 'status', 200, undefined, { status: 'REPAIRING', publicMessage: 'Must not create history' })
      assert.equal(response.body.status, 'REPAIRING'); assert.ok(response.body.client && Array.isArray(response.body.statusHistory))
      await unchanged(repair.id, a.token, 'start', 200, undefined, {})
    })
    await check('DELIVERED generic no-op preserves warranty/tracking dates and history', async () => {
      const repair = await fixture('DELIVERED'); await unchanged(repair.id, a.token, 'status', 200, undefined, { status: 'DELIVERED' })
    })
    await check('L generic APPROVED to APPROVED rejected', async () => {
      const repair = await fixture('APPROVED'); await unchanged(repair.id, a.token, 'status', 409, 'LEGACY_STATUS', { status: 'APPROVED' })
    })
    await check('authorized technician start keeps response financial redaction', async () => {
      const repair = await fixture('REVIEW')
      const response = await call(authorized, repair.id, 'start', {})
      assert.equal(response.status, 200)
      for (const field of ['partsCost', 'laborCost', 'laborCharge', 'initialCostMovementId', 'payments']) assert.equal(field in response.body, false, `Leaked ${field}`)
      assert.equal((await history(repair.id))[0].changedByUserId, authorizedUser.id)
    })
    for (const body of [{ publicMessage: 123 }, { publicMessage: 'x'.repeat(501) }, { internalNote: 'x'.repeat(1001) }]) await check('invalid start messages rejected without mutation', async () => {
      const repair = await fixture('REVIEW'); await unchanged(repair.id, a.token, 'start', 400, undefined, body)
    })
    assert.deepEqual(failures, [], `Failed scenarios: ${failures.join(', ')}`)
    console.log(`REPAIR LEGACY STATUS ENDPOINTS PASSED: ${passed} scenarios`)
  } finally {
    try {
      for (const businessId of businesses) await prisma.$transaction([
        prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId } } }),
        prisma.repair.deleteMany({ where: { businessId } }),
        prisma.client.deleteMany({ where: { businessId } }),
        prisma.subscription.deleteMany({ where: { businessId } }),
        prisma.user.deleteMany({ where: { businessId } }),
        prisma.business.delete({ where: { id: businessId } }),
      ])
    } finally {
      try { await prisma.$disconnect() }
      finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

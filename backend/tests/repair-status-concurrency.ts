import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { type RepairStatus } from '@prisma/client'
import { claimRepairStatusTransition } from '../src/modules/repairs/repair-status-transition'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.equal(database.protocol, 'postgresql:')
assert.equal(database.hostname, '127.0.0.1', 'Local PostgreSQL only')
assert.ok(database.pathname.endsWith('_test') && database.pathname !== '/tecnodesk_visual_test', 'Disposable test database required')
process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '500'
const conflictMessage = 'El estado de la reparación cambió mientras se procesaba la solicitud. Actualizá la reparación e intentá nuevamente.'
const isConflict = (error: unknown) => {
  assert.ok(error instanceof Error)
  assert.equal((error as Error & { code: string }).code, 'STATUS_CONFLICT')
  assert.equal((error as Error & { statusCode: number }).statusCode, 409)
  assert.equal(error.message, conflictMessage)
  return true
}

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const businesses: string[] = []
  try {
    const tenant = async () => {
      const business = await prisma.business.create({ data: { name: `Status race ${randomUUID()}` } }); businesses.push(business.id)
      const now = new Date(), end = new Date(now.getTime() + 30 * 86400000)
      await prisma.subscription.create({ data: { businessId: business.id, planCode: 'COMPLETE', status: 'ACTIVE', trialStartedAt: now, trialEndsAt: now, trialConsumedAt: now, currentPeriodStart: now, currentPeriodEnd: end, accessExpiresAt: end } })
      return business
    }
    const a = await tenant(), b = await tenant()
    const user = (businessId: string, role: 'OWNER' | 'TECHNICIAN' = 'OWNER', permissions: string[] = []) => prisma.user.create({ data: { businessId, name: 'Test', email: `${randomUUID()}@local.test`, passwordHash: 'unused', role, permissions } })
    const actors = [await user(a.id), await user(a.id)]
    const outsider = await user(b.id)
    const denied = await user(a.id, 'TECHNICIAN', ['repairs.view'])
    const technician = await user(a.id, 'TECHNICIAN', ['repairs.view', 'repairs.changeStatus'])
    const tokenFor = (actor: typeof actors[number]) => jwt.sign({ userId: actor.id, businessId: actor.businessId, role: actor.role, tokenVersion: actor.tokenVersion }, process.env.JWT_SECRET!, { expiresIn: '8h' })
    const client = await prisma.client.create({ data: { businessId: a.id, name: 'Client' } })
    let number = 1000
    const fixture = (status: RepairStatus) => prisma.repair.create({ data: { businessId: a.id, clientId: client.id, number: ++number, deviceBrand: 'Test', deviceModel: 'Concurrent', issue: 'Status race', status, warrantyEnabled: true, warrantyDurationDays: 30, partsCost: 1000, laborCost: 500, laborCharge: 2000, total: 3500 } })
    const snapshot = async (id: string) => ({ repair: await prisma.repair.findUniqueOrThrow({ where: { id } }), history: await prisma.repairStatusHistory.findMany({ where: { repairId: id }, orderBy: { createdAt: 'asc' } }) })
    const race = async (initial: RepairStatus, targets: [RepairStatus, RepairStatus]) => {
      const repair = await fixture(initial)
      let arrived = 0
      let release!: () => void
      const barrier = new Promise<void>(resolve => { release = resolve })
      const requests = targets.map((target, index) => prisma.$transaction(async tx => {
        const current = await tx.repair.findFirstOrThrow({ where: { id: repair.id, businessId: a.id } })
        assert.equal(current.status, initial, 'Both transactions must read the same initial status')
        if (++arrived === 2) release()
        await barrier
        await claimRepairStatusTransition(tx, current, target, { publicMessage: `Winner ${index}`, internalNote: `Actor ${index}` }, actors[index].id)
        return { target, actorId: actors[index].id, index }
      }, { timeout: 15000 }))
      const outcomes = await Promise.allSettled(requests)
      assert.equal(arrived, 2)
      const winners = outcomes.filter((item): item is PromiseFulfilledResult<{ target: RepairStatus; actorId: string; index: number }> => item.status === 'fulfilled')
      const losers = outcomes.filter((item): item is PromiseRejectedResult => item.status === 'rejected')
      assert.equal(winners.length, 1, 'Exactly one transition from the shared snapshot must succeed')
      assert.equal(losers.length, 1); isConflict(losers[0].reason)
      const final = await snapshot(repair.id), winner = winners[0].value
      assert.equal(final.repair.status, winner.target)
      assert.equal(final.history.length, 1)
      assert.equal(final.history[0].previousStatus, initial)
      assert.equal(final.history[0].newStatus, winner.target)
      assert.equal(final.history[0].changedByUserId, winner.actorId)
      assert.equal(final.history[0].publicMessage, `Winner ${winner.index}`)
      assert.equal(final.history[0].internalNote, `Actor ${winner.index}`)
      console.log(`CAS ${initial} -> ${targets.join('/')}: winners=1, conflicts=1, winner=${winner.target}, actor=${winner.actorId}, history=1`)
      return final
    }
    await race('REVIEW', ['REPAIRING', 'READY'])
    await race('REVIEW', ['REPAIRING', 'REPAIRING'])
    const delivery = await race('READY', ['DELIVERED', 'DELIVERED'])
    const { deliveredAt, warrantyStartedAt, warrantyExpiresAt, trackingExpiresAt } = delivery.repair
    assert.ok(deliveredAt && warrantyStartedAt && warrantyExpiresAt && trackingExpiresAt)
    assert.equal(warrantyStartedAt.getTime(), deliveredAt.getTime())
    assert.equal(warrantyExpiresAt.getTime() - warrantyStartedAt.getTime(), 30 * 86400000)
    assert.equal(trackingExpiresAt.getTime() - deliveredAt.getTime(), 7 * 86400000)
    console.log(`DELIVERY DATES: ${JSON.stringify({ deliveredAt, warrantyStartedAt, warrantyExpiresAt, trackingExpiresAt })}`)

    // A real FK failure in history creation must roll back the already claimed update.
    const rollback = await fixture('READY'), beforeRollback = await snapshot(rollback.id)
    await assert.rejects(() => prisma.$transaction(async tx => {
      const current = await tx.repair.findUniqueOrThrow({ where: { id: rollback.id } })
      await claimRepairStatusTransition(tx, current, 'DELIVERED', {}, randomUUID())
    }), (error: unknown) => error instanceof Error && /P2003|foreign key|23503/i.test(error.message))
    assert.deepEqual(await snapshot(rollback.id), beforeRollback)
    console.log('ROLLBACK: history FK failure preserves status, delivery dates and history')

    const wrongTenant = await fixture('REVIEW')
    const beforeWrongTenant = await snapshot(wrongTenant.id)
    await assert.rejects(() => prisma.$transaction(async tx => {
      const current = await tx.repair.findUniqueOrThrow({ where: { id: wrongTenant.id } })
      await claimRepairStatusTransition(tx, { ...current, businessId: b.id }, 'REPAIRING', {}, actors[0].id)
    }), isConflict)
    assert.deepEqual(await snapshot(wrongTenant.id), beforeWrongTenant)
    console.log('CAS TENANT FILTER: mismatched businessId cannot claim a repair')

    const call = async (id: string, route: string, actor = actors[0], body?: object) => {
      const response = await fetch(`${base}/repairs/${id}/${route}`, { method: 'PATCH', headers: { authorization: `Bearer ${tokenFor(actor)}`, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
      return { status: response.status, body: await response.json() as any }
    }
    const httpRepair = await fixture('REVIEW')
    const httpRequests = Array.from({ length: 20 }, () => call(httpRepair.id, 'start'))
    const results = await Promise.all(httpRequests)
    const successes = results.filter(item => item.status === 200), conflicts = results.filter(item => item.status === 409)
    assert.ok(successes.length >= 1)
    assert.equal(successes.length + conflicts.length, 20, JSON.stringify(results))
    for (const response of conflicts) assert.deepEqual(response.body, { success: false, code: 'STATUS_CONFLICT', message: conflictMessage })
    const httpFinal = await snapshot(httpRepair.id)
    assert.equal(httpFinal.repair.status, 'REPAIRING')
    assert.equal(httpFinal.history.length, 1)
    assert.equal(httpFinal.history[0].previousStatus, 'REVIEW'); assert.equal(httpFinal.history[0].newStatus, 'REPAIRING')
    console.log(`HTTP START: requests=20, 200=${successes.length}, 409=${conflicts.length}, all conflicts STATUS_CONFLICT, final=REPAIRING, history=1`)
    assert.equal((await call(httpRepair.id, 'start')).status, 200)
    assert.deepEqual(await snapshot(httpRepair.id), httpFinal, 'Modern no-op must preserve all data')
    console.log('MODERN NO-OP: 200, no write or history')
    const legacy = await fixture('APPROVED'), beforeLegacy = await snapshot(legacy.id)
    for (const [route, body] of [['approve', {}], ['status', { status: 'APPROVED' }]] as const) {
      const response = await call(legacy.id, route, actors[0], body)
      assert.equal(response.status, 409); assert.equal(response.body.code, 'LEGACY_STATUS')
      assert.deepEqual(await snapshot(legacy.id), beforeLegacy)
    }
    for (const [route, body] of [['start', {}], ['approve', {}], ['status', { status: 'READY' }], ['status/advance', {}], ['status/rewind', {}]] as const) {
      const before = await snapshot(wrongTenant.id)
      assert.equal((await call(wrongTenant.id, route, outsider, body)).status, 404)
      assert.equal((await call(wrongTenant.id, route, denied, body)).status, 403)
      assert.deepEqual(await snapshot(wrongTenant.id), before)
    }
    const financial = await fixture('REVIEW')
    const redacted = await call(financial.id, 'start', technician)
    assert.equal(redacted.status, 200)
    for (const field of ['partsCost', 'laborCost', 'laborCharge', 'payments', 'initialCostMovementId']) assert.equal(field in redacted.body, false, `Leaked ${field}`)
    console.log('LEGACY / TENANT / PERMISSIONS / FINANCIAL REDACTION: PASS')
    console.log('REPAIR STATUS CONCURRENCY PASSED')
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

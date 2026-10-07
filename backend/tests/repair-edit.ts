import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Local database only')
assert.ok(database.pathname.endsWith('_test'), 'Dedicated test database only')
process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '500'

async function main() {
  const [{ app }, { prisma }, { recordInitialRepairFinance }] = await Promise.all([import('../src/server'), import('../src/lib/prisma'), import('../src/modules/repairs/repair-finance')])
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const businesses: string[] = [], suffix = randomUUID()
  try {
    const business = await prisma.business.create({ data: { name: 'Unified edit fixture' } }); businesses.push(business.id)
    const other = await prisma.business.create({ data: { name: 'Other fixture' } }); businesses.push(other.id)
    const owner = await prisma.user.create({ data: { businessId: business.id, role: 'OWNER', name: 'Fixture', email: `${suffix}@example.test`, passwordHash: 'fixture' } })
    const tech = await prisma.user.create({ data: { businessId: business.id, role: 'TECHNICIAN', name: 'Fixture tech', email: `tech-${suffix}@example.test`, passwordHash: 'fixture', permissions: ['repairs.view', 'repairs.update'] } })
    const foreign = await prisma.user.create({ data: { businessId: other.id, role: 'OWNER', name: 'Other', email: `other-${suffix}@example.test`, passwordHash: 'fixture' } })
    const token = (user: typeof owner) => jwt.sign({ userId: user.id, businessId: user.businessId, tokenVersion: 0 }, process.env.JWT_SECRET!)
    const client = await prisma.client.create({ data: { businessId: business.id, name: 'Fixture client' } })
    const replacement = await prisma.client.create({ data: { businessId: business.id, name: 'New client' } })
    let number = 1000
    const create = (cost = 30000, advance = 20000) => prisma.$transaction(async tx => {
      const repair = await tx.repair.create({ data: { businessId: business.id, clientId: client.id, number: ++number, deviceBrand: 'Samsung', deviceModel: 'A14', issue: 'Fixture issue', total: 60000, partsCost: cost, laborCost: 500, laborCharge: 30000, estimatedDeliveryDate: new Date('2026-11-01T00:00:00Z') } })
      await recordInitialRepairFinance(tx, repair, client.name, { advanceAmount: advance, advanceMethod: 'CASH', partsCostMethod: 'TRANSFER' })
      return tx.repair.findUniqueOrThrow({ where: { id: repair.id } })
    })
    const request = async (id: string, body: object, user = owner, path = 'edit') => {
      const response = await fetch(`${base}/repairs/${id}/${path}`, { method: path === 'payments' ? 'POST' : 'PATCH', headers: { authorization: `Bearer ${token(user)}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: response.status, body: await response.json() as any }
    }
    const snapshot = async (id: string) => ({
      repair: await prisma.repair.findUniqueOrThrow({ where: { id } }),
      payments: await prisma.payment.findMany({ where: { repairId: id }, orderBy: { id: 'asc' } }),
      cash: await prisma.cashMovement.findMany({ where: { repairId: id }, orderBy: { id: 'asc' } }),
      history: await prisma.repairStatusHistory.findMany({ where: { repairId: id }, orderBy: { id: 'asc' } }),
    })
    const edit = async (id: string, body: object) => { const result = await request(id, body); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body }
    const general = await create(), before = await snapshot(general.id)
    const changed = await edit(general.id, { deviceModel: 'A15', issue: 'Changed issue', diagnosis: 'Diagnosis', notes: 'Notes', color: 'Black', imei: '123-456', estimatedDeliveryDate: null, clientId: replacement.id })
    assert.equal(changed.deviceModel, 'A15'); assert.equal(changed.estimatedDeliveryDate, null); assert.equal(changed.clientId, replacement.id)
    let state = await snapshot(general.id)
    assert.deepEqual(state.cash, before.cash); assert.deepEqual(state.payments, before.payments)
    for (const key of ['partsCost', 'laborCost', 'laborCharge', 'total', 'paid'] as const) assert.equal(state.repair[key], before.repair[key])
    const r = await create(); await edit(r.id, { partsCost: 20000 })
    state = await snapshot(r.id)
    assert.equal(state.repair.initialCostMovementId, r.initialCostMovementId)
    assert.equal(state.cash.find(m => m.id === r.initialCostMovementId)?.amount, 20000)
    assert.equal(state.cash.find(m => m.id === r.initialCostMovementId)?.method, 'TRANSFER')
    await edit(r.id, { partsCost: 0 }); assert.equal(await prisma.cashMovement.findUnique({ where: { id: r.initialCostMovementId! } }), null)
    assert.equal((await snapshot(r.id)).repair.initialCostMovementId, null)
    await edit(r.id, { partsCost: 20000, partsCostMethod: 'CARD' })
    assert.equal((await snapshot(r.id)).cash.filter(m => m.type === 'EXPENSE').length, 1)
    const laborBefore = await snapshot(r.id); await edit(r.id, { laborCharge: 40000 })
    state = await snapshot(r.id); assert.equal(state.repair.laborCharge, 40000); assert.deepEqual(state.cash, laborBefore.cash); assert.deepEqual(state.payments, laborBefore.payments); assert.equal(state.repair.total, 60000)
    await edit(r.id, { total: 55000 }); state = await snapshot(r.id)
    assert.equal(state.repair.total, 55000); assert.equal(state.repair.partsCost, 20000); assert.equal(state.repair.laborCharge, 40000)
    const rejectedBefore = await snapshot(r.id)
    assert.equal((await request(r.id, { total: 10000, deviceModel: 'Must roll back', partsCost: 1000 })).status, 400)
    assert.deepEqual(await snapshot(r.id), rejectedBefore)
    const advanceBefore = await snapshot(r.id)
    await edit(r.id, { advanceAmount: 10000 })
    state = await snapshot(r.id)
    assert.equal(state.payments[0].id, advanceBefore.payments[0].id); assert.equal(state.payments[0].cashMovementId, advanceBefore.payments[0].cashMovementId); assert.equal(state.payments[0].amount, 10000); assert.equal(state.payments[0].method, 'CASH')
    assert.equal(state.cash.find(m => m.id === state.payments[0].cashMovementId)?.amount, 10000)
    await edit(r.id, { advanceAmount: 0 }); assert.equal((await snapshot(r.id)).payments.length, 0)
    assert.equal((await request(r.id, { advanceAmount: 20000 })).status, 400)
    await edit(r.id, { advanceAmount: 20000, advanceMethod: 'TRANSFER' })
    assert.equal((await snapshot(r.id)).payments.length, 1)
    assert.equal((await request(r.id, { amount: 5000, method: 'CARD' }, owner, 'payments')).status, 201)
    const later = (await snapshot(r.id)).payments.find(p => !p.isAdvance)!
    const simultaneous = await edit(r.id, { partsCost: 10000, laborCharge: 45000, total: 50000, advanceAmount: 15000, deviceModel: 'Unified', clientId: replacement.id, estimatedDeliveryDate: '2026-12-01' })
    assert.equal(simultaneous.paid, 20000); assert.equal(simultaneous.total, 50000); assert.equal(simultaneous.partsCost, 10000); assert.equal(simultaneous.laborCharge, 45000); assert.equal(simultaneous.deviceModel, 'Unified')
    assert.deepEqual((await snapshot(r.id)).payments.find(p => p.id === later.id), later, 'Later payments remain intact')
    const noop = await snapshot(r.id)
    await edit(r.id, { deviceModel: 'Unified', total: 50000, partsCost: 10000, laborCharge: 45000, advanceAmount: 15000 })
    assert.deepEqual(await snapshot(r.id), noop, 'No-op has no writes, duplicates or history')
    await edit(r.id, { total: 10000, advanceAmount: 5000 })
    assert.equal((await snapshot(r.id)).repair.paid, 10000, 'Total is validated against the resulting advance plus later payments')
    const underpaid = await snapshot(r.id)
    assert.equal((await request(r.id, { total: 9999, advanceAmount: 5000, notes: 'Reject all' })).status, 400)
    assert.deepEqual(await snapshot(r.id), underpaid)
    const rollback = await create(0, 0)
    for (let i = 0; i < 2; i++) await prisma.cashMovement.create({ data: { businessId: business.id, repairId: rollback.id, type: 'INCOME', origin: 'REPAIR', description: `Adelanto reparación #${rollback.number}`, amount: 1 } })
    const rollbackBefore = await snapshot(rollback.id)
    assert.equal((await request(rollback.id, { deviceModel: 'Rolled back', partsCost: 20000, partsCostMethod: 'CASH', advanceAmount: 1000, advanceMethod: 'CASH' })).status, 409)
    assert.deepEqual(await snapshot(rollback.id), rollbackBefore, 'Advance failure rolls back general changes, expense and history')
    const needsMethod = await create(0, 0), needsMethodBefore = await snapshot(needsMethod.id)
    assert.equal((await request(needsMethod.id, { deviceModel: 'Reject all', partsCost: 20000 })).status, 400)
    assert.deepEqual(await snapshot(needsMethod.id), needsMethodBefore, 'Missing expense method rolls back general data too')
    for (const body of [{ partsCost: 0 }, { laborCharge: 0 }, { advanceAmount: 0 }, { partsCostMethod: 'CASH' }, { advanceMethod: 'CASH' }]) assert.equal((await request(r.id, body, tech)).status, 403)
    const operational = await request(r.id, { notes: 'Allowed', total: 50000 }, tech)
    assert.equal(operational.status, 200); assert.ok(!('partsCost' in operational.body)); assert.ok(!('payments' in operational.body))
    assert.equal((await request(r.id, { total: 50000 }, foreign)).status, 404)
    assert.equal((await request(r.id, { status: 'DELIVERED' })).status, 400)
    assert.equal((await request(r.id, { laborCost: 0 })).status, 400)
    for (const field of ['partsCost', 'laborCharge', 'total', 'advanceAmount']) for (const amount of [-1, 1.5, 2147483648]) assert.equal((await request(r.id, { [field]: amount })).status, 400)
    await prisma.client.update({ where: { id: client.id }, data: { deletedAt: new Date() } })
    const historical = await create(0, 0)
    await edit(historical.id, { notes: 'Historical client retained' })
    assert.equal((await snapshot(historical.id)).repair.clientId, client.id)
    assert.equal((await request(r.id, { clientId: client.id })).status, 400)
    const concurrent = await create(0, 0)
    const calls = await Promise.all([request(concurrent.id, { partsCost: 10000, partsCostMethod: 'CASH', advanceAmount: 10000, advanceMethod: 'CASH' }), request(concurrent.id, { partsCost: 10000, partsCostMethod: 'CASH', advanceAmount: 10000, advanceMethod: 'CASH' })])
    assert.ok(calls.every(result => result.status === 200), JSON.stringify(calls))
    state = await snapshot(concurrent.id); assert.equal(state.cash.length, 2); assert.equal(state.payments.length, 1); assert.equal(state.repair.paid, 10000); assert.equal(state.history.length, 2)
    const legacyRace = await create(0, 0)
    const mixed = await Promise.all([request(legacyRace.id, { advanceAmount: 10000, advanceMethod: 'CASH' }), request(legacyRace.id, { amount: 10000, method: 'CASH' }, owner, 'advance')])
    assert.ok(mixed.every(result => result.status === 200), JSON.stringify(mixed))
    assert.equal((await snapshot(legacyRace.id)).payments.length, 1, 'Legacy advance and unified edit share the lock')
    for (let i = 0; i < 4; i++) {
      const paymentRace = await create(0, 20000)
      const race = await Promise.all([request(paymentRace.id, { total: 25000 }), request(paymentRace.id, { amount: 30000, method: 'CASH' }, owner, 'payments')])
      assert.ok(!race.every(result => result.status === 200 || result.status === 201), 'Lower total and a stale payment cannot both succeed')
      const after = await snapshot(paymentRace.id)
      assert.ok(after.repair.paid <= after.repair.total)
      assert.equal(after.repair.paid, after.payments.reduce((sum, payment) => sum + payment.amount, 0))
    }
    const cancelled = await create(); await prisma.repair.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } })
    const cancelledBefore = await snapshot(cancelled.id)
    for (const body of [{ partsCost: 0 }, { advanceAmount: 0 }, { total: 50000 }]) assert.equal((await request(cancelled.id, body)).status, 409)
    assert.deepEqual(await snapshot(cancelled.id), cancelledBefore)
    console.log('UNIFIED REPAIR EDIT PASSED: A–N, atomic rollback, no-op, linked cost/advance, preserved later payments, permissions, bounds, workflow rejection and concurrency.')
  } finally {
    for (const businessId of businesses) {
      await prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId } } })
      await prisma.payment.deleteMany({ where: { businessId } })
      await prisma.repair.deleteMany({ where: { businessId } })
      await prisma.cashMovement.deleteMany({ where: { businessId } })
      await prisma.client.deleteMany({ where: { businessId } })
      await prisma.subscription.deleteMany({ where: { businessId } })
      await prisma.user.deleteMany({ where: { businessId } })
      await prisma.business.delete({ where: { id: businessId } })
    }
    await prisma.$disconnect(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

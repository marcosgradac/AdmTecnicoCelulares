import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Only a local database is allowed')
assert.ok(database.pathname.endsWith('_test'), 'Use a dedicated test database')
process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '300'

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(done => server.once('listening', done))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const businesses: string[] = []
  const suffix = randomUUID()
  const trigger = `qa_cost_${suffix.replaceAll('-', '')}`
  const owner = async (label: string) => {
    const business = await prisma.business.create({ data: { name: `Cost correction ${label}` } })
    businesses.push(business.id)
    const user = await prisma.user.create({ data: { businessId: business.id, name: 'QA', email: `${label}-${suffix}@example.test`, passwordHash: 'test-only', role: 'OWNER' } })
    const token = jwt.sign({ userId: user.id, businessId: business.id, tokenVersion: 0 }, process.env.JWT_SECRET!)
    return { business, user, token }
  }
  const request = async (id: string, body: object, token: string) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/repairs/${id}/initial-cost`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() as any }
  }
  try {
    const a = await owner('a'), b = await owner('b')
    const client = await prisma.client.create({ data: { businessId: a.business.id, name: 'Local client' } })
    const { recordInitialRepairFinance } = await import('../src/modules/repairs/repair-finance')
    let number = 1000
    const create = (partsCost: number) => prisma.$transaction(async tx => {
      const repair = await tx.repair.create({ data: { businessId: a.business.id, clientId: client.id, number: ++number,
        deviceBrand: 'Samsung', deviceModel: 'QA', issue: 'Test', total: 80000, partsCost, laborCost: 500, laborCharge: 40000 } })
      await recordInitialRepairFinance(tx, repair, client.name, { advanceAmount: 10000, advanceMethod: 'CASH', partsCostMethod: 'TRANSFER' })
      return tx.repair.findUniqueOrThrow({ where: { id: repair.id } })
    })
    const snapshot = async (repairId: string) => ({
      repair: await prisma.repair.findUniqueOrThrow({ where: { id: repairId } }),
      movements: await prisma.cashMovement.findMany({ where: { repairId }, orderBy: { id: 'asc' } }),
      payments: await prisma.payment.findMany({ where: { repairId }, orderBy: { id: 'asc' } }),
      history: await prisma.repairStatusHistory.findMany({ where: { repairId }, orderBy: { id: 'asc' } }),
    })
    const correct = (id: string, amount: number, method?: 'CASH' | 'CARD' | 'TRANSFER') => request(id, { amount, ...(method ? { method } : {}) }, a.token)
    const r = await create(30000)
    await prisma.$transaction(async tx => {
      const movement = await tx.cashMovement.create({ data: { businessId: a.business.id, repairId: r.id, type: 'INCOME', origin: 'REPAIR', description: 'Pago posterior', amount: 5000, method: 'CARD' } })
      await tx.payment.create({ data: { businessId: a.business.id, repairId: r.id, clientId: client.id, amount: 5000, method: 'CARD', cashMovementId: movement.id } })
      await tx.repair.update({ where: { id: r.id }, data: { paid: { increment: 5000 } } })
    })
    const extra = await prisma.cashMovement.create({ data: { businessId: a.business.id, repairId: r.id, type: 'EXPENSE', origin: 'REPAIR', description: 'Otro egreso', amount: 700 } })
    const before = await snapshot(r.id)
    let result = await correct(r.id, 20000)
    assert.equal(result.status, 200, JSON.stringify(result.body))
    assert.equal(result.body.partsCost, 20000)
    assert.equal(result.body.initialCostMovementId, r.initialCostMovementId)
    let state = await snapshot(r.id)
    assert.equal(state.movements.find(m => m.id === r.initialCostMovementId)?.amount, 20000)
    assert.equal(state.movements.find(m => m.id === r.initialCostMovementId)?.method, 'TRANSFER', 'An omitted method is preserved')
    assert.equal(state.movements.filter(m => m.description === `Costo inicial reparación #${r.number}`).length, 1)
    assert.deepEqual(state.payments, before.payments)
    assert.equal(state.repair.paid, before.repair.paid)
    assert.equal(state.repair.total, before.repair.total)
    assert.equal(state.repair.laborCost, 500)
    assert.equal(state.repair.laborCharge, 40000)
    assert.deepEqual(state.movements.filter(m => m.type === 'INCOME'), before.movements.filter(m => m.type === 'INCOME'))
    assert.deepEqual(state.movements.find(m => m.id === extra.id), extra)
    assert.equal(state.history.length, 1)
    assert.equal(state.history[0].internalNote, 'Costo/gasto corregido de $30.000 a $20.000')
    assert.equal(state.history[0].changedByUserId, a.user.id)
    assert.equal(state.history[0].previousStatus, state.history[0].newStatus)
    await correct(r.id, 20000)
    assert.deepEqual(await snapshot(r.id), state, 'No-op creates no writes or extra history')
    result = await correct(r.id, 35000, 'CARD')
    assert.equal(result.status, 200)
    assert.equal(result.body.initialCostMovementId, r.initialCostMovementId)
    assert.equal((await prisma.cashMovement.findUniqueOrThrow({ where: { id: r.initialCostMovementId! } })).amount, 35000)
    assert.equal((await prisma.cashMovement.findUniqueOrThrow({ where: { id: r.initialCostMovementId! } })).method, 'CARD')
    const methodHistory = await prisma.repairStatusHistory.count({ where: { repairId: r.id } })
    assert.equal((await correct(r.id, 35000, 'CASH')).status, 200)
    assert.equal(await prisma.repairStatusHistory.count({ where: { repairId: r.id } }), methodHistory, 'Method-only changes do not invent amount corrections')
    assert.equal((await prisma.cashMovement.findUniqueOrThrow({ where: { id: r.initialCostMovementId! } })).method, 'CASH')
    const zero = await create(30000)
    result = await correct(zero.id, 0)
    assert.equal(result.status, 200)
    assert.equal(result.body.partsCost, 0)
    assert.equal(result.body.initialCostMovementId, null)
    assert.equal(await prisma.cashMovement.findUnique({ where: { id: zero.initialCostMovementId! } }), null)
    assert.equal((await prisma.payment.findMany({ where: { repairId: zero.id } })).length, 1)
    assert.equal(result.body.paid, 10000)
    const free = await create(0)
    const freeBefore = await snapshot(free.id)
    assert.equal((await correct(free.id, 20000)).status, 400)
    assert.deepEqual(await snapshot(free.id), freeBefore)
    result = await correct(free.id, 20000, 'CASH')
    assert.equal(result.status, 200)
    const newCost = await prisma.cashMovement.findUniqueOrThrow({ where: { id: result.body.initialCostMovementId } })
    assert.equal(newCost.amount, 20000)
    assert.equal(newCost.type, 'EXPENSE'); assert.equal(newCost.origin, 'REPAIR')
    assert.equal(newCost.clientName, client.name)
    assert.equal(await prisma.cashMovement.count({ where: { repairId: free.id, type: 'EXPENSE' } }), 1)
    const protectedState = await snapshot(r.id)
    assert.equal((await request(r.id, { amount: 0 }, b.token)).status, 404)
    const tech = await prisma.user.create({ data: { businessId: a.business.id, name: 'Tech', email: `tech-${suffix}@example.test`, passwordHash: 'test-only', role: 'TECHNICIAN', permissions: ['repairs.view', 'repairs.update'] } })
    const techToken = jwt.sign({ userId: tech.id, businessId: a.business.id, tokenVersion: 0 }, process.env.JWT_SECRET!)
    assert.equal((await request(r.id, { amount: 0 }, techToken)).status, 403)
    const readTech = async (path: string) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/repairs/${r.id}${path}`, { headers: { authorization: `Bearer ${techToken}` } })
      assert.equal(response.status, 200)
      assert.ok(!JSON.stringify(await response.json()).includes('Costo/gasto corregido de $'), 'Financial history is private')
    }
    await readTech(''); await readTech('/history')
    for (const amount of [-1, 1.5, 2147483648]) assert.equal((await correct(r.id, amount)).status, 400)
    assert.equal((await request(r.id, { amount: 1000, method: 'INVALID' }, a.token)).status, 400)
    assert.deepEqual(await snapshot(r.id), protectedState)
    const cancelled = await create(30000)
    await prisma.repair.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } })
    const cancelledBefore = await snapshot(cancelled.id)
    assert.equal((await correct(cancelled.id, 0)).status, 409)
    assert.deepEqual(await snapshot(cancelled.id), cancelledBefore)
    const legacy = await create(30000)
    await prisma.repair.update({ where: { id: legacy.id }, data: { initialCostMovementId: null } })
    result = await correct(legacy.id, 20000)
    assert.equal(result.status, 200)
    assert.equal(result.body.initialCostMovementId, legacy.initialCostMovementId)
    const ambiguous = await create(30000)
    await prisma.repair.update({ where: { id: ambiguous.id }, data: { initialCostMovementId: null } })
    await prisma.cashMovement.create({ data: { businessId: a.business.id, repairId: ambiguous.id, type: 'EXPENSE', origin: 'REPAIR', description: `Costo inicial reparación #${ambiguous.number}`, amount: 30000 } })
    const ambiguousBefore = await snapshot(ambiguous.id)
    result = await correct(ambiguous.id, 0)
    assert.equal(result.status, 409)
    assert.equal(result.body.message, 'Esta reparación tiene varios egresos de costo que no se pueden distinguir. Revisá la Caja antes de corregirlo.')
    assert.deepEqual(await snapshot(ambiguous.id), ambiguousBefore)
    const corrupt = await create(0)
    const income = await prisma.cashMovement.findFirstOrThrow({ where: { repairId: corrupt.id, type: 'INCOME' } })
    await prisma.repair.update({ where: { id: corrupt.id }, data: { initialCostMovementId: income.id } })
    const corruptBefore = await snapshot(corrupt.id)
    assert.equal((await correct(corrupt.id, 0)).status, 409, 'A corrupt linked INCOME can never be deleted as a cost')
    assert.deepEqual(await snapshot(corrupt.id), corruptBefore)
    for (const amount of [0, 20000]) {
      const missing = await create(30000)
      await prisma.repair.update({ where: { id: missing.id }, data: { initialCostMovementId: null } })
      await prisma.cashMovement.delete({ where: { id: missing.initialCostMovementId! } })
      result = await correct(missing.id, amount, amount > 0 ? 'CASH' : undefined)
      assert.equal(result.status, 200)
      assert.equal(result.body.partsCost, amount)
      assert.equal(await prisma.cashMovement.count({ where: { repairId: missing.id, type: 'EXPENSE' } }), amount > 0 ? 1 : 0)
    }
    await prisma.cashMovement.update({ where: { id: r.initialCostMovementId! }, data: { description: 'Nombre corregido en Caja' } })
    assert.equal((await correct(r.id, 20000)).status, 200, 'A renamed description still uses the linked ID')
    assert.equal((await prisma.repair.findUniqueOrThrow({ where: { id: r.id } })).initialCostMovementId, r.initialCostMovementId)
    const concurrent = await create(0)
    const simultaneous = await Promise.all([correct(concurrent.id, 20000, 'CASH'), correct(concurrent.id, 20000, 'CASH')])
    assert.ok(simultaneous.every(response => response.status === 200))
    assert.equal(await prisma.cashMovement.count({ where: { repairId: concurrent.id, type: 'EXPENSE' } }), 1)
    assert.equal(await prisma.repairStatusHistory.count({ where: { repairId: concurrent.id } }), 1)
    const rollback = await create(30000), rollbackBefore = await snapshot(rollback.id)
    await prisma.$executeRawUnsafe(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."repairId" = '${rollback.id}' THEN RAISE EXCEPTION 'QA rollback'; END IF; RETURN NEW; END $$`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON "RepairStatusHistory" FOR EACH ROW EXECUTE FUNCTION ${trigger}()`)
    assert.equal((await correct(rollback.id, 0)).status, 500)
    assert.deepEqual(await snapshot(rollback.id), rollbackBefore, 'History failure rolls back unlink, repair amount and movement deletion')
    console.log('INITIAL COST CORRECTION PASSED: A–N, ID preservation, RESTRICT-safe deletion, legacy recovery/ambiguity, unchanged payments/other expenses, permissions/history privacy, validation, concurrency and full rollback.')
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON "RepairStatusHistory"`)
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${trigger}()`)
    for (const businessId of businesses) {
      await prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId } } })
      await prisma.payment.deleteMany({ where: { businessId } })
      await prisma.repair.deleteMany({ where: { businessId } })
      await prisma.cashMovement.deleteMany({ where: { businessId } })
      await prisma.client.deleteMany({ where: { businessId } })
      await prisma.user.deleteMany({ where: { businessId } })
      await prisma.business.delete({ where: { id: businessId } })
    }
    await prisma.$disconnect()
    await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

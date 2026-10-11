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
    const token = jwt.sign({ userId: user.id, businessId: business.id, tokenVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: '8h' })
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
      await recordInitialRepairFinance(tx, repair, client.name, { advanceAmount: 10000, advanceMethod: 'CASH', partsCostMethod: 'TRANSFER', initialExpenseAmount: partsCost, initialExpenseMethod: 'TRANSFER', expenseConfirmed: true })
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

    // The old mutation endpoint is retired: every request preserves historic cash.
    for (const input of [{ amount: 20000 }, { amount: 0 }, { amount: -1 }, { amount: 1.5 }, { amount: 2147483648 }, { amount: 1000, method: 'CARD' }]) {
      assert.equal((await request(r.id, input, a.token)).status, 409)
      assert.deepEqual(await snapshot(r.id), before)
    }
    const tech = await prisma.user.create({ data: { businessId: a.business.id, name: 'Tech', email: 'tech-' + suffix + '@example.test', passwordHash: 'test-only', role: 'TECHNICIAN', permissions: ['repairs.view', 'repairs.update'] } })
    const techToken = jwt.sign({ userId: tech.id, businessId: a.business.id, tokenVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: '8h' })
    assert.equal((await request(r.id, { amount: 0 }, techToken)).status, 403)
    const originalExpense = before.movements.find(row => row.id === r.initialCostMovementId)!
    const compensate = async (body: object, token = a.token) => {
      const response = await fetch('http://127.0.0.1:' + address.port + '/api/repairs/' + r.id + '/financial-operations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body) })
      return { status: response.status, body: await response.json() as any }
    }
    const payload = { requestId: randomUUID(), kind: 'SUPPLIER_REFUND', movementId: originalExpense.id, amount: 10000, method: 'TRANSFER', confirmed: true }
    assert.equal((await compensate(payload, b.token)).status, 404)
    assert.equal((await compensate(payload, techToken)).status, 403)
    for (const amount of [-1, 1.5, 2147483648]) assert.equal((await compensate({ ...payload, amount })).status, 400)
    assert.deepEqual(await snapshot(r.id), before)
    for (const result of await Promise.all([1, 2].map(() => compensate(payload)))) assert.equal(result.status, 200)
    const after = await snapshot(r.id)
    assert.deepEqual(after.movements.find(row => row.id === originalExpense.id), originalExpense)
    assert.deepEqual(after.payments, before.payments)
    assert.deepEqual(after.movements.find(row => row.id === extra.id), extra)
    assert.equal(after.movements.filter(row => row.repairFinanceKind === 'SUPPLIER_REFUND').length, 1)
    assert.equal(after.movements.find(row => row.repairFinanceKind === 'SUPPLIER_REFUND')?.relatedMovementId, originalExpense.id)
    assert.equal((await compensate({ ...payload, amount: 10001 })).status, 409)
    assert.equal((await compensate({ ...payload, requestId: randomUUID(), kind: 'EXPENSE_CORRECTION', amount: 20000, reason: 'Never spent this money' })).status, 409, 'Real supplier refund cannot coexist with declaring the purchase nonexistent')
    console.log('INITIAL COST SAFETY PASSED: retired mutation endpoint, preserved payments and expenses, append-only real refund, permissions, tenants, bounds and concurrent idempotent retries')
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

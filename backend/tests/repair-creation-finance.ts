import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { validRegistrationPayload } from './helpers/registration'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname))
assert.ok(database.pathname.endsWith('_test'), 'Use a dedicated test database')
process.env.NODE_ENV = 'test'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '200'
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
  const businesses: string[] = []
  const triggerName = `qa_costs_${randomUUID().replaceAll('-', '')}`
  const request = async (method: string, path: string, body?: object, token?: string) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method, headers: { 'content-type': 'application/json', 'X-Turnstile-Token': 'test-token', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, body: await response.json() as any }
  }
  try {
    const owner = await request('POST', '/auth/register', validRegistrationPayload({ firstName: 'Costos', lastName: 'QA', email: `costos-${randomUUID()}@example.com`, password: 'CostosQA123!', businessName: 'Costos QA' }))
    assert.equal(owner.status, 201)
    businesses.push(owner.body.user.business.id)
    const token = owner.body.token
    const client = await request('POST', '/clients', { name: 'Cliente costos', phone: '1112345678' }, token)
    assert.equal(client.status, 201)
    const created = await request('POST', '/repairs', { clientId: client.body.id, deviceBrand: 'Samsung', deviceModel: 'A14', issue: 'Pantalla rota', partsCost: 30000, partsCostMethod: 'TRANSFER', laborCharge: 30000, total: 60000, advanceAmount: 20000, advanceMethod: 'CASH' }, token)
    assert.equal(created.status, 201)
    assert.equal(created.body.partsCost, 30000, 'El costo inicial debe persistirse')
    assert.equal(created.body.laborCharge, 30000)
    assert.equal(created.body.laborCost, 0, 'La mano de obra cobrada no es costo')
    assert.equal(created.body.paid, 20000)
    assert.equal(created.body.total - created.body.paid, 40000)
    assert.equal(created.body.payments.length, 1)
    const cash = await prisma.cashMovement.findMany({ where: { repairId: created.body.id } })
    assert.equal(cash.length, 2)
    assert.equal(cash.find(row => row.type === 'EXPENSE')?.amount, 30000)
    assert.equal(cash.find(row => row.type === 'INCOME')?.amount, 20000)
    assert.equal(created.body.initialCostMovementId, cash.find(row => row.type === 'EXPENSE')?.id)
    assert.ok(cash.every(row => row.businessId === businesses[0] && row.origin === 'REPAIR' && row.clientName === client.body.name))
    // El gasto y el adelanto son movimientos distintos: cada uno conserva su propio medio de pago.
    assert.equal(cash.find(row => row.type === 'EXPENSE')?.method, 'TRANSFER', 'el gasto guarda el medio de pago informado')
    assert.equal(cash.find(row => row.type === 'INCOME')?.method, 'CASH', 'el adelanto no hereda el medio de pago del gasto')
    assert.equal(created.body.payments[0].isAdvance, true)
    assert.equal(created.body.payments[0].clientId, client.body.id)
    const tracking = await request('GET', `/tracking/${created.body.trackingToken}`)
    assert.equal(tracking.status, 200)
    for (const field of ['partsCost', 'laborCost', 'laborCharge', 'initialCostMovementId']) assert.equal(field in tracking.body, false, `${field} must stay private`)
    const report = await request('GET', '/reports/overview?period=this_month', undefined, token)
    assert.equal(report.status, 200)
    assert.equal(report.body.finance.estimatedProfit, 30000)
    assert.equal(report.body.finance.collected, 20000)
    assert.equal(report.body.finance.outstanding, 40000)
    assert.equal(report.body.finance.expenses, 30000, 'Caja conserva el egreso completo')
    assert.equal(report.body.finance.expensesAlreadyInRepairCosts, 30000)
    assert.equal(report.body.finance.mostProfitable[0].profit, 30000)

    // A separate expense of the same amount is NOT the linked cost mirror.
    const independent = await prisma.cashMovement.create({ data: { businessId: businesses[0], repairId: created.body.id, origin: 'REPAIR', type: 'EXPENSE', description: 'Gasto independiente', amount: 30000 } })
    assert.equal((await request('GET', '/reports/overview?period=this_month', undefined, token)).body.finance.estimatedProfit, 0)
    await prisma.cashMovement.delete({ where: { id: independent.id } })

    // The existing payment endpoint settles the remainder without changing profit.
    assert.equal((await request('POST', `/repairs/${created.body.id}/payments`, { amount: 40000, method: 'CASH' }, token)).status, 201)
    const settled = (await request('GET', `/repairs/${created.body.id}`, undefined, token)).body
    assert.equal(settled.paid, 60000)
    assert.equal(settled.total - settled.paid, 0)
    assert.equal(settled.payments.length, 2)
    assert.equal(settled.payments.filter((item: any) => item.isAdvance).length, 1)
    assert.equal((await request('GET', `/repairs/${created.body.id}/payments`, undefined, token)).body.length, 2)
    const settledCash = await prisma.cashMovement.findMany({ where: { repairId: created.body.id } })
    assert.equal(settledCash.reduce((sum, row) => sum + (row.type === 'INCOME' ? row.amount : -row.amount), 0), 30000)
    assert.equal((await request('GET', '/reports/overview?period=this_month', undefined, token)).body.finance.estimatedProfit, 30000)
    assert.equal((await request('POST', `/repairs/${created.body.id}/payments`, { amount: 1, method: 'CASH' }, token)).status, 409)

    // Cash and accrual dates may differ; never deduct the same cost in two periods.
    const originalDate = new Date(created.body.createdAt)
    await prisma.repair.update({ where: { id: created.body.id }, data: { createdAt: new Date('2026-01-15T12:00:00Z') } })
    await prisma.cashMovement.update({ where: { id: created.body.initialCostMovementId }, data: { createdAt: new Date('2026-02-15T12:00:00Z') } })
    const january = await request('GET', '/reports/overview?period=custom&from=2026-01-01&to=2026-01-31', undefined, token)
    const february = await request('GET', '/reports/overview?period=custom&from=2026-02-01&to=2026-02-28', undefined, token)
    assert.equal(january.body.finance.estimatedProfit, 30000)
    assert.equal(february.body.finance.expenses, 30000)
    assert.equal(february.body.finance.estimatedProfit, 0)
    await prisma.repair.update({ where: { id: created.body.id }, data: { createdAt: originalDate } })
    await prisma.cashMovement.update({ where: { id: created.body.initialCostMovementId }, data: { createdAt: originalDate } })

    const baseInput = { clientId: client.body.id, deviceBrand: 'Samsung', deviceModel: 'A14', issue: 'Pantalla', partsCost: 30000, partsCostMethod: 'CASH', laborCharge: 30000, total: 60000 }
    const noAdvance = await request('POST', '/repairs', baseInput, token)
    assert.equal(noAdvance.status, 201)
    assert.equal(noAdvance.body.paid, 0)
    assert.equal(noAdvance.body.payments.length, 0)
    assert.equal(noAdvance.body.total - noAdvance.body.paid, 60000)
    assert.equal(await prisma.cashMovement.count({ where: { repairId: noAdvance.body.id, type: 'EXPENSE' } }), 1)
    assert.equal(await prisma.cashMovement.count({ where: { repairId: noAdvance.body.id, type: 'INCOME' } }), 0)
    assert.equal((await request('DELETE', `/repairs/${noAdvance.body.id}`, undefined, token)).status, 409, 'A cost is real financial activity')

    const full = await request('POST', '/repairs', { ...baseInput, advanceAmount: 60000, advanceMethod: 'CARD' }, token)
    assert.equal(full.status, 201)
    assert.equal(full.body.paid, 60000)
    assert.equal(full.body.total - full.body.paid, 0)
    assert.equal(full.body.payments[0].method, 'CARD')
    const free = await request('POST', '/repairs', { ...baseInput, partsCost: 0, laborCharge: 0, total: 0 }, token)
    assert.equal(free.status, 201)
    assert.equal(free.body.paid, 0)
    assert.equal(free.body.initialCostMovementId, null)
    assert.equal(await prisma.cashMovement.count({ where: { repairId: free.body.id } }), 0)
    const onlyAdvance = await request('POST', '/repairs', { ...baseInput, partsCost: 0, total: 30000, advanceAmount: 10000, advanceMethod: 'OTHER' }, token)
    assert.equal(onlyAdvance.status, 201)
    assert.equal(await prisma.cashMovement.count({ where: { repairId: onlyAdvance.body.id } }), 1)
    const discount = await request('POST', '/repairs', { ...baseInput, total: 50000, advanceAmount: 10000, advanceMethod: 'TRANSFER' }, token)
    assert.equal(discount.status, 201)
    assert.equal(discount.body.total - discount.body.partsCost, 20000, 'Editable total is authoritative')

    const snapshot = async () => ({
      repairs: await prisma.repair.count({ where: { businessId: businesses[0] } }),
      payments: await prisma.payment.count({ where: { businessId: businesses[0] } }),
      cash: await prisma.cashMovement.count({ where: { businessId: businesses[0] } }),
      counter: (await prisma.business.findUniqueOrThrow({ where: { id: businesses[0] } })).lastRepairNumber,
    })
    const beforeInvalid = await snapshot()
    for (const invalid of [{ advanceAmount: 60001, advanceMethod: 'CASH' }, { advanceAmount: 1 }, { advanceAmount: 1, advanceMethod: 'INVALID' }, { partsCost: -1 }, { laborCharge: -1 }, { total: -1 }, { advanceAmount: -1 }, { partsCost: .5 }, { total: 2147483648 }, { advanceAmount: 1, advanceMethod: 'CASH', status: 'CANCELLED' }, { partsCost: 30000, partsCostMethod: undefined }, { partsCost: 30000, partsCostMethod: 'INVALID' }]) {
      assert.equal((await request('POST', '/repairs', { ...baseInput, ...invalid }, token)).status, 400, JSON.stringify(invalid))
    }
    assert.deepEqual(await snapshot(), beforeInvalid)

    const other = await request('POST', '/auth/register', validRegistrationPayload({ firstName: 'Otro', lastName: 'QA', email: `costos-${randomUUID()}@example.com`, password: 'CostosQA123!', businessName: 'Otro negocio' }))
    assert.equal(other.status, 201)
    businesses.push(other.body.user.business.id)
    const otherClient = await request('POST', '/clients', { name: 'Cliente otro negocio' }, other.body.token)
    assert.equal(otherClient.status, 201)
    assert.equal((await request('POST', '/repairs', { ...baseInput, clientId: otherClient.body.id, advanceAmount: 10000, advanceMethod: 'CASH' }, token)).status, 404)
    assert.equal((await request('GET', `/repairs/${created.body.id}`, undefined, other.body.token)).status, 404)
    assert.equal((await request('POST', `/repairs/${created.body.id}/payments`, { amount: 1, method: 'CASH' }, other.body.token)).status, 404)
    assert.deepEqual(await snapshot(), beforeInvalid)
    const isolated = await request('GET', '/reports/overview?period=this_month', undefined, other.body.token)
    assert.equal(isolated.body.finance.collected, 0)
    assert.equal(isolated.body.finance.expenses, 0)
    assert.equal(isolated.body.finance.estimatedProfit, 0)

    // Historic laborCost remains a true cost; never reclassify it as laborCharge.
    await prisma.repair.create({ data: { businessId: businesses[1], clientId: otherClient.body.id, number: 9001, deviceBrand: 'Legacy', deviceModel: 'Test', issue: 'Histórico', partsCost: 20000, laborCost: 10000, total: 100000 } })
    await prisma.cashMovement.create({ data: { businessId: businesses[1], type: 'EXPENSE', description: 'Servicio externo', amount: 5000 } })
    assert.equal((await request('GET', '/reports/overview?period=this_month', undefined, other.body.token)).body.finance.estimatedProfit, 65000)

    // Actual PostgreSQL failures after earlier writes prove the whole transaction rolls back.
    for (const type of ['EXPENSE', 'INCOME']) {
      await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ${triggerName}() RETURNS trigger AS $$ BEGIN
        IF NEW."type"::text = '${type}' AND EXISTS (SELECT 1 FROM "Repair" WHERE id = NEW."repairId" AND issue = 'QA forced rollback')
        THEN RAISE EXCEPTION 'QA intentional rollback'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`)
      await prisma.$executeRawUnsafe(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`)
      try {
        const before = await snapshot()
        const failed = await request('POST', '/repairs', { ...baseInput, issue: 'QA forced rollback', advanceAmount: 20000, advanceMethod: 'CASH' }, token)
        assert.equal(failed.status, 500)
        assert.deepEqual(await snapshot(), before, `${type} failure must roll back Repair, Payment, CashMovement and number`)
      } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON "CashMovement"`) }
    }
    const finalReport = await request('GET', '/reports/overview?period=this_month', undefined, token)
    assert.equal(finalReport.body.finance.estimatedProfit, 140000)
    assert.equal(finalReport.body.finance.collected, 140000)
    assert.equal(finalReport.body.finance.outstanding, 120000)
    assert.equal(finalReport.body.finance.expenses, 120000)
    const technician = await prisma.user.create({ data: { businessId: businesses[0], name: 'Técnico sin cobros', email: `tech-${randomUUID()}@example.com`, passwordHash: 'unused', role: 'TECHNICIAN', permissions: ['repairs.create', 'repairs.view'] } })
    const jwt = (await import('jsonwebtoken')).default
    const technicianToken = jwt.sign({ userId: technician.id, businessId: businesses[0], tokenVersion: technician.tokenVersion }, process.env.JWT_SECRET!)
    const beforeDenied = await snapshot()
    for (const amounts of [
      { partsCost: 30000, laborCharge: 0, advanceAmount: 0 },
      { partsCost: 0, laborCharge: 30000, advanceAmount: 0 },
      { partsCost: 0, laborCharge: 0, advanceAmount: 10000, advanceMethod: 'CASH' },
    ]) {
      assert.equal((await request('POST', '/repairs', { ...baseInput, ...amounts }, technicianToken)).status, 403, 'Creation must not bypass financial permission')
    }
    assert.deepEqual(await snapshot(), beforeDenied)
    assert.equal((await request('POST', '/repairs', { ...baseInput, partsCost: 0, laborCharge: 0 }, technicianToken)).status, 201, 'Keep the pre-existing creation flow for technicians')

    // El medio de pago del gasto inicial se guarda tal como se informo y nunca se inventa.
    // Va al final para no alterar los totales de reporte verificados arriba.
    const costMethod = async (input: object) => {
      const response = await request('POST', '/repairs', { clientId: client.body.id, deviceBrand: 'Samsung', deviceModel: 'A14', issue: 'Costo', laborCharge: 30000, total: 60000, ...input }, token)
      return { response, cash: await prisma.cashMovement.findMany({ where: { repairId: response.body.id } }) }
    }
    // Caso 1: gasto en efectivo.
    const cashCost = await costMethod({ partsCost: 30000, partsCostMethod: 'CASH' })
    assert.equal(cashCost.response.status, 201)
    assert.equal(cashCost.cash.find(row => row.type === 'EXPENSE')?.amount, 30000)
    assert.equal(cashCost.cash.find(row => row.type === 'EXPENSE')?.method, 'CASH', 'el gasto guarda el medio de pago informado')
    // Caso 2: gasto por transferencia.
    const transferCost = await costMethod({ partsCost: 30000, partsCostMethod: 'TRANSFER' })
    assert.equal(transferCost.response.status, 201)
    assert.equal(transferCost.cash.find(row => row.type === 'EXPENSE')?.amount, 30000)
    assert.equal(transferCost.cash.find(row => row.type === 'EXPENSE')?.method, 'TRANSFER')
    // Caso 3: costo cargado sin medio de pago se rechaza y no deja rastros.
    const beforeMissingMethod = await snapshot()
    const missingMethod = await request('POST', '/repairs', { clientId: client.body.id, deviceBrand: 'Samsung', deviceModel: 'A14', issue: 'Sin metodo', partsCost: 30000, partsCostMethod: undefined, laborCharge: 30000, total: 60000 }, token)
    assert.equal(missingMethod.status, 400, 'un gasto sin medio de pago no se puede crear')
    assert.deepEqual(await snapshot(), beforeMissingMethod, 'el rechazo no deja movimientos a medias')
    // Caso 4: sin costo no hace falta metodo y no se crea el egreso.
    const freeCost = await costMethod({ partsCost: 0 })
    assert.equal(freeCost.response.status, 201)
    assert.equal(freeCost.response.body.initialCostMovementId, null)
    assert.equal(freeCost.cash.find(row => row.type === 'EXPENSE'), undefined)
    // Un gasto previo sin metodo informado queda en NULL y Caja lo muestra como
    // "Sin medio informado": no se inventa como se pago.
    const legacyCost = await prisma.cashMovement.create({ data: { businessId: businesses[0], repairId: cashCost.response.body.id, origin: 'REPAIR', type: 'EXPENSE', description: 'Gasto historico sin medio', amount: 500 } })
    assert.equal(legacyCost.method, null, 'un gasto historico sin metodo queda intacto')
    await prisma.cashMovement.delete({ where: { id: legacyCost.id } })
    // Caso 5: el metodo del gasto no arrastra al adelanto.
    const splitMethods = await costMethod({ partsCost: 30000, partsCostMethod: 'TRANSFER', advanceAmount: 20000, advanceMethod: 'CASH' })
    assert.equal(splitMethods.response.status, 201)
    assert.equal(splitMethods.cash.find(row => row.type === 'EXPENSE')?.method, 'TRANSFER', 'el gasto conserva su metodo')
    assert.equal(splitMethods.cash.find(row => row.type === 'INCOME')?.method, 'CASH', 'el adelanto conserva el suyo')
    assert.equal(splitMethods.response.body.payments[0].method, 'CASH', 'el pago de adelanto usa su propio metodo')
    console.log('REPAIR CREATION FINANCE PASSED: zero/partial/full advance, editable total, cost payment method saved and independent from the advance, payment history, settlement, cash, validations, rollback, business isolation, legacy costs and report deduplication across periods')
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON "CashMovement"`)
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${triggerName}()`)
    for (const businessId of businesses) {
      await prisma.payment.deleteMany({ where: { businessId } })
      await prisma.repair.deleteMany({ where: { businessId } })
      await prisma.cashMovement.deleteMany({ where: { businessId } })
      await prisma.client.deleteMany({ where: { businessId } })
      await prisma.subscription.deleteMany({ where: { businessId } })
      await prisma.user.deleteMany({ where: { businessId } })
      await prisma.business.deleteMany({ where: { id: businessId } })
    }
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { prisma } from '../src/lib/prisma'

async function main() {
  const url = new URL(process.env.DATABASE_URL!)
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/repair_finance_test', 'Owned local test database only')
  const { app } = await import('../src/server')
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api/equipment-sales`
  const businesses: string[] = []
  const sign = (u: any) => jwt.sign({ userId: u.id, businessId: u.businessId, role: u.role, platformRole: u.platformRole, tokenVersion: u.tokenVersion }, process.env.JWT_SECRET!, { expiresIn: '8h' })
  const tenant = async () => {
    const b = await prisma.business.create({ data: { name: randomUUID() } })
    businesses.push(b.id)
    const now = new Date()
    await prisma.subscription.create({ data: { businessId: b.id, planCode: 'COMPLETE', status: 'ACTIVE', trialStartedAt: now, trialEndsAt: now, trialConsumedAt: now, currentPeriodStart: now, currentPeriodEnd: new Date(Date.now() + 86400000), accessExpiresAt: new Date(Date.now() + 86400000) } })
    const owner = await prisma.user.create({ data: { businessId: b.id, name: 'Owner', email: randomUUID() + '@test.com', passwordHash: 'test', role: 'OWNER' } })
    return { id: b.id, token: sign(owner) }
  }
  const req = async (method: string, path: string, token: string, body?: object) => {
    const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await r.text()
    return { status: r.status, body: text.startsWith('{') ? JSON.parse(text) : text }
  }
  const input = { brand: 'Samsung', model: 'A54', purchasePrice: 10000, repairExpenses: 2000, estimatedSalePrice: 20000 }
  try {
    const a = await tenant(), b = await tenant()
    const create = async (status = 'PURCHASED') => {
      const result = await req('POST', '', a.token, { ...input, status })
      assert.equal(result.status, 201)
      return result.body
    }
    let device = await create()
    const detail = await req('GET', '/' + device.id, a.token)
    assert.equal(detail.status, 200, 'new detail endpoint returns a device and its money history')
    if (process.argv.includes('--red')) return
    assert.equal(detail.body.device.id, device.id)
    assert.equal(detail.body.movements.length, 2)
    assert.deepEqual(Object.keys(detail.body.movements[0]).sort(), ['amount', 'createdAt', 'description', 'id', 'method', 'resaleKind', 'resaleVersion', 'type'].sort())
    assert.equal((await req('GET', '/' + device.id, b.token)).status, 404)
    assert.equal((await req('DELETE', '/' + device.id, b.token, { expectedVersion: 0, confirmed: true })).status, 404)
    const tech = await prisma.user.create({ data: { businessId: a.id, name: 'Tech', email: randomUUID() + '@test.com', passwordHash: 'test', role: 'TECHNICIAN' } })
    const techToken = sign(tech)
    assert.equal((await req('DELETE', '/' + device.id, techToken, { expectedVersion: 0, confirmed: true })).status, 403)
    for (const body of [{}, { expectedVersion: 0 }, { expectedVersion: -1, confirmed: true }, { expectedVersion: 0.5, confirmed: true }, { expectedVersion: 0, confirmed: false }, { expectedVersion: 0, confirmed: true, extra: true }]) {
      assert.equal((await req('DELETE', '/' + device.id, a.token, body)).status, 400)
    }
    assert.equal((await req('DELETE', '/' + device.id, a.token, { expectedVersion: 1, confirmed: true })).status, 409)
    await prisma.user.update({ where: { id: tech.id }, data: { permissions: ['equipmentSales.delete'] } })
    assert.equal((await req('GET', '/' + device.id, techToken)).status, 403)
    assert.equal((await req('DELETE', '/' + device.id, techToken, { expectedVersion: 0, confirmed: true })).status, 200)
    assert.equal(await prisma.cashMovement.count({ where: { resaleDeviceId: device.id } }), 0)
    const baseline = (await req('GET', '/summary', a.token)).body
    const other = await prisma.resaleDevice.create({ data: { businessId: b.id, ...input } })
    const unrelated = await prisma.cashMovement.create({ data: { businessId: a.id, type: 'INCOME', origin: 'GENERAL', amount: 777, description: 'Unrelated' } })
    const client = await prisma.client.create({ data: { businessId: b.id, name: 'Unrelated client' } })
    const repair = await prisma.repair.create({ data: { businessId: b.id, clientId: client.id, number: 1, deviceBrand: 'Apple', deviceModel: 'Unrelated', issue: 'Unrelated repair' } })
    const payment = await prisma.payment.create({ data: { businessId: b.id, repairId: repair.id, clientId: client.id, amount: 123, method: 'CASH' } })
    const product = await prisma.commerceProduct.create({ data: { businessId: a.id, name: 'Unrelated stock', category: 'Accessories', purchaseCost: 100, salePrice: 200, currentStock: 7 } })
    const commerce = await prisma.commerceSale.create({ data: { businessId: a.id, total: 200, costOfGoodsSold: 100, profit: 100, paymentMethod: 'CASH' } })
    await prisma.commerceSaleLine.create({ data: { saleId: commerce.id, productId: product.id, productName: product.name, quantity: 1, unitPrice: 200, unitCost: 100, lineTotal: 200, lineCost: 100, lineProfit: 100 } })
    await prisma.stockItem.create({ data: { businessId: a.id, name: 'Repair stock', category: 'Parts', quantity: 9 } })
    const finances = async () => {
      const paths = ['/cash/movements?period=MONTH', '/cash/movements?period=MONTH&origin=EQUIPMENT', '/dashboard/overview?period=month', '/reports/overview?period=this_month']
      const results = await Promise.all(paths.map(async path => {
        const r = await fetch(`http://127.0.0.1:${address.port}/api${path}`, { headers: { authorization: `Bearer ${a.token}` } })
        assert.equal(r.status, 200, path)
        return r.json() as Promise<any>
      }))
      return { general: results[0].summary, equipment: results[1].summary, equipmentSummary: results[1].equipmentSummary, dashboard: results[2].financial, flow: results[2].charts.cashFlow, report: results[3].finance }
    }
    const financeBaseline = await finances()
    const snapshot = async () => Promise.all([
      prisma.commerceProduct.findMany({ orderBy: { id: 'asc' } }), prisma.commerceSale.findMany({ orderBy: { id: 'asc' } }),
      prisma.repair.findMany({ orderBy: { id: 'asc' } }), prisma.payment.findMany({ orderBy: { id: 'asc' } }),
      prisma.stockItem.findMany({ orderBy: { id: 'asc' } }), prisma.commerceSaleLine.findMany({ orderBy: { id: 'asc' } }),
      prisma.resaleDevice.findUnique({ where: { id: other.id } }), prisma.cashMovement.findUnique({ where: { id: unrelated.id } }),
    ])
    const before = await snapshot()
    for (const state of ['PURCHASED', 'REPAIRING', 'READY_FOR_SALE', 'SOLD']) {
      device = await create(state === 'SOLD' ? 'READY_FOR_SALE' : state)
      for (const cost of [15000, 9000]) {
        const edited = await req('PATCH', '/' + device.id, a.token, { ...input, purchasePrice: cost, repairExpenses: cost / 3, expectedVersion: device.version, status: device.status })
        assert.equal(edited.status, 200)
        device = edited.body
      }
      if (state === 'SOLD') {
        const sale = await req('POST', '/' + device.id + '/sell', a.token, { actualSalePrice: 22000, salePaymentMethod: 'CASH', expectedVersion: device.version })
        assert.equal(sale.status, 200)
        device = sale.body
      }
      const removed = await req('DELETE', '/' + device.id, a.token, { expectedVersion: device.version, confirmed: true })
      assert.deepEqual(removed, { status: 200, body: { success: true } })
      assert.equal(await prisma.resaleDevice.count({ where: { id: device.id } }), 0)
      assert.equal(await prisma.cashMovement.count({ where: { resaleDeviceId: device.id } }), 0)
      assert.deepEqual((await req('GET', '/summary', a.token)).body, baseline)
      assert.deepEqual(await finances(), financeBaseline, 'cash balance, equipment totals, dashboard graphs and reports revert to baseline')
    }
    assert.deepEqual(await snapshot(), before, 'commerce, repairs, payments, other tenant and unrelated money are unchanged')
    const free = await req('POST', '', a.token, { ...input, purchasePrice: 0, repairExpenses: 0 })
    assert.equal(free.status, 201)
    assert.deepEqual((await req('GET', '/' + free.body.id, a.token)).body.movements, [])
    assert.equal((await req('DELETE', '/' + free.body.id, a.token, { expectedVersion: 0, confirmed: true })).status, 200)
    for (const race of ['delete', 'edit', 'sell']) {
      device = await create('READY_FOR_SALE')
      const body = { expectedVersion: device.version, confirmed: true }
      const responses = await Promise.all([
        req('DELETE', '/' + device.id, a.token, body),
        race === 'delete' ? req('DELETE', '/' + device.id, a.token, body) : race === 'edit' ? req('PATCH', '/' + device.id, a.token, { ...input, purchasePrice: 11000, status: 'READY_FOR_SALE', expectedVersion: device.version }) : req('POST', '/' + device.id + '/sell', a.token, { actualSalePrice: 22000, salePaymentMethod: 'CARD', expectedVersion: device.version }),
      ])
      assert.equal(responses.filter(r => r.status === 200).length, 1)
      assert.ok(responses.some(r => [404, 409].includes(r.status)))
      const current = await prisma.resaleDevice.findUnique({ where: { id: device.id } })
      if (current) assert.equal((await req('DELETE', '/' + device.id, a.token, { expectedVersion: current.version, confirmed: true })).status, 200)
      assert.equal(await prisma.cashMovement.count({ where: { resaleDeviceId: device.id } }), 0)
    }
    device = await create()
    const movement = await prisma.cashMovement.findFirstOrThrow({ where: { resaleDeviceId: device.id } })
    for (const data of [{ businessId: b.id }, { origin: 'GENERAL' as const }, { repairId: repair.id }, { commerceSaleId: commerce.id }, { relatedCommerceSaleId: commerce.id }]) {
      await prisma.cashMovement.update({ where: { id: movement.id }, data })
      assert.equal((await req('GET', '/' + device.id, a.token)).status, 409)
      assert.equal((await req('DELETE', '/' + device.id, a.token, { expectedVersion: device.version, confirmed: true })).status, 409)
      assert.equal(await prisma.cashMovement.count({ where: { resaleDeviceId: device.id } }), 2)
      await prisma.cashMovement.update({ where: { id: movement.id }, data: { businessId: a.id, origin: 'EQUIPMENT', repairId: null, commerceSaleId: null, relatedCommerceSaleId: null } })
    }
    const assertShared = async () => {
      const beforeRejection = await snapshot()
      const cashBeforeRejection = await prisma.cashMovement.findMany({ where: { resaleDeviceId: device.id }, orderBy: { id: 'asc' } })
      assert.equal((await req('GET', '/' + device.id, a.token)).status, 409)
      const rejected = await req('DELETE', '/' + device.id, a.token, { expectedVersion: device.version, confirmed: true })
      assert.equal(rejected.status, 409)
      assert.deepEqual(Object.keys(rejected.body), ['message'])
      assert.deepEqual(await snapshot(), beforeRejection)
      assert.deepEqual(await prisma.cashMovement.findMany({ where: { resaleDeviceId: device.id }, orderBy: { id: 'asc' } }), cashBeforeRejection)
      assert.ok(await prisma.resaleDevice.findUnique({ where: { id: device.id } }))
    }
    await prisma.payment.update({ where: { id: payment.id }, data: { cashMovementId: movement.id } })
    await assertShared()
    await prisma.payment.update({ where: { id: payment.id }, data: { cashMovementId: null } })
    await prisma.repair.update({ where: { id: repair.id }, data: { initialCostMovementId: movement.id } })
    await assertShared()
    await prisma.repair.update({ where: { id: repair.id }, data: { initialCostMovementId: null } })
    const ownClient = await prisma.client.create({ data: { businessId: a.id, name: 'Warranty client' } })
    const ownRepair = await prisma.repair.create({ data: { businessId: a.id, clientId: ownClient.id, number: 1, deviceBrand: 'Apple', deviceModel: 'Warranty', issue: 'Warranty repair' } })
    const claim = await prisma.warrantyClaim.create({ data: { businessId: a.id, repairId: ownRepair.id, description: 'Shared warranty fixture' } })
    const expense = await prisma.warrantyClaimExpense.create({ data: { businessId: a.id, claimId: claim.id, cashMovementId: movement.id, idempotencyKey: randomUUID(), concept: 'Shared fixture' } })
    await assertShared()
    await prisma.warrantyClaimExpense.delete({ where: { id: expense.id } })
    const { deleteEquipmentInTransaction } = await import('../src/modules/equipment-sales/equipment-sales.service')
    const rollbackBefore = await prisma.cashMovement.findMany({ where: { resaleDeviceId: device.id }, orderBy: { id: 'asc' } })
    const rollbackDevice = await prisma.resaleDevice.findUniqueOrThrow({ where: { id: device.id } })
    let reachedIntermediateFailure = false
    await assert.rejects(prisma.$transaction(async tx => {
      // Substitute only the final write in this test; every earlier query uses the real DB.
      const failingDeviceDelegate = new Proxy(tx.resaleDevice, { get(target, property, receiver) {
        if (property === 'deleteMany') return async () => {
          assert.equal(await tx.cashMovement.count({ where: { resaleDeviceId: device.id } }), 0, 'cash was deleted inside the transaction before the forced failure')
          assert.deepEqual(await tx.resaleDevice.findUnique({ where: { id: device.id } }), rollbackDevice, 'device deletion has not happened yet')
          reachedIntermediateFailure = true
          throw new Error('forced intermediate rollback')
        }
        return Reflect.get(target, property, receiver)
      } })
      const failingTx = new Proxy(tx, { get(target, property, receiver) {
        return property === 'resaleDevice' ? failingDeviceDelegate : Reflect.get(target, property, receiver)
      } })
      await deleteEquipmentInTransaction(failingTx, a.id, device.id, device.version)
    }), /forced intermediate rollback/)
    assert.equal(reachedIntermediateFailure, true)
    assert.deepEqual(await prisma.cashMovement.findMany({ where: { resaleDeviceId: device.id }, orderBy: { id: 'asc' } }), rollbackBefore)
    assert.deepEqual(await prisma.resaleDevice.findUnique({ where: { id: device.id } }), rollbackDevice)
    await assert.rejects(prisma.$transaction(async tx => { await deleteEquipmentInTransaction(tx, a.id, device.id, device.version); throw new Error('forced rollback') }), /forced rollback/)
    assert.deepEqual(await prisma.cashMovement.findMany({ where: { resaleDeviceId: device.id }, orderBy: { id: 'asc' } }), rollbackBefore)
    assert.ok(await prisma.resaleDevice.findUnique({ where: { id: device.id } }))
    console.log('PASS equipment details/delete: all states, strict confirmation, dedicated permissions, tenant isolation, money erasure, summary baseline, unchanged modules, stale/racing writes, unsafe rows, rollback')
  } finally {
    // Clear references across both tenants first, even when a corruption assertion fails.
    for (const businessId of businesses) {
      await prisma.warrantyClaimExpense.deleteMany({ where: { businessId } })
      await prisma.warrantyClaim.deleteMany({ where: { businessId } })
      await prisma.payment.deleteMany({ where: { businessId } })
      await prisma.repair.deleteMany({ where: { businessId } })
    }
    for (const businessId of businesses) {
      await prisma.cashMovement.deleteMany({ where: { businessId } })
      await prisma.resaleDevice.deleteMany({ where: { businessId } })
      await prisma.commerceSaleLine.deleteMany({ where: { sale: { businessId } } })
      await prisma.commerceSale.deleteMany({ where: { businessId } })
      await prisma.commerceProduct.deleteMany({ where: { businessId } })
      await prisma.stockItem.deleteMany({ where: { businessId } })
      await prisma.client.deleteMany({ where: { businessId } })
      await prisma.subscription.deleteMany({ where: { businessId } })
      await prisma.user.deleteMany({ where: { businessId } })
      await prisma.business.delete({ where: { id: businessId } })
    }
    await prisma.$disconnect()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

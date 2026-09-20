import 'dotenv/config'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'

process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '300'
process.env.RATE_LIMIT_GLOBAL_MAX = '500'

async function main() {
  const url = new URL(process.env.DATABASE_URL!)
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '55439', 'Use only the isolated test PostgreSQL on port 55439')
  const { app } = await import('../src/server')
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const root = `http://127.0.0.1:${address.port}/api`
  const businesses: string[] = []
  const sign = (user: any) => jwt.sign({ userId: user.id, businessId: user.businessId, role: user.role, platformRole: user.platformRole, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET!)
  const request = async (method: string, path: string, token: string, body?: object) => {
    const response = await fetch(root + path, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const text = await response.text()
    return { status: response.status, body: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text }
  }
  const tenant = async () => {
    const business = await prisma.business.create({ data: { name: 'Equipment test ' + randomUUID() } })
    businesses.push(business.id)
    const now = new Date()
    await prisma.subscription.create({ data: { businessId: business.id, planCode: 'INITIAL', status: 'ACTIVE', trialStartedAt: now, trialEndsAt: new Date(now.getTime() - 86_400_000), trialConsumedAt: now, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000), accessExpiresAt: new Date(now.getTime() + 30 * 86_400_000) } })
    const owner = await prisma.user.create({ data: { businessId: business.id, name: 'Owner', email: randomUUID() + '@example.com', passwordHash: 'test', role: 'OWNER' } })
    return { businessId: business.id, token: sign(owner) }
  }
  const input = { brand: 'Samsung', model: 'Galaxy A54', purchasePrice: 100000, repairExpenses: 20000, estimatedSalePrice: 180000 }
  try {
    const a = await tenant(), b = await tenant()
    const created = await request('POST', '/equipment-sales', a.token, input)
    assert.equal(created.status, 201, 'create an individually tracked resale device')
    let device = created.body
    assert.equal(device.status, 'PURCHASED')
    assert.equal(device.totalCost, 120000)
    assert.equal(device.estimatedProfit, 60000)
    const devicePath = '/equipment-sales/' + device.id
    const movements = () => prisma.cashMovement.findMany({ where: { businessId: a.businessId, resaleDeviceId: device.id } })
    let cash = await movements()
    assert.equal(cash.length, 2)
    assert.ok(cash.every(m => m.origin === 'EQUIPMENT' && m.type === 'EXPENSE'))
    assert.equal(cash.find(m => m.resaleKind === 'PURCHASE')?.amount, 100000)
    assert.equal(cash.find(m => m.resaleKind === 'REPAIR')?.amount, 20000)
    assert.equal((await request('PATCH', devicePath, b.token, { ...input, expectedVersion: device.version, status: 'REPAIRING' })).status, 404)
    assert.equal((await request('GET', '/equipment-sales', b.token)).body.total, 0)
    assert.equal((await request('GET', '/equipment-sales/summary', b.token)).body.totalInvested, 0)

    const edit = async (changes: object, expectedVersion = device.version) => request('PATCH', devicePath, a.token, { ...input, purchasePrice: device.purchasePrice, repairExpenses: device.repairExpenses, status: device.status, ...changes, expectedVersion })
    let result = await edit({ repairExpenses: 35000, status: 'REPAIRING' })
    assert.equal(result.status, 200)
    device = result.body
    cash = await movements()
    assert.equal(cash.length, 3)
    assert.equal(cash.find(m => m.resaleKind === 'REPAIR_ADJUSTMENT')?.amount, 15000)
    result = await edit({})
    assert.equal(result.status, 200)
    device = result.body
    assert.equal((await movements()).length, 3, 'unchanged values do not write cash movements')
    result = await edit({ repairExpenses: 10000, purchasePrice: 90000 })
    assert.equal(result.status, 200)
    device = result.body
    cash = await movements()
    assert.equal(cash.length, 5)
    assert.ok(cash.some(m => m.resaleKind === 'REPAIR_ADJUSTMENT' && m.type === 'INCOME' && m.amount === 25000))
    assert.ok(cash.some(m => m.resaleKind === 'PURCHASE_ADJUSTMENT' && m.type === 'INCOME' && m.amount === 10000))
    assert.equal(cash.reduce((sum, m) => sum + (m.type === 'EXPENSE' ? m.amount : -m.amount), 0), 100000)
    assert.equal(cash.find(m => m.resaleKind === 'PURCHASE')?.amount, 100000, 'original purchase is preserved')
    let summary = (await request('GET', '/equipment-sales/summary', a.token)).body
    assert.equal(summary.totalInvested, 100000)
    assert.equal(summary.purchaseInvestment, 90000)
    assert.equal(summary.repairInvestment, 10000)
    assert.equal(summary.inProcess, 1)
    assert.equal(summary.realizedProfit, 0, 'compensations are not sales profit')
    for (const changes of [{ purchasePrice: -1 }, { repairExpenses: 1.5 }, { estimatedSalePrice: -1 }, { purchasePrice: 2147483647, repairExpenses: 1 }, { status: 'SOLD' }]) {
      assert.equal((await edit(changes)).status, 400)
    }
    assert.equal((await request('PATCH', devicePath, a.token, input)).status, 400, 'version is required')
    assert.equal((await edit({}, 0)).status, 409, 'stale form conflicts')
    const saleInput = { actualSalePrice: 170000, salePaymentMethod: 'CARD', soldAt: new Date().toISOString(), expectedVersion: device.version }
    assert.equal((await request('POST', devicePath + '/sell', a.token, saleInput)).status, 409, 'only ready devices can be sold')
    result = await edit({ status: 'READY_FOR_SALE' })
    assert.equal(result.status, 200)
    device = result.body
    assert.equal((await request('POST', devicePath + '/sell', b.token, { ...saleInput, expectedVersion: device.version })).status, 404)
    const technician = await prisma.user.create({ data: { businessId: a.businessId, name: 'Tech', email: randomUUID() + '@example.com', passwordHash: 'test', role: 'TECHNICIAN' } })
    const techToken = sign(technician)
    for (const [method, path] of [['GET', '/equipment-sales'], ['GET', '/equipment-sales/summary'], ['POST', '/equipment-sales'], ['PATCH', devicePath], ['POST', devicePath + '/sell']]) {
      assert.equal((await request(method, path, techToken, method === 'GET' ? undefined : input)).status, 403, 'legacy technicians receive no equipment permissions')
    }
    await prisma.user.update({ where: { id: technician.id }, data: { permissions: ['equipmentSales.view'] } })
    assert.equal((await request('GET', '/equipment-sales', techToken)).status, 200)
    assert.equal((await request('PATCH', devicePath, techToken, { ...input, expectedVersion: device.version })).status, 403)
    assert.equal((await request('POST', devicePath + '/sell', techToken, { ...saleInput, expectedVersion: device.version })).status, 403)
    await prisma.user.update({ where: { id: technician.id }, data: { permissions: ['equipmentSales.view', 'equipmentSales.sell'] } })
    const beforeSale = device.version
    const concurrentSales = await Promise.all([a.token, techToken].map(token => request('POST', devicePath + '/sell', token, { ...saleInput, expectedVersion: beforeSale })))
    assert.deepEqual(concurrentSales.map(r => r.status).sort(), [200, 409], 'two sellers produce one sale')
    device = concurrentSales.find(r => r.status === 200)!.body
    assert.equal(device.status, 'SOLD')
    assert.equal(device.saleCostBasis, 100000)
    assert.equal(device.realizedProfit, 70000)
    assert.equal(device.actualSalePrice, 170000)
    assert.equal(device.salePaymentMethod, 'CARD')
    assert.equal(device.soldAt, saleInput.soldAt)
    assert.equal((await movements()).filter(m => m.resaleKind === 'SALE').length, 1)
    assert.equal((await movements()).find(m => m.resaleKind === 'SALE')?.amount, 170000)
    assert.equal((await edit({ status: 'PURCHASED' }, beforeSale)).status, 409)
    assert.equal((await edit({ status: 'PURCHASED' })).status, 409, 'sold records are immutable even with current version')
    assert.equal((await request('POST', devicePath + '/sell', a.token, { ...saleInput, expectedVersion: device.version })).status, 409)
    assert.equal((await movements()).length, 6)
    summary = (await request('GET', '/equipment-sales/summary', a.token)).body
    assert.equal(summary.salesCount, 1)
    assert.equal(summary.realizedProfit, 70000)
    assert.equal(summary.inProcess, 0)
    assert.equal(summary.totalInvested, 100000)
    const general = await request('GET', '/cash/movements?pageSize=100', a.token)
    const equipment = await request('GET', '/cash/movements?origin=EQUIPMENT&pageSize=100', a.token)
    const repairs = await request('GET', '/cash/movements?origin=REPAIR&pageSize=100', a.token)
    assert.equal(general.body.total, 6)
    assert.equal(equipment.body.total, 6)
    assert.equal(equipment.body.summary.balanceToday, 70000)
    assert.equal(equipment.body.equipmentSummary.salesCount, 1)
    assert.equal(equipment.body.equipmentSummary.purchaseInvestment, 90000)
    assert.equal(equipment.body.equipmentSummary.repairInvestment, 10000)
    assert.equal(equipment.body.equipmentSummary.realizedProfit, 70000)
    assert.equal(general.body.equipmentSummary, undefined)
    await prisma.user.update({ where: { id: technician.id }, data: { permissions: ['cash.view'] } })
    assert.equal((await request('GET', '/equipment-sales/summary', techToken)).status, 403)
    assert.equal((await request('GET', '/cash/movements?origin=EQUIPMENT', techToken)).body.equipmentSummary.salesCount, 1)
    assert.equal(repairs.body.total, 0)
    assert.ok(equipment.body.items.every((m: any) => m.resaleDeviceId === device.id))

    // Concurrent edits and edit-vs-sale must also have a single winner and atomic cash.
    const raceDevice = (await request('POST', '/equipment-sales', a.token, { ...input, repairExpenses: 0 })).body
    const racePath = '/equipment-sales/' + raceDevice.id
    const race = await Promise.all([15000, 25000].map(repairExpenses => request('PATCH', racePath, a.token, { ...input, repairExpenses, status: 'READY_FOR_SALE', expectedVersion: raceDevice.version })))
    assert.deepEqual(race.map(r => r.status).sort(), [200, 409])
    const winner = race.find(r => r.status === 200)!.body
    assert.equal(await prisma.cashMovement.count({ where: { resaleDeviceId: winner.id } }), 2)
    const competing = await Promise.all([
      request('PATCH', racePath, a.token, { ...input, repairExpenses: 30000, status: 'READY_FOR_SALE', expectedVersion: winner.version }),
      request('POST', racePath + '/sell', a.token, { actualSalePrice: saleInput.actualSalePrice, salePaymentMethod: saleInput.salePaymentMethod, expectedVersion: winner.version }),
    ])
    assert.deepEqual(competing.map(r => r.status).sort(), [200, 409])
    const current = competing.find(r => r.status === 200)!.body
    const raceCash = await prisma.cashMovement.findMany({ where: { resaleDeviceId: winner.id } })
    assert.equal(raceCash.length, 3)
    const netCost = raceCash.filter(m => m.resaleKind !== 'SALE').reduce((sum, m) => sum + (m.type === 'EXPENSE' ? m.amount : -m.amount), 0)
    assert.equal(netCost, current.totalCost)

    for (let i = 0; i < 3; i++) assert.equal((await request('POST', '/equipment-sales', a.token, { ...input, brand: 'Motorola', model: 'Edge ' + i, purchasePrice: 0, repairExpenses: 0 })).status, 201)
    const page1 = (await request('GET', '/equipment-sales?search=mOtOrOlA&pageSize=2', a.token)).body
    const page2 = (await request('GET', '/equipment-sales?search=MOTOROLA&pageSize=2&page=2', a.token)).body
    assert.equal(page1.total, 3)
    assert.equal(page1.items.length, 2)
    assert.equal(page2.items.length, 1)
    assert.equal(new Set([...page1.items, ...page2.items].map(d => d.id)).size, 3)
    assert.equal((await request('GET', '/equipment-sales?search=eDgE%201', a.token)).body.total, 1)
    assert.equal((await request('GET', '/equipment-sales?search=missing', a.token)).body.total, 0)
    assert.equal((await request('GET', '/equipment-sales?search=Motorola&status=SOLD', a.token)).body.total, 0)
    assert.equal((await request('GET', '/equipment-sales?status=PURCHASED', a.token)).body.total, 3)
    for (const query of ['page=0', 'pageSize=101', 'status=INVALID']) assert.equal((await request('GET', '/equipment-sales?' + query, a.token)).status, 400)
    console.log('EQUIPMENT SALES PASSED: creation, cash adjustments, calculations, pagination/search, isolation, explicit permissions, sale snapshots, double-sale and edit races, general/repair cash separation')
  } finally {
    for (const businessId of businesses) {
      await prisma.cashMovement.deleteMany({ where: { businessId } })
      if ('resaleDevice' in prisma) await (prisma as any).resaleDevice.deleteMany({ where: { businessId } })
      await prisma.subscription.deleteMany({ where: { businessId } })
      await prisma.user.deleteMany({ where: { businessId } })
      await prisma.business.delete({ where: { id: businessId } })
    }
    await prisma.$disconnect()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

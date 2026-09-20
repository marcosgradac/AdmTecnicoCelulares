import 'dotenv/config'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import jwt from 'jsonwebtoken'

async function main() {
  const url = new URL(process.env.DATABASE_URL!)
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '55439', 'Only isolated PostgreSQL on port 55439')
  const db = new PrismaClient()
  const dependency = require.resolve('../src/lib/prisma')
  require(dependency)
  require.cache[dependency]!.exports = { prisma: db }
  const { dashboardOverview } = require('../src/modules/dashboard/dashboard.service') as typeof import('../src/modules/dashboard/dashboard.service')
  const { dashboardPeriod } = require('../src/modules/dashboard/dashboard-period') as typeof import('../src/modules/dashboard/dashboard-period')
  const now = new Date('2026-09-20T15:43:07.123Z')
  assert.equal(dashboardPeriod('today', now).start.toISOString(), '2026-09-20T03:00:00.000Z')
  assert.equal(dashboardPeriod('7d', now).start.toISOString(), '2026-09-14T03:00:00.000Z')
  assert.equal(dashboardPeriod('30d', now).start.toISOString(), '2026-08-22T03:00:00.000Z')
  assert.equal(dashboardPeriod('month', now).start.toISOString(), '2026-09-01T03:00:00.000Z')
  assert.equal(dashboardPeriod('month', new Date('2026-03-01T02:00:00Z')).start.toISOString(), '2026-02-01T03:00:00.000Z')
  const businesses: string[] = []
  const tenant = async () => {
    const business = await db.business.create({ data: { name: 'Dashboard test' } })
    businesses.push(business.id)
    const clock = new Date()
    await db.subscription.create({ data: { businessId: business.id, planCode: 'COMPLETE', status: 'ACTIVE', trialStartedAt: new Date(0), trialEndsAt: new Date(1), trialConsumedAt: new Date(0), currentPeriodStart: clock, currentPeriodEnd: new Date(clock.getTime() + 86400000 * 30) } })
    return business.id
  }
  let server: import('node:http').Server | undefined
  try {
    const a = await tenant(), b = await tenant()
    const client = await db.client.create({ data: { businessId: a, name: 'Cliente real' } })
    const repair = await db.repair.create({ data: { businessId: a, clientId: client.id, number: 1, deviceBrand: 'Xiaomi', deviceModel: 'Note 8', issue: 'Pantalla', status: 'READY', total: 1000, paid: 200, createdAt: new Date('2026-08-01T03:00:00Z'), estimatedDeliveryDate: new Date('2026-09-19T03:00:00Z') } })
    await db.repair.create({ data: { businessId: a, clientId: client.id, number: 2, deviceBrand: 'Moto', deviceModel: 'G', issue: 'Carga', status: 'DELIVERED', total: 100, paid: 120, createdAt: now } })
    await db.repair.create({ data: { businessId: a, clientId: client.id, number: 3, deviceBrand: 'Samsung', deviceModel: 'A', issue: 'Carga', status: 'REPAIRING', total: 500, paid: 500, createdAt: now, estimatedDeliveryDate: new Date('2026-09-19T03:00:00Z') } })
    const cash = async (businessId: string, amount: number, time: string, type: 'INCOME' | 'EXPENSE' = 'INCOME', origin: 'GENERAL' | 'REPAIR' | 'COMMERCE' | 'EQUIPMENT' = 'GENERAL') => db.cashMovement.create({ data: { businessId, description: 'Movimiento real', amount, type, origin, createdAt: new Date(time) } })
    await cash(a, 900, '2026-09-20T02:59:59.999Z')
    await cash(a, 200, '2026-09-20T03:00:00.000Z', 'INCOME', 'REPAIR')
    await cash(a, 80, '2026-09-20T04:00:00.000Z', 'EXPENSE')
    await cash(a, 99999, '2026-09-21T03:00:00.000Z')
    await cash(b, 88888, '2026-09-20T04:00:00.000Z')
    const commerceSale = await db.commerceSale.create({ data: { businessId: a, total: 300, costOfGoodsSold: 100, profit: 200, paymentMethod: 'CASH', createdAt: now } })
    await db.cashMovement.create({ data: { businessId: a, amount: 300, type: 'INCOME', origin: 'COMMERCE', description: 'Venta Comercio', commerceSaleId: commerceSale.id, createdAt: now } })
    const equipment = await db.resaleDevice.create({ data: { businessId: a, brand: 'Apple', model: '12', purchasePrice: 400, repairExpenses: 100, estimatedSalePrice: 800, actualSalePrice: 700, saleCostBasis: 500, status: 'SOLD', soldAt: new Date('2026-09-15T12:00:00Z') } })
    await db.cashMovement.create({ data: { businessId: a, amount: 700, type: 'INCOME', origin: 'EQUIPMENT', description: 'Equipo vendido', resaleDeviceId: equipment.id, resaleKind: 'SALE', resaleVersion: 1, createdAt: now } })
    await cash(a, 50, '2026-09-20T05:00:00Z', 'INCOME', 'EQUIPMENT') // adjustment is cash, not a sale
    const today = await dashboardOverview(a, 'today', now)
    assert.equal(today.financial.income, 1250)
    assert.equal(today.financial.expense, 80)
    assert.equal(today.financial.balance, 1170)
    assert.equal(today.current.activeRepairs, 2)
    assert.equal(today.current.readyRepairs, 1)
    assert.equal(today.current.pending, 800, 'overpayment must not reduce another repair balance')
    assert.equal(today.charts!.cashFlow.reduce((n, point) => n + point.income, 0), today.financial.income)
    assert.equal(today.charts!.incomeByArea.reduce((n, point) => n + point.value, 0), today.financial.income)
    assert.equal(today.modules.commerce!.sales, 1)
    assert.equal(today.modules.equipment.sales, 1)
    assert.equal(today.modules.equipment.profit, 200)
    assert.ok(today.attention.find(group => group.key === 'ready')!.items.some(item => item.href.endsWith(repair.id)))
    assert.equal(today.attention.find(group => group.key === 'delayed')!.count, 1, 'ready devices do not count as delayed work')
    assert.ok(today.activity.length <= 6)
    const week = await dashboardOverview(a, '7d', now)
    assert.equal(week.financial.income, 2150)
    assert.equal(week.charts!.cashFlow.length, 7)
    assert.deepEqual(week.current, today.current, 'operational snapshot is independent of period')
    for (const period of ['30d', 'month'] as const) {
      const result = await dashboardOverview(a, period, now)
      assert.equal(result.financial.income, 2150)
      assert.equal(result.charts!.cashFlow.reduce((sum, row) => sum + row.income, 0), result.financial.income)
      assert.equal(result.charts!.cashFlow.length, period === '30d' ? 30 : 20)
    }
    const empty = await dashboardOverview(b, 'month', new Date('2026-08-20T12:00:00Z'))
    assert.equal(empty.financial.income, 0)
    assert.equal(empty.current.pending, 0)
    assert.equal(empty.modules.commerce!.sales, 0)
    assert.equal(empty.activity.length, 0)
    const dueToday = await db.repair.create({ data: { businessId: a, clientId: client.id, number: 4, deviceBrand: 'Moto', deviceModel: 'Hoy', issue: 'Carga', status: 'REPAIRING', estimatedDeliveryDate: new Date('2026-09-20') } })
    const dueYesterday = await db.repair.create({ data: { businessId: a, clientId: client.id, number: 5, deviceBrand: 'Moto', deviceModel: 'Ayer', issue: 'Carga', status: 'REPAIRING', estimatedDeliveryDate: new Date('2026-09-19') } })
    const delayed = (await dashboardOverview(a, 'today', now)).attention.find(group => group.key === 'delayed')!
    assert.equal(delayed.count, 2)
    assert.ok(delayed.items.some(item => item.id === dueYesterday.id))
    assert.ok(!delayed.items.some(item => item.id === dueToday.id), 'date-only delivery due today is not overdue in Argentina')
    await db.repair.update({ where: { id: repair.id }, data: { warrantyEnabled: true, warrantyStartedAt: now, warrantyExpiresAt: new Date(now.getTime() + 86400000) } })
    assert.equal((await dashboardOverview(a, 'today', now)).attention.find(group => group.key === 'warranty')!.count, 1)
    await db.repair.update({ where: { id: repair.id }, data: { warrantyDeletedAt: now } })
    assert.ok(!(await dashboardOverview(a, 'today', now)).attention.some(group => group.key === 'warranty'), 'deleted warranties are not actionable')
    for (let index = 0; index < 8; index++) {
      await db.repair.create({ data: { businessId: a, clientId: client.id, number: index + 10, deviceBrand: 'Moto', deviceModel: 'G', issue: 'Carga', status: 'READY' } })
      await cash(a, 1, now.toISOString())
    }
    const bounded = await dashboardOverview(a, 'today', now)
    assert.equal(bounded.activity.length, 6)
    assert.equal(bounded.attention.find(group => group.key === 'ready')!.count, 9)
    assert.equal(bounded.attention.find(group => group.key === 'ready')!.items.length, 3)
    for (const code of ['INITIAL', 'PROFESSIONAL'] as const) {
      await db.subscription.update({ where: { businessId: a }, data: { planCode: code } })
      const limited = await dashboardOverview(a, 'today', now)
      assert.equal(limited.modules.commerce, null)
      assert.equal(limited.charts !== null, code === 'PROFESSIONAL')
      assert.ok(limited.activity.every(item => item.href !== '/admin/comercio'))
    }
    await db.subscription.update({ where: { businessId: a }, data: { planCode: 'INITIAL', status: 'TRIALING', trialEndsAt: new Date(Date.now() + 86400000) } })
    assert.ok((await dashboardOverview(a, 'today', now)).modules.commerce, 'trial keeps COMPLETE entitlements')
    process.env.NODE_ENV = 'test'
    const { app } = await import('../src/server')
    server = app.listen(0)
    await new Promise<void>(resolve => server!.once('listening', resolve))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const owner = await db.user.create({ data: { businessId: a, name: 'Owner', email: a + '@example.com', passwordHash: 'test', role: 'OWNER' } })
    const tech = await db.user.create({ data: { businessId: b, name: 'Tech', email: b + '@example.com', passwordHash: 'test', role: 'TECHNICIAN' } })
    const get = (path: string, user?: typeof owner) => fetch(`http://127.0.0.1:${address.port}/api/dashboard/overview${path}`, { headers: user ? { authorization: 'Bearer ' + jwt.sign({ userId: user.id, businessId: user.businessId, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET!) } : {} })
    assert.equal((await get('', owner)).status, 200)
    const tampered = await get('?businessId=' + b, owner)
    assert.equal((await tampered.json()).current.pending, 800, 'tenant always comes from authenticated user')
    assert.equal((await get('?period=invalid', owner)).status, 400)
    assert.equal((await get('', tech)).status, 403)
    assert.equal((await get('')).status, 401)
    console.log(`DASHBOARD PASSED (PostgreSQL): periods, AR midnight, totals/buckets, isolation, snapshot, balances, sale adjustments, effective dates, bounded lists, plans/trial, HTTP access`)
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
    for (const businessId of businesses) {
      await db.cashMovement.deleteMany({ where: { businessId } })
      await db.commerceSale.deleteMany({ where: { businessId } })
      await db.resaleDevice.deleteMany({ where: { businessId } })
      await db.repair.deleteMany({ where: { businessId } })
      await db.client.deleteMany({ where: { businessId } })
      await db.user.deleteMany({ where: { businessId } })
      await db.subscription.deleteMany({ where: { businessId } })
      await db.business.delete({ where: { id: businessId } })
    }
    await db.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

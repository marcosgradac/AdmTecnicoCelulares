import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { dashboardPeriod } from '../src/modules/dashboard/dashboard-period'
import { getArgentinaCalendarDayBounds } from '../src/lib/argentina-day'

// Validate before loading any Prisma client or server module.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['postgres:', 'postgresql:'].includes(database.protocol))
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname))
assert.ok(database.pathname.endsWith('_test') && database.pathname !== '/tecnodesk_visual_test')

async function main() {
  const now = new Date('2026-10-01T02:30:00.000Z')
  const month = dashboardPeriod('month', now)
  assert.equal(month.start.toISOString(), '2026-09-01T03:00:00.000Z')
  assert.equal(month.end.getTime(), now.getTime() + 1)
  assert.equal(month.timeZone, 'America/Argentina/Buenos_Aires')
  assert.equal(month.buckets.length, 30)
  assert.equal(month.buckets[29].label, '30/09')
  assert.equal(month.buckets[29].end.getTime(), now.getTime() + 1)
  for (const [period, count] of [['7d', 7], ['30d', 30]] as const) {
    assert.equal(dashboardPeriod(period, now).buckets.length, count)
  }
  const october = dashboardPeriod('month', new Date('2026-10-01T03:30:00Z'))
  assert.equal(october.start.toISOString(), '2026-10-01T03:00:00.000Z')
  assert.equal(october.buckets.length, 1)
  // Historical offset change: daily buckets follow civil dates, not 24-hour steps.
  const historical = dashboardPeriod('7d', new Date('2009-03-17T15:00:00Z'))
  assert.equal(historical.buckets.length, 7)
  assert.ok(historical.buckets.some(bucket => bucket.end.getTime() - bucket.start.getTime() === 25 * 3600000))

  const { prisma } = await import('../src/lib/prisma')
  const { getCommerceSummary, getCommerceSummaryRange } = await import('../src/modules/commerce/commerce.service')
  const range = getCommerceSummaryRange(now)
  assert.equal(range.from.toISOString(), '2026-09-01T03:00:00.000Z')
  assert.equal(range.to.getTime(), now.getTime())
  const business = await prisma.business.create({ data: { name: 'Timezone ' + randomUUID() } })
  try {
    const dates = ['2026-09-01T02:59:59.999Z', '2026-09-01T03:00:00.000Z', '2026-10-01T02:29:59.999Z', now.toISOString(), '2026-10-01T02:30:00.001Z']
    for (const [index, date] of dates.entries()) {
      const amount = (index + 1) * 100
      await prisma.commerceSale.create({ data: { businessId: business.id, total: amount, costOfGoodsSold: amount / 2, profit: amount / 2, paymentMethod: 'CASH', createdAt: new Date(date) } })
      await prisma.cashMovement.create({ data: { businessId: business.id, origin: 'COMMERCE', type: 'EXPENSE', amount: amount / 10, description: 'Boundary', createdAt: new Date(date) } })
    }
    assert.deepEqual(await getCommerceSummary(business.id, range), { sales: 2, revenue: 500, costOfGoodsSold: 250, profit: 250, commercialExpenses: 50, netProfit: 200, products: 0 })
    const owner = await prisma.user.create({ data: { businessId: business.id, name: 'Timezone owner', email: randomUUID() + '@local.test', passwordHash: 'unused', role: 'OWNER' } })
    const jwt = (await import('jsonwebtoken')).default
    process.env.NODE_ENV = 'test'
    const { app } = await import('../src/server')
    const server = app.listen(0)
    await new Promise<void>(resolve => server.once('listening', resolve))
    try {
      const address = server.address()
      assert.ok(address && typeof address === 'object')
      const token = jwt.sign({ userId: owner.id, businessId: business.id, tokenVersion: owner.tokenVersion }, process.env.JWT_SECRET!)
      const threshold = getArgentinaCalendarDayBounds(1900, 1, 1).start
      const sell = async (soldAt: string) => fetch(`http://127.0.0.1:${address.port}/api/equipment-sales/missing/sell`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ expectedVersion: 0, actualSalePrice: 100, salePaymentMethod: 'CASH', soldAt }) })
      assert.equal((await sell(new Date(threshold.getTime() - 1).toISOString())).status, 400, '1899 in Argentina is rejected even if UTC is already 1900')
      assert.equal((await sell(threshold.toISOString())).status, 404, '1900 in Argentina passes date validation and reaches device lookup')
      assert.equal((await sell('1900-01-01T12:00:00')).status, 400, 'offset remains mandatory')
      assert.equal((await sell(new Date(Date.now() + 60000).toISOString())).status, 400, 'future timestamps remain invalid')
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
    console.log('TIMEZONE CLEANUP PASSED: month boundaries, civil buckets, commerce B+C only; revenue=500, expenses=50, netProfit=200')
  } finally {
    await prisma.cashMovement.deleteMany({ where: { businessId: business.id } })
    await prisma.commerceSale.deleteMany({ where: { businessId: business.id } })
    await prisma.user.deleteMany({ where: { businessId: business.id } })
    await prisma.subscription.deleteMany({ where: { businessId: business.id } })
    await prisma.business.delete({ where: { id: business.id } })
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

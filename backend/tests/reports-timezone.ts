import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getArgentinaDayBounds, getArgentinaMonthBounds } from '../src/lib/argentina-day'
import { cashPeriodRange } from '../src/modules/cash/cash-period'
import { dashboardPeriod } from '../src/modules/dashboard/dashboard-period'

// Guard before importing reports (which imports Prisma), server or any database client.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['postgres:', 'postgresql:'].includes(database.protocol), 'Use PostgreSQL for this test')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Use a local test database')
assert.ok(database.pathname.endsWith('_test'), 'Use an isolated database ending in _test')
assert.notEqual(decodeURIComponent(database.pathname), '/tecnodesk_visual_test')
process.env.NODE_ENV = 'test'

const NativeDate = globalThis.Date
const fixedNow = new NativeDate('2026-10-06T02:30:00.000Z')
const installClock = () => {
  class FixedDate extends NativeDate {
    constructor(...args: any[]) { super(...(args.length ? args : [fixedNow.getTime()])) }
    static now() { return fixedNow.getTime() }
  }
  globalThis.Date = FixedDate as DateConstructor
  return () => { globalThis.Date = NativeDate }
}

async function main() {
  const { resolveReportPeriod, getReportsOverview } = await import('../src/modules/reports/reports.service')
  const check = (input: Parameters<typeof resolveReportPeriod>[0], now: Date, start: string, end: string) => {
    const period = resolveReportPeriod(input, now)
    assert.equal(period.from.toISOString(), start, `${input.period}: start`)
    assert.equal(period.toExclusive.toISOString(), end, `${input.period}: end exclusive`)
    assert.equal(period.to.getTime(), period.toExclusive.getTime() - 1)
    assert.equal(period.timezone, 'America/Argentina/Buenos_Aires')
    return period
  }
  const today = check({ period: 'today' }, fixedNow, '2026-10-05T03:00:00.000Z', '2026-10-06T03:00:00.000Z')
  check({ period: 'last_7_days' }, fixedNow, '2026-09-29T03:00:00.000Z', '2026-10-06T03:00:00.000Z')
  const monthNow = new NativeDate('2026-10-01T02:30:00.000Z')
  const month = check({ period: 'this_month' }, monthNow, '2026-09-01T03:00:00.000Z', '2026-10-01T03:00:00.000Z')
  check({ period: 'previous_month' }, monthNow, '2026-08-01T03:00:00.000Z', '2026-09-01T03:00:00.000Z')
  check({ period: 'last_3_months' }, monthNow, '2026-07-01T03:00:00.000Z', '2026-10-01T03:00:00.000Z')
  check({ period: 'this_year' }, monthNow, '2026-01-01T03:00:00.000Z', '2027-01-01T03:00:00.000Z')
  check({ period: 'this_year' }, new NativeDate('2027-01-01T02:30:00Z'), '2026-01-01T03:00:00.000Z', '2027-01-01T03:00:00.000Z')
  check({ period: 'previous_month' }, new NativeDate('2026-01-15T12:00:00Z'), '2025-12-01T03:00:00.000Z', '2026-01-01T03:00:00.000Z')
  check({ period: 'custom', from: '2026-10-05', to: '2026-10-05' }, fixedNow, '2026-10-05T03:00:00.000Z', '2026-10-06T03:00:00.000Z')
  check({ period: 'custom', from: '2024-02-29', to: '2024-02-29' }, fixedNow, '2024-02-29T03:00:00.000Z', '2024-03-01T03:00:00.000Z')
  check({ period: 'custom', from: '2024-01-01', to: '2024-12-31' }, fixedNow, '2024-01-01T03:00:00.000Z', '2025-01-01T03:00:00.000Z')
  // 366 fechas civiles, aunque el cambio histórico de horario agrega una hora UTC.
  check({ period: 'custom', from: '2008-03-15', to: '2009-03-15' }, fixedNow, '2008-03-15T02:00:00.000Z', '2009-03-16T03:00:00.000Z')
  check({ period: 'custom', from: '0099-10-05', to: '0099-10-05' }, fixedNow, '0099-10-05T03:53:48.000Z', '0099-10-06T03:53:48.000Z')
  check({ period: 'custom', from: '0000-10-05', to: '0000-10-05' }, fixedNow, '0000-10-05T03:53:48.000Z', '0000-10-06T03:53:48.000Z')
  for (const [from, to] of [
    ['2026-02-31', '2026-03-01'], ['2026-13-01', '2026-13-01'], ['2026-00-10', '2026-01-10'],
    ['2025-02-29', '2025-03-01'], ['2026-10-06', '2026-10-05'], ['2024-01-01', '2025-01-01'],
  ]) assert.throws(() => resolveReportPeriod({ period: 'custom', from, to }, fixedNow), /INVALID_PERIOD/)
  assert.equal(today.from.getTime(), getArgentinaDayBounds(fixedNow).start.getTime())
  assert.equal(today.from.getTime(), cashPeriodRange('TODAY', fixedNow).start.getTime())
  assert.equal(today.from.getTime(), dashboardPeriod('today', fixedNow).start.getTime())
  assert.equal(month.from.getTime(), getArgentinaMonthBounds(monthNow).start.getTime())
  assert.equal(month.from.getTime(), cashPeriodRange('MONTH', monthNow).start.getTime())
  assert.equal(month.from.getTime(), dashboardPeriod('month', monthNow).start.getTime())
  console.log('PURE PERIODS PASSED: all presets, custom validation, leap year and Dashboard/Cash coherence')

  const { prisma } = await import('../src/lib/prisma')
  let businessId: string | undefined
  const restoreClock = installClock()
  try {
    const business = await prisma.business.create({ data: { name: `Reports timezone ${randomUUID()}` } })
    businessId = business.id
    const instants = ['2026-10-05T02:59:59.999Z', '2026-10-05T03:00:00.000Z', '2026-10-06T02:30:00.000Z', '2026-10-06T03:00:00.000Z']
    for (const [i, instant] of instants.entries()) {
      const createdAt = new NativeDate(instant)
      const amount = [1, 10, 100, 1000][i]
      const client = await prisma.client.create({ data: { businessId, name: `Boundary ${i}`, createdAt } })
      const repair = await prisma.repair.create({ data: {
        businessId, clientId: client.id, number: i + 1, deviceBrand: 'QA', deviceModel: 'Timezone', issue: 'Boundary',
        status: 'DELIVERED', total: amount, paid: amount, createdAt, deliveredAt: createdAt,
      } })
      await prisma.payment.create({ data: { businessId, clientId: client.id, repairId: repair.id, amount, method: 'CASH', createdAt } })
      await prisma.cashMovement.create({ data: { businessId, type: 'EXPENSE', description: `Boundary ${i}`, amount, createdAt } })
    }
    const overview = await getReportsOverview(businessId, { period: 'today' })
    assert.equal(overview.period.from, '2026-10-05T03:00:00.000Z')
    assert.equal(overview.period.to, '2026-10-06T02:59:59.999Z')
    assert.equal(overview.period.timezone, 'America/Argentina/Buenos_Aires')
    assert.equal(overview.period.granularity, 'day')
    assert.equal(overview.summary.repairsIncoming, 2)
    assert.equal(overview.summary.repairsDelivered, 2)
    assert.equal(overview.summary.newClients, 2)
    assert.equal(overview.finance.billed, 110, 'A/D excluded; B/C included for Repair.createdAt')
    assert.equal(overview.finance.collected, 110, 'same boundaries for Payment.createdAt')
    assert.equal(overview.finance.expenses, 110, 'same boundaries for CashMovement.createdAt')
    assert.deepEqual(overview.clients.topByBilled.map(row => row.name).sort(), ['Boundary 1', 'Boundary 2'])
    assert.deepEqual(overview.finance.timeline, [{ label: '2026-10-05', billed: 110, collected: 110, expenses: 110, partsCost: 0, repairs: 2 }])
    // Check each timestamp alone: catches swapped inclusions even when totals coincide.
    for (const [i, instant] of instants.entries()) {
      await prisma.repair.updateMany({ where: { businessId }, data: { createdAt: new NativeDate(instant), deliveredAt: new NativeDate(instant) } })
      await prisma.payment.updateMany({ where: { businessId }, data: { createdAt: new NativeDate(instant) } })
      await prisma.cashMovement.updateMany({ where: { businessId }, data: { createdAt: new NativeDate(instant) } })
      await prisma.client.updateMany({ where: { businessId }, data: { createdAt: new NativeDate(instant) } })
      const report = await getReportsOverview(businessId, { period: 'today' })
      const included = i === 1 || i === 2
      assert.equal(report.summary.repairsIncoming, included ? 4 : 0, `Boundary ${i}: createdAt`)
      assert.equal(report.summary.repairsDelivered, included ? 4 : 0, `Boundary ${i}: deliveredAt`)
      assert.equal(report.summary.newClients, included ? 4 : 0, `Boundary ${i}: clients`)
      assert.equal(report.finance.collected, included ? 1111 : 0, `Boundary ${i}: payments`)
      assert.equal(report.finance.expenses, included ? 1111 : 0, `Boundary ${i}: expenses`)
    }
    console.log('BOUNDARIES PASSED: A excluded, B/C included, D excluded for all five date fields')

    const timelineAt = async (instant: string, from: string, to: string, granularity: string, label: string) => {
      const createdAt = new NativeDate(instant)
      await prisma.repair.updateMany({ where: { businessId }, data: { createdAt } })
      await prisma.payment.updateMany({ where: { businessId }, data: { createdAt } })
      await prisma.cashMovement.updateMany({ where: { businessId }, data: { createdAt } })
      const report = await getReportsOverview(businessId, { period: 'custom', from, to })
      assert.equal(report.period.granularity, granularity)
      assert.deepEqual(report.finance.timeline.map(row => row.label), [label])
      assert.deepEqual(report.repairs.timeline, [{ label, value: 4 }])
    }
    await timelineAt('2026-10-06T02:30:00Z', '2026-10-01', '2026-10-31', 'day', '2026-10-05')
    await timelineAt('2026-10-05T02:30:00Z', '2026-09-01', '2026-10-31', 'week', '2026-09-28')
    await timelineAt('2026-10-01T02:30:00Z', '2026-01-01', '2026-12-31', 'month', '2026-09')
    await timelineAt('2026-10-01T02:30:00Z', '2026-07-04', '2026-10-31', 'week', '2026-09-28') // 120 days
    await timelineAt('2026-10-01T02:30:00Z', '2026-07-03', '2026-10-31', 'month', '2026-09') // 121 days
    // El retroceso histórico del reloj no convierte 31/120 fechas civiles en 32/121 días.
    await timelineAt('2008-03-16T04:00:00Z', '2008-03-01', '2008-03-31', 'day', '2008-03-16')
    await timelineAt('2008-03-16T04:00:00Z', '2008-01-01', '2008-04-29', 'week', '2008-03-10')
    console.log('TIMELINES PASSED: Argentina day/month, civil Monday and 31/120/121-day thresholds')
  } finally {
    restoreClock()
    if (businessId) {
      await prisma.payment.deleteMany({ where: { businessId } })
      await prisma.cashMovement.deleteMany({ where: { businessId } })
      await prisma.repair.deleteMany({ where: { businessId } })
      await prisma.client.deleteMany({ where: { businessId } })
      await prisma.business.delete({ where: { id: businessId } })
    }
    await prisma.$disconnect()
  }
  console.log('REPORTS TIMEZONE PASSED')
}

main().catch(error => { console.error(error); process.exitCode = 1 })

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { validRegistrationPayload } from './helpers/registration'
import { getArgentinaDayBounds } from '../src/lib/argentina-day'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.equal(database.hostname, '127.0.0.1')
assert.equal(database.pathname, '/repair_finance_test')
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => String(input).includes('challenges.cloudflare.com/turnstile')
  ? Promise.resolve(new Response('{"success":true}', { status: 200 })) : nativeFetch(input, init)) as typeof fetch

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/app'), import('../src/lib/prisma')])
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  let token = ''
  const request = async (path: string, body?: object) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'X-Turnstile-Token': 'synthetic-test', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, body: await response.json() as any }
  }
  try {
    const owner = await request('/auth/register', validRegistrationPayload({ firstName: 'Flow', lastName: 'Synthetic', email: `flow-${randomUUID()}@example.com`, password: 'FlowSynthetic123!', businessName: 'Synthetic flow' }))
    assert.equal(owner.status, 201)
    token = owner.body.token
    const businessId = owner.body.user.business.id
    await prisma.subscription.update({ where: { businessId }, data: { planCode: 'COMPLETE', status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000 * 30) } })
    const client = await request('/clients', { name: 'Synthetic client', phone: '1111111111' })
    const repair = await request('/repairs', { clientId: client.body.id, deviceBrand: 'Samsung', deviceModel: 'Synthetic', issue: 'Synthetic diagnosis', total: 100000, partsCost: 70000 })
    assert.equal(repair.status, 201)
    const repairId = repair.body.id
    const today = getArgentinaDayBounds(new Date())
    const yesterday = new Date(today.start.getTime() - 12 * 3600000)
    const original = await prisma.cashMovement.create({ data: { businessId, repairId, type: 'EXPENSE', origin: 'REPAIR', amount: 70000, description: 'Synthetic historical estimate', createdAt: yesterday } })
    const corrected = await request(`/repairs/${repairId}/financial-operations`, { requestId: randomUUID(), kind: 'EXPENSE_CORRECTION', movementId: original.id, amount: 70000, confirmed: true, reason: 'Synthetic evidence: purchase never occurred' })
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body))
    const reports = await request('/reports/overview?period=today')
    const cash = await request('/cash/movements?origin=REPAIR&period=TODAY')
    const dashboard = await request('/dashboard/overview?period=today')
    for (const response of [reports, cash, dashboard]) assert.equal(response.status, 200, JSON.stringify(response.body))
    const timeline = reports.body.finance.timeline
    assert.equal(timeline.reduce((sum: number, row: any) => sum + row.expenses, 0), 0, 'Today correction is not a monetary outflow')
    assert.equal(timeline.reduce((sum: number, row: any) => sum + row.collected, 0), 0, 'Correction does not invent an income')
    assert.equal(timeline.reduce((sum: number, row: any) => sum + row.accountingAdjustment, 0), 70000, 'Dated accounting adjustment remains visible separately')
    assert.equal(dashboard.body.charts.cashFlow.reduce((sum: number, row: any) => sum + row.income + row.expense, 0), 0)
    for (const summary of [reports.body.finance, cash.body.summary, dashboard.body.financial]) {
      assert.equal(summary.accountingAdjustment, 70000)
      assert.equal(summary.balance, 70000, 'Today reconciled balance contains the dated correction')
      assert.equal(summary.cashBalance, 0, 'Today registered monetary flow excludes the correction')
    }
    const week = await request('/reports/overview?period=last_7_days')
    assert.equal(week.body.finance.timeline.reduce((sum: number, row: any) => sum + row.expenses, 0), 70000, 'Yesterday original remains in its own period')
    assert.equal(week.body.finance.balance, 0)
    assert.equal(week.body.finance.cashBalance, -70000)
    const weekCash = await request('/cash/movements?origin=REPAIR&period=7D')
    const weekDashboard = await request('/dashboard/overview?period=7d')
    for (const response of [week, weekCash, weekDashboard]) assert.equal(response.status, 200)
    for (const summary of [week.body.finance, weekCash.body.summary, weekDashboard.body.financial]) {
      assert.equal(summary.accountingAdjustment, 70000)
      assert.equal(summary.balance, 0)
      assert.equal(summary.cashBalance, -70000)
    }
    assert.equal(weekDashboard.body.charts.cashFlow.reduce((sum: number, row: any) => sum + row.expense, 0), 70000)
    assert.equal(weekDashboard.body.charts.cashFlow.reduce((sum: number, row: any) => sum + row.income, 0), 0)
    assert.deepEqual(await prisma.cashMovement.findUnique({ where: { id: original.id } }), original)
    const rows = await prisma.cashMovement.findMany({ where: { businessId, repairId }, orderBy: { id: 'asc' } })
    // Old cached clients fail before writes; no compatibility fallback generates new keys.
    for (const [path, body] of [
      [`/repairs/${repairId}/payments`, { amount: 20000, method: 'CASH' }],
      [`/repairs/${repairId}/payments`, { requestId: randomUUID(), amount: 20000, method: 'CASH' }],
      [`/repairs/${repairId}/cancel`, { reviewFee: 0, expenses: [] }],
      [`/repairs/${repairId}/financial-operations`, { kind: 'PURCHASE', amount: 20000, method: 'CASH', confirmed: true }],
    ] as const) assert.equal((await request(path, body)).status, 400)
    assert.deepEqual(await prisma.cashMovement.findMany({ where: { businessId, repairId }, orderBy: { id: 'asc' } }), rows)
    assert.equal((await prisma.repair.findUniqueOrThrow({ where: { id: repairId } })).paid, 0)
    const payment = { requestId: randomUUID(), amount: 20000, method: 'CASH', confirmed: true }
    assert.equal((await request(`/repairs/${repairId}/payments`, payment)).status, 201)
    assert.equal((await request(`/repairs/${repairId}/payments`, payment)).status, 201)
    assert.equal((await request(`/repairs/${repairId}/payments`, { ...payment, amount: 10000 })).status, 409)
    assert.equal(await prisma.payment.count({ where: { businessId, repairId } }), 1)
    assert.equal((await prisma.repair.findUniqueOrThrow({ where: { id: repairId } })).paid, 20000)
    console.log('REPORT CASH FLOW PASS: yesterday 70000 preserved, today adjustment separated, Cash/dashboard/reports agree, old clients rejected without writes and new payment retries idempotent')
  } finally {
    globalThis.fetch = nativeFetch
    await prisma.$disconnect()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Demo tests require a local database')
const prisma = new PrismaClient()
const businesses: string[] = []
const run = (email: string, extra: Record<string, string> = {}) => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
  const child = spawn(process.execPath, [require.resolve('tsx/cli'), 'src/scripts/load-business-demo.ts'], {
    env: { ...process.env, NODE_ENV: 'test', DEMO_USER_EMAIL: email, DEMO_PROFILE: 'full', DEMO_ALLOW_PRODUCTION: '', ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  child.on('error', reject)
  child.on('close', code => resolve({ code, output }))
})
const owner = async () => {
  const email = `demo-test-${randomUUID()}@example.invalid`
  const business = await prisma.business.create({ data: { name: 'Temporary demo test', users: { create: {
    email, name: 'Demo test', passwordHash: 'not-a-login-password-hash', role: 'OWNER',
  } } }, include: { users: true } })
  businesses.push(business.id)
  return { businessId: business.id, userId: business.users[0].id, email }
}
const snapshot = async (businessId: string) => ({
  business: await prisma.business.findUnique({ where: { id: businessId } }),
  clients: await prisma.client.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
  devices: await prisma.device.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
  repairs: await prisma.repair.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
  payments: await prisma.payment.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
  cash: await prisma.cashMovement.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
  history: await prisma.repairStatusHistory.findMany({ where: { repair: { businessId } }, orderBy: { id: 'asc' } }),
})

async function verifyDataset(businessId: string, counts: [number, number, number]) {
  const data = await snapshot(businessId)
  assert.deepEqual([data.clients.length, data.devices.length, data.repairs.length], counts)
  for (const repair of data.repairs) {
    const device = data.devices.find(row => row.id === repair.deviceId)!
    assert.ok(device)
    assert.equal(repair.clientId, device.clientId, 'A repair must belong to the owner of its device')
    assert.ok(+device.createdAt <= +repair.createdAt)
    assert.ok(+data.clients.find(row => row.id === repair.clientId)!.createdAt <= +device.createdAt)
    assert.ok(repair.notes?.includes('demo-cellufix-v2'))
    const payments = data.payments.filter(row => row.repairId === repair.id)
    const cash = data.cash.filter(row => row.repairId === repair.id)
    assert.equal(payments.filter(row => !row.cancellationReview).reduce((sum, row) => sum + row.amount, 0), repair.paid)
    assert.equal(payments.filter(row => row.cancellationReview).reduce((sum, row) => sum + row.amount, 0), repair.cancellationReviewPaid)
    assert.equal(cash.filter(row => row.type === 'INCOME').reduce((sum, row) => sum + row.amount, 0), payments.reduce((sum, row) => sum + row.amount, 0))
    assert.ok(cash.every(row => row.origin === 'REPAIR' && row.description.includes('demo-cellufix-v2')))
    assert.ok(payments.every(row => row.clientId === repair.clientId && row.note?.includes('demo-cellufix-v2')))
    const history = data.history.filter(row => row.repairId === repair.id).sort((a, b) => +a.createdAt - +b.createdAt)
    assert.equal(history.at(-1)?.newStatus, repair.status)
    assert.equal(history[0]?.previousStatus, null)
    for (let i = 1; i < history.length; i++) {
      assert.equal(history[i].previousStatus, history[i - 1].newStatus)
      assert.ok(+history[i].createdAt <= Date.now())
    }
    if (repair.status === 'DELIVERED' || repair.status === 'WARRANTY') assert.equal(repair.paid, repair.total)
    if (repair.status === 'CANCELLED') {
      assert.equal(repair.cancellationPaidAmount, repair.paid)
      assert.ok(repair.cancelledAt)
      assert.equal(repair.trackingEnabled, false)
      const refunds = cash.filter(row => row.type === 'EXPENSE')
      assert.equal(refunds.reduce((sum, row) => sum + row.amount, 0), repair.cancellationRefundAmount)
      if (repair.cancellationRefundAmount) assert.equal(refunds[0].id, repair.cancellationRefundMovementId)
    }
    if (repair.trackingEnabled) assert.ok(repair.trackingToken && repair.trackingCreatedAt)
  }
  const settlement = data.repairs.filter(row => row.status === 'CANCELLED').map(row => [
    row.paid, row.cancellationReviewFee, row.cancellationRefundAmount, row.cancellationReviewPaid,
    data.cash.filter(cash => cash.repairId === row.id).reduce((sum, cash) => sum + (cash.type === 'INCOME' ? cash.amount : -cash.amount), 0),
  ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  assert.deepEqual(settlement, [
    [40000, 15000, 25000, 0, 15000], [20000, 20000, 0, 0, 20000], [10000, 20000, 0, 0, 10000],
    [40000, 0, 40000, 0, 0], [10000, 20000, 0, 10000, 20000], [0, 0, 0, 0, 0],
  ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
  assert.deepEqual([...new Set(data.payments.map(row => row.method))].sort(), ['CARD', 'CASH', 'OTHER', 'TRANSFER'])
  const numbers = data.repairs.map(row => row.number).sort((a, b) => a - b)
  assert.equal(new Set(numbers).size, counts[2])
  assert.equal(numbers.at(-1)! - numbers[0] + 1, counts[2])
  assert.equal(data.business!.lastRepairNumber, numbers.at(-1))
  return data
}

async function main() {
  try {
    const a = await owner(), b = await owner()
    const isolatedBefore = await snapshot(b.businessId)
    // Fails against the old loader: CANCELLED lacks settlement and delivered repairs are unpaid.
    const loaded = await run(a.email)
    assert.equal(loaded.code, 0, loaded.output)
    console.log('Full profile:', loaded.output.trim())
    const cancelled = await prisma.repair.findFirstOrThrow({ where: { businessId: a.businessId, status: 'CANCELLED' } })
    assert.notEqual(cancelled.cancellationPaidAmount, null, 'Cancelled demo repairs must have financial settlement')
    const data = await verifyDataset(a.businessId, [18, 25, 31])
    assert.deepEqual(await snapshot(b.businessId), isolatedBefore, 'Other businesses are unchanged')
    assert.equal((await run(a.email)).code, 0)
    assert.deepEqual(await snapshot(a.businessId), data, 'Repeating the loader must not modify data or consume numbers')
    const blocked = await run(b.email, { NODE_ENV: 'production' })
    assert.notEqual(blocked.code, 0)
    assert.deepEqual(await snapshot(b.businessId), isolatedBefore, 'Production requires explicit opt-in')
    const concurrent = await Promise.all([run(b.email, { DEMO_PROFILE: 'small' }), run(b.email, { DEMO_PROFILE: 'small' })])
    for (const result of concurrent) assert.equal(result.code, 0, result.output)
    console.log('Small profile:', concurrent.find(result => result.output.includes('"mode": "created"'))!.output.trim())
    await verifyDataset(b.businessId, [6, 8, 12])
    assert.equal(concurrent.filter(result => result.output.includes('"mode": "created"')).length, 1)
    const legacy = await owner()
    await prisma.client.create({ data: { businessId: legacy.businessId, name: 'Existing legacy demo', notes: 'demo-cellufix-v1' } })
    const legacyBefore = await snapshot(legacy.businessId)
    const legacyResult = await run(legacy.email)
    assert.equal(legacyResult.code, 0, legacyResult.output)
    assert.ok(legacyResult.output.includes('legacy-existing'))
    assert.deepEqual(await snapshot(legacy.businessId), legacyBefore, 'Old demos are reported without rewriting or duplicating them')
    const inactive = await owner()
    await prisma.user.update({ where: { id: inactive.userId }, data: { isActive: false } })
    assert.notEqual((await run(inactive.email)).code, 0)
    assert.equal(await prisma.client.count({ where: { businessId: inactive.businessId } }), 0)
    assert.notEqual((await run('missing-demo-account@example.invalid')).code, 0)
    const rollback = await owner()
    // The second allocation overflows Int: no partial clients, payments or numbers may survive.
    await prisma.business.update({ where: { id: rollback.businessId }, data: { lastRepairNumber: 2147483646 } })
    const beforeFailure = await snapshot(rollback.businessId)
    assert.notEqual((await run(rollback.email)).code, 0)
    assert.deepEqual(await snapshot(rollback.businessId), beforeFailure, 'A failed load rolls back the entire dataset and counter')
    console.log('BUSINESS DEMO PASSED: settlement, cash, relations, histories, full/small profiles, idempotence, concurrency, tenant isolation, guards and legacy protection')
  } finally {
    for (const businessId of businesses) await prisma.$transaction([
      prisma.cashMovement.deleteMany({ where: { businessId } }), prisma.payment.deleteMany({ where: { businessId } }),
      prisma.warrantyClaim.deleteMany({ where: { businessId } }),
      prisma.repair.deleteMany({ where: { businessId } }), prisma.device.deleteMany({ where: { businessId } }),
      prisma.client.deleteMany({ where: { businessId } }), prisma.user.deleteMany({ where: { businessId } }),
      prisma.business.deleteMany({ where: { id: businessId } }),
    ])
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

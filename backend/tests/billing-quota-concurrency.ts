import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Use a local test database')
assert.ok(database.pathname.endsWith('_test'), 'Use an isolated database ending in _test')
assert.notEqual(database.pathname, '/tecnodesk_visual_test')
process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_GLOBAL_MAX = '10000'
process.env.RATE_LIMIT_AUTH_MAX = '10000'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '10000'

async function main() {
  const [{ app }, { prisma }, { subscriptionUsage }] = await Promise.all([
    import('../src/server'), import('../src/lib/prisma'), import('../src/modules/billing/billing.service'),
  ])
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const ids: string[] = []
  const now = new Date(), start = new Date(now.getTime() - 86400_000), end = new Date(now.getTime() + 30 * 86400_000)
  const fixture = async (label: string, repairs: number, tracked = 0, planCode: 'INITIAL' | 'COMPLETE' = 'INITIAL') => {
    const business = await prisma.business.create({ data: { name: `Quota ${label}`, lastRepairNumber: 1000 + repairs } })
    ids.push(business.id)
    const user = await prisma.user.create({ data: { businessId: business.id, name: 'Owner', email: `${randomUUID()}@example.com`, passwordHash: 'unused', role: 'OWNER' } })
    const client = await prisma.client.create({ data: { businessId: business.id, name: 'Cliente cuota' } })
    await prisma.subscription.create({ data: { businessId: business.id, planCode, status: 'ACTIVE', trialConsumedAt: start, trialStartedAt: new Date(start.getTime() - 40 * 86400_000), trialEndsAt: new Date(start.getTime() - 10 * 86400_000), currentPeriodStart: start, currentPeriodEnd: end, accessExpiresAt: end } })
    await prisma.repair.createMany({ data: Array.from({ length: repairs }, (_, i) => ({ businessId: business.id, clientId: client.id, number: 1001 + i, deviceBrand: 'QA', deviceModel: 'Test', issue: 'Quota seed', createdAt: now, trackingCreatedAt: i < tracked ? now : null, trackingEnabled: i < tracked, trackingToken: i < tracked ? randomUUID() : null, trackingExpiresAt: end })) })
    const token = jwt.sign({ userId: user.id, businessId: business.id, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET!, { expiresIn: '8h' })
    return { id: business.id, token, input: { clientId: client.id, deviceBrand: 'QA', deviceModel: 'Concurrent', issue: 'Quota concurrent', total: 0 } }
  }
  const post = async (f: { token: string }, path: string, body?: object) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, { method: 'POST', headers: { authorization: `Bearer ${f.token}`, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
    return { status: response.status, body: await response.json() as any }
  }
  const snapshot = async (businessId: string) => ({
    repairs: await prisma.repair.count({ where: { businessId } }), payments: await prisma.payment.count({ where: { businessId } }),
    cash: await prisma.cashMovement.count({ where: { businessId } }), counter: (await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).lastRepairNumber,
  })
  const quotaResponses = (responses: { status: number; body: any }[], success: number, label: string) => {
    assert.equal(responses.filter(r => r.status === success).length, 1, `${label}: exactly one success; statuses ${responses.map(r => r.status)}`)
    assert.equal(responses.filter(r => r.status === 409).length, 9)
    for (const r of responses.filter(r => r.status === 409)) assert.match(r.body.message, /Alcanzaste el límite/)
  }
  try {
    const a = await fixture('A', 39)
    assert.equal((await subscriptionUsage(a.id)).repairs, 39)
    const before = await snapshot(a.id)
    const responses = await Promise.all(Array.from({ length: 10 }, () => post(a, '/repairs', a.input)))
    quotaResponses(responses, 201, 'A')
    const after = await snapshot(a.id)
    assert.deepEqual(after, { repairs: 40, payments: 0, cash: 0, counter: 1040 })
    assert.equal((await subscriptionUsage(a.id)).repairs, 40)
    const numbers = await prisma.repair.findMany({ where: { businessId: a.id }, select: { number: true, clientId: true } })
    assert.equal(new Set(numbers.map(r => r.number)).size, 40)
    assert.ok(numbers.every(r => r.clientId === a.input.clientId))
    console.log('A', JSON.stringify({ requests: 10, created: 1, rejected: 9, before, after }))
    const rejected = await post(a, '/repairs', { ...a.input, total: 5000, partsCost: 1000, partsCostMethod: 'CASH', advanceAmount: 1000, advanceMethod: 'CASH' })
    assert.equal(rejected.status, 409)
    assert.deepEqual(await snapshot(a.id), after)
    console.log('ROLLBACK: Repair/Payment/CashMovement/counter unchanged')

    const b = await fixture('B', 19, 9)
    const targets = await prisma.repair.findMany({ where: { businessId: b.id, trackingCreatedAt: null }, orderBy: { number: 'asc' } })
    assert.equal((await subscriptionUsage(b.id)).trackingLinks, 9)
    const links = await Promise.all(targets.map(r => post(b, `/repairs/${r.id}/tracking-link`)))
    quotaResponses(links, 200, 'B')
    assert.equal((await subscriptionUsage(b.id)).trackingLinks, 10)
    const updated = await prisma.repair.findMany({ where: { id: { in: targets.map(r => r.id) } }, orderBy: { number: 'asc' } })
    assert.equal(updated.filter(r => r.trackingCreatedAt).length, 1)
    for (let i = 0; i < targets.length; i++) {
      assert.deepEqual(updated[i].trackingExpiresAt, targets[i].trackingExpiresAt)
      if (links[i].status === 409) assert.deepEqual(updated[i], targets[i])
      else assert.ok(updated[i].trackingToken && updated[i].trackingEnabled)
    }
    console.log('B: initial=9 requests=10 success=1 rejected=9 final=10')

    const c = await fixture('C', 10, 9)
    const target = await prisma.repair.findFirstOrThrow({ where: { businessId: c.id, trackingCreatedAt: null } })
    const [created, linked] = await Promise.all([post(c, '/repairs', c.input), post(c, `/repairs/${target.id}/tracking-link`)])
    assert.equal(created.status, 201)
    assert.ok([200, 409].includes(linked.status))
    const newRepair = await prisma.repair.findUniqueOrThrow({ where: { id: created.body.id } })
    const targetAfter = await prisma.repair.findUniqueOrThrow({ where: { id: target.id } })
    assert.equal((await subscriptionUsage(c.id)).trackingLinks, 10)
    assert.equal(Boolean(newRepair.trackingCreatedAt), linked.status === 409)
    assert.equal(newRepair.trackingEnabled, linked.status === 409)
    assert.equal(Boolean(newRepair.trackingToken), linked.status === 409)
    assert.equal(Boolean(targetAfter.trackingCreatedAt), linked.status === 200)
    assert.equal(targetAfter.trackingEnabled, linked.status === 200)
    assert.equal(Boolean(targetAfter.trackingToken), linked.status === 200)
    assert.deepEqual(targetAfter.trackingExpiresAt, target.trackingExpiresAt)
    console.log('C', JSON.stringify({ created: created.status, linked: linked.status, winner: linked.status === 200 ? 'explicit' : 'creation', newTracking: newRepair.trackingEnabled, targetTracking: targetAfter.trackingEnabled, usage: 10 }))

    const unlimited = await fixture('Complete', 0, 0, 'COMPLETE')
    const complete = await Promise.all(Array.from({ length: 10 }, () => post(unlimited, '/repairs', unlimited.input)))
    assert.ok(complete.every(r => r.status === 201), JSON.stringify(complete))
    assert.equal((await subscriptionUsage(unlimited.id)).repairs, 10)
    console.log('COMPLETE: 10 concurrent requests, 10 HTTP 201')

    let release!: () => void, acquired!: () => void
    const unlocked = new Promise<void>(resolve => { release = resolve })
    const locked = new Promise<void>(resolve => { acquired = resolve })
    const holder = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${a.id} FOR UPDATE`
      acquired()
      await unlocked
    }, { timeout: 15000 })
    try {
      await locked
      let settled = false
      const waiting = post(a, '/repairs', a.input).then(r => { settled = true; return r })
      assert.equal((await post(unlimited, '/repairs', unlimited.input)).status, 201)
      assert.equal(settled, false, 'quota check must wait for its Business lock while another business completes')
      release()
      assert.equal((await waiting).status, 409)
      await holder
    } finally { release(); await holder }
    console.log('PER BUSINESS: independent business completes while A holds its row lock')
    console.log('BILLING QUOTA CONCURRENCY PASSED')
  } finally {
    for (const businessId of ids) {
      await prisma.payment.deleteMany({ where: { businessId } })
      await prisma.repair.deleteMany({ where: { businessId } })
      await prisma.cashMovement.deleteMany({ where: { businessId } })
      await prisma.client.deleteMany({ where: { businessId } })
      await prisma.subscription.deleteMany({ where: { businessId } })
      await prisma.user.deleteMany({ where: { businessId } })
      await prisma.business.delete({ where: { id: businessId } })
    }
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

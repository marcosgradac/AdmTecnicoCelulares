import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.equal(database.protocol, 'postgresql:')
assert.equal(database.hostname, '127.0.0.1', 'Local PostgreSQL only')
assert.ok(database.pathname.endsWith('_test') && database.pathname !== '/tecnodesk_visual_test', 'Disposable test database required')
assert.ok(!['55432', '55434', '55439', '55441'].includes(database.port), 'Do not use existing development databases')
process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '500'

const indexName = 'PaymentSubmission_one_pending_per_business'
const migrationPath = 'prisma/migrations/20261006000000_enforce_single_pending_payment/migration.sql'
const conflict = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const businesses: string[] = []
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const originalFindFirst = prisma.paymentSubmission.findFirst
  try {
    const password = 'Pending-Test-2026!'
    const hash = await bcrypt.hash(password, 10)
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: 'PROFESSIONAL' } })
    const tenant = async () => {
      const business = await prisma.business.create({ data: { name: `Pending race ${randomUUID()}` } })
      businesses.push(business.id)
      const owner = await prisma.user.create({ data: { businessId: business.id, name: 'Owner', email: `${randomUUID()}@local.test`, passwordHash: hash, role: 'OWNER' } })
      const now = new Date()
      const end = new Date(now.getTime() + 30 * 86400000)
      const subscription = await prisma.subscription.create({ data: { businessId: business.id, planCode: 'PROFESSIONAL', status: 'ACTIVE', trialStartedAt: now, trialEndsAt: now, trialConsumedAt: now, currentPeriodStart: now, currentPeriodEnd: end, accessExpiresAt: end } })
      return { business, owner, subscription }
    }
    const createPayment = (fixture: { business: { id: string }; subscription: { id: string } }) => prisma.paymentSubmission.create({ data: { businessId: fixture.business.id, subscriptionId: fixture.subscription.id, planCode: plan.code, expectedAmount: plan.priceARS, reportedAmount: plan.priceARS, payerName: 'Owner Test', transferDate: new Date() } })
    const a = await tenant()
    const first = await createPayment(a)
    await assert.rejects(() => createPayment(a), conflict, 'PostgreSQL must reject a second PENDING with P2002')
    console.log('DIRECT DUPLICATE: P2002; PENDING count=1')
    assert.equal(await prisma.paymentSubmission.count({ where: { businessId: a.business.id, status: 'PENDING' } }), 1)
    await prisma.paymentSubmission.update({ where: { id: first.id }, data: { status: 'REJECTED' } })
    const second = await createPayment(a)
    await prisma.paymentSubmission.update({ where: { id: second.id }, data: { status: 'APPROVED' } })
    const third = await createPayment(a)
    // Multiple rows of either historical status must also be allowed.
    await prisma.paymentSubmission.update({ where: { id: third.id }, data: { status: 'REJECTED' } })
    const fourth = await createPayment(a)
    await prisma.paymentSubmission.update({ where: { id: fourth.id }, data: { status: 'APPROVED' } })
    await createPayment(a)
    const b = await tenant()
    await createPayment(b)
    for (const businessId of [a.business.id, b.business.id]) assert.equal(await prisma.paymentSubmission.count({ where: { businessId, status: 'PENDING' } }), 1)
    assert.equal(await prisma.paymentSubmission.count({ where: { businessId: a.business.id, status: 'REJECTED' } }), 2)
    assert.equal(await prisma.paymentSubmission.count({ where: { businessId: a.business.id, status: 'APPROVED' } }), 2)
    console.log('DIRECT RELEASE: REJECTED/APPROVED allow new PENDING, preserve repeated history; TWO BUSINESSES: 1 PENDING each')

    const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'PaymentSubmission' AND indexname = ${indexName}`
    assert.equal(indexes.length, 1)
    assert.match(indexes[0].indexdef, /CREATE UNIQUE INDEX/)
    assert.match(indexes[0].indexdef, /\("businessId"\)/)
    assert.match(indexes[0].indexdef, /WHERE.*"?status"?\s*=\s*'PENDING'/)
    console.log(`PG_INDEXES: ${indexes[0].indexdef}`)

    // Run the actual migration guard with duplicate data in a transaction.
    // Dropping the index and creating duplicates are rolled back on the expected exception.
    const sql = await readFile(migrationPath, 'utf8')
    const guard = sql.slice(0, sql.indexOf('CREATE UNIQUE INDEX'))
    const before = await prisma.paymentSubmission.findMany({ where: { businessId: a.business.id }, orderBy: { id: 'asc' } })
    await assert.rejects(() => prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`DROP INDEX "${indexName}"`)
      await tx.paymentSubmission.create({ data: { businessId: a.business.id, subscriptionId: a.subscription.id, planCode: plan.code, expectedAmount: plan.priceARS, reportedAmount: plan.priceARS, payerName: 'Duplicate fixture', transferDate: new Date() } })
      await tx.$executeRawUnsafe(guard)
    }), /Cannot enforce one pending PaymentSubmission per business: duplicate PENDING rows exist/)
    assert.deepEqual(await prisma.paymentSubmission.findMany({ where: { businessId: a.business.id }, orderBy: { id: 'asc' } }), before)
    await assert.rejects(() => createPayment(a), conflict, 'Rollback must restore the index')
    console.log('MIGRATION GUARD: fails clearly with duplicates; original rows and index preserved after rollback')

    const c = await tenant()
    const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: c.owner.email, password }) })
    assert.equal(login.status, 200)
    const { token } = await login.json() as { token: string }
    const post = async () => {
      const response = await fetch(`${base}/billing/payments`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ planCode: 'PROFESSIONAL', reportedAmount: plan.priceARS, payerName: 'Owner Test', transferDate: new Date().toISOString() }) })
      return { status: response.status, body: await response.json() as { id?: string; success?: boolean; code?: string; message?: string } }
    }
    const wave = async (label: string, forceRace: boolean) => {
      let arrived = 0
      let release!: () => void
      const barrier = new Promise<void>(resolve => { release = resolve })
      const timeout = setTimeout(release, 10000)
      if (forceRace) {
        // Test-only scheduling barrier: execute every real PostgreSQL precheck first,
        // then release all requests together. Creates and errors are never mocked.
        prisma.paymentSubmission.findFirst = (async (...args: Parameters<typeof originalFindFirst>) => {
          const result = await originalFindFirst.apply(prisma.paymentSubmission, args)
          if (args[0]?.where?.businessId === c.business.id && args[0]?.where?.status === 'PENDING') {
            assert.equal(result, null, 'Every racing precheck must really see no PENDING')
            if (++arrived === 10) release()
            await barrier
          }
          return result
        }) as typeof originalFindFirst
      }
      try {
        const requests = Array.from({ length: 10 }, () => post())
        const outcomes = await Promise.all(requests)
        if (forceRace) assert.equal(arrived, 10, 'All ten real prechecks must reach the barrier')
        assert.equal(outcomes.filter(item => item.status === 201).length, 1, JSON.stringify(outcomes))
        const conflicts = outcomes.filter(item => item.status === 409)
        assert.equal(conflicts.length, 9, JSON.stringify(outcomes))
        for (const item of conflicts) assert.deepEqual(item.body, { success: false, code: 'PAYMENT_ALREADY_PENDING', message: 'Ya tenés un pago pendiente de verificación.' })
        assert.equal(await prisma.paymentSubmission.count({ where: { businessId: c.business.id, status: 'PENDING' } }), 1)
        console.log(`HTTP ${label}: 10 simultaneous requests, 1x201, 9x409 PAYMENT_ALREADY_PENDING, DB PENDING=1; prechecks synchronized=${arrived}`)
        return outcomes.find(item => item.status === 201)!.body.id!
      } finally {
        release()
        clearTimeout(timeout)
        prisma.paymentSubmission.findFirst = originalFindFirst
      }
    }
    const pending = await wave('initial race', true)
    await prisma.paymentSubmission.update({ where: { id: pending }, data: { status: 'REJECTED' } })
    const afterReject = await wave('after REJECTED', true)
    assert.equal((await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: pending } })).status, 'REJECTED')
    await prisma.paymentSubmission.update({ where: { id: afterReject }, data: { status: 'APPROVED' } })
    const afterApprove = await wave('after APPROVED', true)
    assert.equal((await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: afterReject } })).status, 'APPROVED')
    await prisma.paymentSubmission.update({ where: { id: afterApprove }, data: { status: 'APPROVED' } })
    await wave('natural scheduling', false)
    assert.equal(await prisma.paymentSubmission.count({ where: { businessId: c.business.id } }), 4, 'All historical submissions survive')
    console.log('PENDING PAYMENT CONCURRENCY PASSED')
  } finally {
    prisma.paymentSubmission.findFirst = originalFindFirst
    try {
      for (const businessId of businesses) await prisma.$transaction([
        prisma.subscriptionAuditLog.deleteMany({ where: { businessId } }),
        prisma.paymentSubmission.deleteMany({ where: { businessId } }),
        prisma.subscription.deleteMany({ where: { businessId } }),
        prisma.user.deleteMany({ where: { businessId } }),
        prisma.business.delete({ where: { id: businessId } }),
      ])
    } finally {
      try { await prisma.$disconnect() }
      finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

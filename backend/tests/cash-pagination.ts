import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { Prisma } from '@prisma/client'

const beforeMidnight = new Date('2026-08-27T02:30:00.000Z')
const afterMidnight = new Date('2026-08-27T03:30:00.000Z')
const historicalDates = Array.from({ length: 7 }, (_, index) => new Date(`2026-08-${String(17 - index).padStart(2, '0')}T12:00:00.000Z`))
const tiedAt = new Date('2026-08-10T12:00:00.000Z')
const olderThanTie = new Date('2026-08-09T12:00:00.000Z')
const NativeDate = globalThis.Date

const withFixedNow = async <T>(instant: Date, action: () => Promise<T>) => {
  const fixedTime = instant.getTime()
  class FixedDate extends NativeDate {
    constructor(...args: any[]) {
      super(...(args.length ? args : [fixedTime]))
    }

    static now() {
      return fixedTime
    }
  }
  globalThis.Date = FixedDate as DateConstructor
  try {
    return await action()
  } finally {
    globalThis.Date = NativeDate
  }
}

async function main() {
  process.env.NODE_ENV = 'test'
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`
  const businesses: string[] = []

  const request = async (method: string, path: string, body?: object, token?: string) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, body: await response.json() as any }
  }

  const createTenant = async (label: string) => {
    const now = new Date()
    const business = await prisma.business.create({ data: { name: `Caja ${label}` } })
    await prisma.subscription.create({
      data: {
        businessId: business.id,
        planCode: 'COMPLETE',
        status: 'ACTIVE',
        trialStartedAt: now,
        trialEndsAt: new Date(now.getTime() + 30 * 86_400_000),
        trialConsumedAt: now,
        accessExpiresAt: null,
      },
    })
    const user = await prisma.user.create({
      data: {
        businessId: business.id,
        name: `Caja ${label}`,
        firstName: 'Caja',
        lastName: label,
        email: `cash-pagination-${label}-${suffix}@example.com`,
        passwordHash: randomBytes(32).toString('hex'),
        role: 'OWNER',
      },
    })
    businesses.push(business.id)
    return jwt.sign({ userId: user.id, businessId: business.id, role: user.role, platformRole: user.platformRole, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET!)
  }

  try {
    const tokenA = await createTenant('A')
    const tokenB = await createTenant('B')
    const businessA = businesses[0]
    const businessB = businesses[1]
    assert.ok(businessA && businessB)

    await prisma.cashMovement.createMany({
      data: [
        { businessId: businessA, type: 'INCOME', description: 'Antes de medianoche', amount: 700, method: 'CASH', createdAt: beforeMidnight },
        { businessId: businessA, type: 'EXPENSE', description: 'Después de medianoche', amount: 500, method: 'TRANSFER', createdAt: afterMidnight },
        ...historicalDates.map((createdAt, index) => ({
          businessId: businessA,
          type: index % 2 === 0 ? 'INCOME' as const : 'EXPENSE' as const,
          description: `Histórico ${index + 1}`,
          amount: index + 1,
          method: null,
          createdAt,
        })),
        { id: 'cash-tie-a', businessId: businessA, type: 'INCOME', description: 'Empate A', amount: 8, method: null, createdAt: tiedAt },
        { id: 'cash-tie-z', businessId: businessA, type: 'EXPENSE', description: 'Empate Z', amount: 9, method: null, createdAt: tiedAt },
        { businessId: businessA, type: 'INCOME', description: 'Histórico antiguo', amount: 10, method: null, createdAt: olderThanTie },
        { businessId: businessB, type: 'INCOME', description: 'Ingreso de otro negocio', amount: 99_999, method: 'CASH', createdAt: afterMidnight },
      ],
    })

    const originalTransaction = prisma.$transaction
    let cashReadIsolation: unknown
    prisma.$transaction = ((...args: unknown[]) => {
      if (Array.isArray(args[0]) && args[0].length === 3) cashReadIsolation = (args[1] as { isolationLevel?: unknown } | undefined)?.isolationLevel
      return Reflect.apply(originalTransaction, prisma, args)
    }) as typeof originalTransaction
    let pageOne
    try {
      pageOne = await request('GET', '/cash/movements?page=1&pageSize=10', undefined, tokenA)
    } finally {
      prisma.$transaction = originalTransaction
    }
    assert.equal(cashReadIsolation, Prisma.TransactionIsolationLevel.RepeatableRead, 'cash page and summary share a repeatable-read snapshot')
    assert.equal(pageOne.status, 200)
    assert.equal(pageOne.body.items.length, 10, 'page one returns ten movements')
    assert.equal(pageOne.body.total, 12, 'total excludes the other tenant')
    assert.equal(pageOne.body.page, 1)
    assert.equal(pageOne.body.pageSize, 10)
    assert.equal(pageOne.body.pages, 2)
    assert.ok(pageOne.body.items.every((item: { description: string }) => item.description !== 'Ingreso de otro negocio'))

    const pageTwo = await request('GET', '/cash/movements?page=2&pageSize=10', undefined, tokenA)
    assert.equal(pageTwo.status, 200)
    assert.equal(pageTwo.body.items.length, 2, 'page two returns the remaining movements')
    assert.equal(pageTwo.body.total, 12)
    const allPageItems = [...pageOne.body.items, ...pageTwo.body.items] as Array<{ id: string; description: string }>
    assert.equal(new Set(allPageItems.map(item => item.id)).size, 12, 'pages contain no duplicate movements')
    assert.deepEqual(new Set(allPageItems.map(item => item.description)), new Set([
      'Antes de medianoche', 'Después de medianoche', ...historicalDates.map((_, index) => `Histórico ${index + 1}`),
      'Empate A', 'Empate Z', 'Histórico antiguo',
    ]), 'pages contain every movement exactly once')
    assert.equal(pageOne.body.items[9].id, 'cash-tie-z', 'id breaks a timestamp tie at the page boundary')
    assert.equal(pageTwo.body.items[0].id, 'cash-tie-a', 'the next page starts after the tie boundary')

    for (const query of ['pageSize=0', 'pageSize=101']) {
      const invalid = await request('GET', `/cash/movements?page=1&${query}`, undefined, tokenA)
      assert.equal(invalid.status, 400, `rejects invalid ${query}`)
    }

    const { getArgentinaDayBounds } = await import('../src/lib/argentina-day')
    const beforeBounds = getArgentinaDayBounds(beforeMidnight)
    assert.equal(beforeBounds.start.toISOString(), '2026-08-26T03:00:00.000Z')
    assert.equal(beforeBounds.end.toISOString(), '2026-08-27T03:00:00.000Z')
    const afterBounds = getArgentinaDayBounds(afterMidnight)
    assert.equal(afterBounds.start.toISOString(), '2026-08-27T03:00:00.000Z')
    assert.equal(afterBounds.end.toISOString(), '2026-08-28T03:00:00.000Z')

    const beforeSummary = await withFixedNow(beforeMidnight, () => request('GET', '/cash/movements?page=1&pageSize=10', undefined, tokenA))
    assert.equal(beforeSummary.body.summary.incomeToday, 700)
    assert.equal(beforeSummary.body.summary.expenseToday, 0)
    assert.equal(beforeSummary.body.summary.balanceToday, 700)
    assert.equal(beforeSummary.body.summary.totalMovements, 12)

    const afterSummary = await withFixedNow(afterMidnight, () => request('GET', '/cash/movements?page=1&pageSize=10', undefined, tokenA))
    assert.equal(afterSummary.body.summary.incomeToday, 0)
    assert.equal(afterSummary.body.summary.expenseToday, 500)
    assert.equal(afterSummary.body.summary.balanceToday, -500)
    assert.equal(afterSummary.body.summary.totalMovements, 12)

    console.log('CASH PAGINATION TESTS PASSED: page envelope, Argentina-day summary and tenant isolation')
  } finally {
    for (const businessId of businesses) {
      await prisma.$transaction([
        prisma.cashMovement.deleteMany({ where: { businessId } }),
        prisma.passwordResetToken.deleteMany({ where: { user: { businessId } } }),
        prisma.subscription.deleteMany({ where: { businessId } }),
        prisma.user.deleteMany({ where: { businessId } }),
        prisma.business.deleteMany({ where: { id: businessId } }),
      ])
    }
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })

import 'dotenv/config'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'

// Fixtures are restricted to a dedicated local test database; no real accounts are modified.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Use local PostgreSQL only')
assert.ok(database.pathname.endsWith('_test'), 'Use a dedicated _test database')
process.env.NODE_ENV = 'test'

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}/api/platform-admin`
  const ids: string[] = []
  try {
    // Compute the pre-existing commercial baseline independently of endpoint filters.
    const before = await prisma.business.findMany({ include: { users: true, subscription: { include: { plan: true } }, billingPayments: true } })
    const customers = before.filter(business => !business.users.some(user => user.platformRole === 'SUPER_ADMIN' && user.deletedAt === null))
    const base = {
      clients: customers.length,
      activeBusinesses: customers.filter(b => b.isActive).length,
      inactiveBusinesses: customers.filter(b => !b.isActive).length,
      owners: customers.flatMap(b => b.users).filter(u => u.role === 'OWNER' && u.deletedAt === null).length,
      technicians: customers.flatMap(b => b.users).filter(u => u.role === 'TECHNICIAN' && u.deletedAt === null).length,
      active: customers.filter(b => b.subscription?.status === 'ACTIVE').length,
      trials: customers.filter(b => b.subscription?.status === 'TRIALING').length,
      grace: customers.filter(b => b.subscription?.status === 'GRACE').length,
      suspended: customers.filter(b => b.subscription?.status === 'SUSPENDED').length,
      pendingPayments: customers.flatMap(b => b.billingPayments).filter(p => p.status === 'PENDING').length,
      estimatedMrrARS: customers.reduce((sum, b) => sum + (b.subscription?.status === 'ACTIVE' ? b.subscription.plan.priceARS : 0), 0),
    }
    const now = new Date(), end = new Date(now.getTime() + 30 * 86400000)
    const create = async (name: string, internal: boolean, status: 'ACTIVE' | 'TRIALING') => {
      const business = await prisma.business.create({ data: { name: `Metrics QA ${Date.now()} ${name}` } })
      ids.push(business.id)
      const subscription = await prisma.subscription.create({ data: {
        businessId: business.id, planCode: status === 'ACTIVE' ? 'PROFESSIONAL' : 'COMPLETE', status,
        trialStartedAt: now, trialEndsAt: end, trialConsumedAt: now, accessExpiresAt: end,
      } })
      const owner = await prisma.user.create({ data: {
        businessId: business.id, name: 'Fixture Owner', email: `${business.id}@example.test`,
        passwordHash: 'fixture-only', role: 'OWNER', platformRole: internal ? 'SUPER_ADMIN' : 'USER',
      } })
      const technician = await prisma.user.create({ data: { businessId: business.id, name: 'Fixture Technician', email: `${business.id}-tech@example.test`, passwordHash: 'fixture-only', role: 'TECHNICIAN' } })
      return { business, subscription, owner, technician }
    }
    const internal = await create('internal', true, 'ACTIVE')
    const first = await create('trial one', false, 'TRIALING')
    const second = await create('trial two', false, 'TRIALING')
    for (const status of ['PENDING', 'APPROVED', 'REJECTED'] as const) await prisma.paymentSubmission.create({ data: {
      subscriptionId: internal.subscription.id, businessId: internal.business.id, planCode: 'PROFESSIONAL',
      expectedAmount: 35000, reportedAmount: 35000, payerName: 'Fixture', transferDate: now, status,
    } })
    const token = jwt.sign({ userId: internal.owner.id, businessId: internal.business.id, role: 'OWNER', platformRole: 'SUPER_ADMIN', tokenVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: '5m' })
    const request = async (path: string, method = 'GET', body?: object) => {
      const response = await fetch(`${baseUrl}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
      assert.equal(response.status, 200, `${method} ${path}`)
      return response.json()
    }
    const snapshot = () => prisma.business.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' }, include: { users: { orderBy: { id: 'asc' } }, subscription: true, billingPayments: { orderBy: { id: 'asc' } } } })
    const fixtureBefore = await snapshot()
    const dashboard = await request('/dashboard')
    for (const [key, value] of Object.entries(base)) {
      const increase = ['clients', 'activeBusinesses', 'owners', 'technicians', 'trials'].includes(key) ? 2 : 0
      assert.equal(dashboard[key], value + increase, `commercial ${key}`)
    }
    const lifecycleTotal = (value: Record<string, number>) => Object.values(value).reduce((sum, count) => sum + count, 0)
    assert.equal(lifecycleTotal(dashboard.lifecycle), customers.filter(b => b.subscription).length + 2)
    assert.ok(!dashboard.attention.some((item: { business: { id: string } }) => item.business.id === internal.business.id))
    assert.ok(!dashboard.recentBusinesses.some((item: { id: string }) => item.id === internal.business.id))
    const businesses = await request('/businesses?pageSize=50&sort=RECENT')
    assert.equal(businesses.total, base.clients + 2)
    assert.ok(!businesses.items.some((item: { id: string }) => item.id === internal.business.id))
    for (const fixture of [first, second]) assert.ok(businesses.items.some((item: { id: string }) => item.id === fixture.business.id))
    for (const search of [internal.business.name, internal.owner.email]) {
      assert.equal((await request(`/businesses?search=${encodeURIComponent(search)}&lifecycle=ACTIVE&sort=NAME`)).total, 0)
      assert.equal((await request(`/subscriptions?search=${encodeURIComponent(search)}&status=ACTIVE`)).length, 0)
    }
    assert.equal((await request(`/businesses?search=${encodeURIComponent(first.owner.email)}&lifecycle=ACTIVE`)).total, 1)
    assert.equal((await request(`/subscriptions?search=${encodeURIComponent(first.business.name)}&status=TRIALING`)).length, 1)
    for (const query of ['', '?status=ACTIVE', '?status=TRIALING']) {
      assert.ok(!(await request(`/subscriptions${query}`)).some((item: { businessId: string }) => item.businessId === internal.business.id))
    }
    for (const query of ['', '?status=PENDING', '?status=APPROVED', '?status=REJECTED']) {
      assert.ok(!(await request(`/payments${query}`)).some((item: { businessId: string }) => item.businessId === internal.business.id))
    }
    assert.equal((await request(`/businesses/${internal.business.id}`)).id, internal.business.id)
    for (const [path, method, body] of [
      [`/businesses/${internal.business.id}/status`, 'PATCH', { isActive: false }],
      [`/businesses/${internal.business.id}/block`, 'POST', { reason: 'OTHER' }],
      [`/subscriptions/${internal.subscription.id}`, 'PATCH', { action: 'SUSPEND' }],
    ] as const) {
      const response = await fetch(`${baseUrl}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      assert.equal(response.status, 409, 'Own administrator account remains protected')
    }
    assert.deepEqual(await snapshot(), fixtureBefore, 'Read endpoints must not alter account/subscription/payment data')

    // Registered customer accounts count even when inactive, but not when soft-deleted.
    const customerUserIds = [first.owner.id, first.technician.id]
    await prisma.user.updateMany({ where: { id: { in: customerUserIds } }, data: { isActive: false } })
    assert.deepEqual(await request('/dashboard'), dashboard, 'Inactive non-deleted users still count')
    await prisma.user.update({ where: { id: first.owner.id }, data: { deletedAt: now } })
    assert.deepEqual(await request('/dashboard'), { ...dashboard, owners: dashboard.owners - 1 }, 'Only the deleted owner leaves the metrics')
    await prisma.user.update({ where: { id: first.technician.id }, data: { deletedAt: now } })
    assert.deepEqual(await request('/dashboard'), { ...dashboard, owners: dashboard.owners - 1, technicians: dashboard.technicians - 1 }, 'Only deleted users leave the metrics; other KPIs remain unchanged')
    assert.equal((await request(`/businesses?search=${encodeURIComponent(internal.business.name)}`)).total, 0, 'Internal business remains excluded')
    await prisma.user.updateMany({ where: { id: { in: customerUserIds } }, data: { isActive: true, deletedAt: null } })

    // Internal subscriptions never contribute, regardless of commercial or access status.
    for (const status of ['TRIALING', 'GRACE', 'SUSPENDED'] as const) {
      await prisma.subscription.update({ where: { id: internal.subscription.id }, data: { status, manuallyBlockedAt: now } })
      const result = await request('/dashboard')
      for (const key of ['clients', 'active', 'trials', 'grace', 'suspended', 'pendingPayments', 'estimatedMrrARS']) assert.equal(result[key], dashboard[key], key)
      assert.deepEqual(result.lifecycle, dashboard.lifecycle)
      assert.ok(!result.attention.some((item: { business: { id: string } }) => item.business.id === internal.business.id))
    }
    const paid = await create('paying customer', false, 'ACTIVE')
    const price = (await prisma.plan.findUniqueOrThrow({ where: { code: 'PROFESSIONAL' } })).priceARS
    const withPaid = await request('/dashboard')
    assert.equal(withPaid.active, base.active + 1)
    assert.equal(withPaid.estimatedMrrARS, base.estimatedMrrARS + price)
    // An inactive but non-deleted admin still identifies an internal account.
    await prisma.user.update({ where: { id: paid.owner.id }, data: { platformRole: 'SUPER_ADMIN', isActive: false } })
    await prisma.business.update({ where: { id: paid.business.id }, data: { isActive: false } })
    assert.equal((await request('/dashboard')).active, base.active)
    assert.equal((await request('/dashboard')).inactiveBusinesses, base.inactiveBusinesses)
    assert.equal((await request(`/businesses?search=${encodeURIComponent(paid.business.name)}`)).total, 0)
    // A deleted admin does not identify an internal account.
    await prisma.user.update({ where: { id: paid.owner.id }, data: { deletedAt: now } })
    assert.equal((await request('/dashboard')).active, base.active + 1)
    assert.equal((await request('/dashboard')).inactiveBusinesses, base.inactiveBusinesses + 1)
    assert.equal((await request(`/businesses?search=${encodeURIComponent(paid.business.name)}`)).total, 1)
    // A real customer payment remains visible in both default and filtered listings.
    const payment = await prisma.paymentSubmission.create({ data: { subscriptionId: first.subscription.id, businessId: first.business.id, planCode: 'COMPLETE', expectedAmount: 0, reportedAmount: 0, payerName: 'Fixture', transferDate: now } })
    for (const query of ['', '?status=PENDING']) assert.ok((await request(`/payments${query}`)).some((item: { id: string }) => item.id === payment.id))
    assert.equal((await request('/dashboard')).pendingPayments, base.pendingPayments + 1)
    console.log('platform-admin customer metrics: commercial counts/MRR/lifecycle/listings/search/detail/non-deleted admin/read-only passed (local PostgreSQL + HTTP)')
  } finally {
    await prisma.$transaction([
      prisma.paymentSubmission.deleteMany({ where: { businessId: { in: ids } } }),
      prisma.subscription.deleteMany({ where: { businessId: { in: ids } } }),
      prisma.user.deleteMany({ where: { businessId: { in: ids } } }),
      prisma.business.deleteMany({ where: { id: { in: ids } } }),
    ])
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })

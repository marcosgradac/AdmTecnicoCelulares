import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

// Fail before loading the app/Prisma; this suite must never reach a remote database.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) && database.pathname.endsWith('_test'), 'Disposable local PostgreSQL test database required')
process.env.DOTENV_CONFIG_PATH = 'tenant-isolation-no-env-file'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'tenant-isolation-local-only'
process.env.ORIGIN_AUTH_ENABLED = 'false'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '1000'
process.env.RATE_LIMIT_AUTH_MAX = '2000'
process.env.RATE_LIMIT_GLOBAL_MAX = '5000'

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { app } = await import('../src/app')
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const suffix = randomUUID()
  const businessIds: string[] = []
  let checks = 0
  const sign = (user: { id: string; businessId: string; role: string; platformRole: string; tokenVersion: number }, extra = {}) => jwt.sign({ userId: user.id, businessId: user.businessId, role: user.role, platformRole: user.platformRole, tokenVersion: user.tokenVersion, ...extra }, process.env.JWT_SECRET!)
  const request = async (token: string | undefined, method: string, path: string, body?: object) => {
    const response = await fetch(`${base}${path}`, { method, redirect: 'error', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const text = await response.text()
    return { status: response.status, text, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) as any : text }
  }
  const expect = async (token: string | undefined, method: string, path: string, status: number, body?: object) => {
    const result = await request(token, method, path, body)
    assert.equal(result.status, status, `${method} ${path}: ${result.text}`)
    checks++
    return result.body
  }
  const deviceInput = { brand: 'Synthetic', model: 'Device', purchasePrice: 100, repairExpenses: 20, estimatedSalePrice: 200, status: 'READY_FOR_SALE' }
  const productInput = { name: 'Synthetic cable', category: 'Synthetic category', purchaseCost: 100, salePrice: 200, currentStock: 10 }
  const password = 'SyntheticPassword7'
  const hash = await bcrypt.hash(password, 4)
  const createTenant = async (label: string, platformRole: 'USER' | 'SUPER_ADMIN' = 'USER') => {
    const business = await prisma.business.create({ data: { name: `Workshop-${label}-${suffix}` } })
    businessIds.push(business.id)
    const owner = await prisma.user.create({ data: { businessId: business.id, name: `Owner-${label}-${suffix}`, email: `owner-${label}-${suffix}@example.test`, role: 'OWNER', platformRole, passwordHash: hash } })
    const staff = await prisma.user.create({ data: { businessId: business.id, name: `Staff-${label}-${suffix}`, email: `staff-${label}-${suffix}@example.test`, passwordHash: hash, permissions: ['clients.view', 'repairs.view'] } })
    const now = new Date()
    const subscription = await prisma.subscription.create({ data: { businessId: business.id, planCode: 'COMPLETE', status: 'ACTIVE', trialStartedAt: now, trialEndsAt: now, trialConsumedAt: now, accessExpiresAt: new Date(now.getTime() + 30 * 86400000), currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86400000) } })
    return { business, owner, staff, subscription, token: sign(owner) }
  }
  // Full rows, not just counts: detects edits, soft deletes, partial writes and financial effects.
  const snapshot = async () => {
    const where = { businessId: { in: businessIds } }
    const orderBy = { id: 'asc' as const }
    const [businesses, users, clients, repairs, payments, cash, claims, claimExpenses, products, categories, sales, equipment, subscriptions, submissions, audits, notes, resetTokens] = await Promise.all([
      prisma.business.findMany({ where: { id: { in: businessIds } }, orderBy }),
      prisma.user.findMany({ where, orderBy }), prisma.client.findMany({ where, orderBy }),
      prisma.repair.findMany({ where, orderBy, include: { statusHistory: { orderBy }, photos: { orderBy } } }),
      prisma.payment.findMany({ where, orderBy }), prisma.cashMovement.findMany({ where, orderBy }),
      prisma.warrantyClaim.findMany({ where, orderBy }), prisma.warrantyClaimExpense.findMany({ where, orderBy }),
      prisma.commerceProduct.findMany({ where, orderBy }), prisma.commerceCategory.findMany({ where, orderBy }),
      prisma.commerceSale.findMany({ where, orderBy, include: { lines: { orderBy } } }),
      prisma.resaleDevice.findMany({ where, orderBy }), prisma.subscription.findMany({ where, orderBy }),
      prisma.paymentSubmission.findMany({ where, orderBy }), prisma.subscriptionAuditLog.findMany({ where, orderBy }),
      prisma.platformInternalNote.findMany({ where, orderBy }),
      prisma.passwordResetToken.findMany({ where: { user: where }, orderBy }),
    ])
    return { businesses, users, clients, repairs, payments, cash, claims, claimExpenses, products, categories, sales, equipment, subscriptions, submissions, audits, notes, resetTokens }
  }
  try {
    const a = await createTenant('A')
    const b = await createTenant('B')
    const admin = await createTenant('PLATFORM', 'SUPER_ADMIN')
    const fixtures = []
    for (const tenant of [a, b]) {
      // Positive controls exercise the same handlers attacked below, not bypass fixtures.
      const client = await expect(tenant.token, 'POST', '/clients', 201, { name: `Private-client-${tenant.business.id}`, phone: tenant === a ? '1100000001' : '1100000002', businessId: admin.business.id })
      assert.equal(client.businessId, tenant.business.id)
      const repair = await expect(tenant.token, 'POST', '/repairs', 201, { clientId: client.id, deviceBrand: `Private-brand-${tenant.business.id}`, deviceModel: 'Fixture', issue: 'Synthetic issue', total: tenant === a ? 1000 : 9000, businessId: admin.business.id })
      const stored = await prisma.repair.findUniqueOrThrow({ where: { id: repair.id } })
      assert.equal(stored.businessId, tenant.business.id)
      await expect(tenant.token, 'PATCH', `/clients/${client.id}`, 200, { name: client.name, phone: client.phone })
      await expect(tenant.token, 'PATCH', `/repairs/${repair.id}/edit`, 200, { diagnosis: `Private-diagnosis-${tenant.business.id}` })
      await expect(tenant.token, 'PATCH', `/repairs/${repair.id}/status/advance`, 200, { publicMessage: 'Public update', internalNote: `Private-note-${tenant.business.id}` })
      await expect(tenant.token, 'POST', `/repairs/${repair.id}/payments`, 201, { amount: tenant === a ? 100 : 900, method: 'CASH', businessId: admin.business.id })
      const category = await expect(tenant.token, 'POST', '/commerce/categories', 201, { name: `Private-category-${tenant.business.id}` })
      const product = await expect(tenant.token, 'POST', '/commerce/products', 201, { ...productInput, name: `Private-product-${tenant.business.id}`, category: category.name, businessId: admin.business.id })
      const key = randomUUID()
      const saleBody = { lines: [{ productId: product.id, quantity: 1, expectedUnitPrice: 200 }], paymentMethod: 'CASH', expectedTotal: 200, idempotencyKey: key }
      const sale = await expect(tenant.token, 'POST', '/commerce/sales', 201, saleBody)
      const device = await expect(tenant.token, 'POST', '/equipment-sales', 201, { ...deviceInput, brand: `Private-equipment-${tenant.business.id}` })
      await expect(tenant.token, 'PATCH', `/equipment-sales/${device.id}`, 200, { ...deviceInput, brand: device.brand, expectedVersion: device.version })
      const delivery = await prisma.repair.create({ data: { businessId: tenant.business.id, clientId: client.id, number: 2000, deviceBrand: 'Warranty fixture', deviceModel: 'Fixture', issue: 'Synthetic warranty', status: 'DELIVERED', deliveredAt: new Date(), warrantyEnabled: true, warrantyDurationDays: 30, warrantyStartedAt: new Date(), warrantyExpiresAt: new Date(Date.now() + 30 * 86400000), trackingToken: randomBytes(32).toString('hex'), trackingEnabled: true } })
      const claim = await expect(tenant.token, 'POST', `/warranties/${delivery.id}/claims`, 201, { description: `Private-claim-${tenant.business.id}`, initialExpense: { concept: 'Synthetic cost', amount: 30, method: 'CASH', idempotencyKey: randomUUID() } })
      await expect(tenant.token, 'POST', `/warranties/claims/${claim.id}/expenses`, 201, { concept: 'Synthetic second cost', amount: 20, method: 'CASH', idempotencyKey: randomUUID() })
      const submission = await expect(tenant.token, 'POST', '/billing/payments', 201, { planCode: 'COMPLETE', reportedAmount: 10000, payerName: `Private-payer-${tenant.business.id}`, transferDate: new Date().toISOString(), businessId: admin.business.id, subscriptionId: admin.subscription.id })
      assert.equal(submission.businessId, tenant.business.id)
      assert.equal(submission.subscriptionId, tenant.subscription.id)
      await prisma.repairPhoto.create({ data: { repairId: repair.id, url: `https://example.test/private-photo-${tenant.business.id}`, type: 'BEFORE' } })
      await prisma.passwordResetToken.create({ data: { userId: tenant.staff.id, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) } })
      fixtures.push({ ...tenant, client, repair, delivery, claim, category, product, sale, saleBody, device, submission })
    }
    const [A, B] = fixtures
    const foreignMarkers = (f: typeof A) => [f.business.id, f.owner.email, f.staff.email, f.client.name, f.product.name, f.category.name, f.device.brand, `Private-diagnosis-${f.business.id}`, `Private-note-${f.business.id}`, `private-photo-${f.business.id}`, f.submission.payerName]
    const privateReadPaths = ['/clients', '/clients?paginated=true&page=1&pageSize=1', '/clients/options', '/repairs', '/cash/movements', '/cash/movements?origin=REPAIR&groupByRepair=true', '/commerce/products', '/commerce/categories', '/commerce/sales', '/commerce/movements', '/equipment-sales', '/warranties', '/team', '/settings', '/settings/business/logo', '/profile', '/auth/me', '/billing/subscription', '/billing/payments']
    for (const [own, other] of [[A, B], [B, A]]) {
      for (const path of privateReadPaths) {
        const result = await request(own.token, 'GET', `${path}${path.includes('?') ? '&' : '?'}businessId=${other.business.id}&clientId=${other.client.id}`)
        assert.equal(result.status, 200, `${path}: ${result.text}`)
        for (const marker of foreignMarkers(other)) assert.ok(!result.text.includes(marker), `${path} leaks ${marker}`)
        checks++
      }
      for (const path of [`/clients?paginated=true&search=${other.client.name}`, `/repairs?search=${other.client.name}`, `/commerce/products?search=${other.product.name}`, `/commerce/movements?search=${other.sale.id}`, `/equipment-sales?search=${other.device.brand}`]) {
        const result = await expect(own.token, 'GET', path, 200)
        assert.equal(result.total, 0, `${path} foreign count`)
        assert.deepEqual(result.items, [], `${path} foreign rows`)
      }
      const repairs = await expect(own.token, 'GET', '/repairs', 200)
      assert.equal(repairs.total, 2)
      const products = await expect(own.token, 'GET', '/commerce/products', 200)
      assert.equal(products.total, 1)
      assert.equal((await expect(own.token, 'GET', '/commerce/summary', 200)).sales, 1)
      const cash = await expect(own.token, 'GET', '/cash/movements', 200)
      assert.deepEqual(cash.summary, { income: own === A ? 300 : 1100, expense: 170, balance: own === A ? 130 : 930, totalMovements: 6 })
      const equipment = await expect(own.token, 'GET', '/equipment-sales/summary', 200)
      assert.equal(equipment.readyForSale, 1)
      assert.equal(equipment.totalInvested, 120)
      const overview = await expect(own.token, 'GET', '/dashboard/overview', 200)
      assert.equal(overview.current.pending, own === A ? 900 : 8100)
      assert.equal(overview.modules.repairs.received, 2)
      assert.equal(overview.modules.commerce.sales, 1)
      const report = await expect(own.token, 'GET', '/reports/overview', 200)
      assert.equal(report.summary.repairsIncoming, 2)
      assert.equal(report.summary.collected, own === A ? 100 : 900)
      for (const marker of foreignMarkers(other)) assert.ok(!JSON.stringify({ overview, report }).includes(marker), 'aggregate leaks foreign data')
      const usage = await expect(own.token, 'GET', '/billing/usage', 200)
      assert.equal(usage.repairs, 2)
    }
    const before = await snapshot()
    type Attack = [string, string, object?]
    const attacks = (f: typeof A): Attack[] => [
      ['GET', `/clients/${f.client.id}`], ['PATCH', `/clients/${f.client.id}`, { name: 'Intruder' }], ['DELETE', `/clients/${f.client.id}`],
      ['GET', `/repairs/${f.repair.id}`], ['GET', `/repairs/${f.repair.id}/payments`], ['GET', `/repairs/${f.repair.id}/history`],
      ['PATCH', `/repairs/${f.repair.id}`, { deviceBrand: 'Intruder', deviceModel: 'Fixture', issue: 'Intruder issue', total: 10000 }], ['PATCH', `/repairs/${f.repair.id}/edit`, { total: 10000 }], ['DELETE', `/repairs/${f.repair.id}`],
      ['PATCH', `/repairs/${f.repair.id}/status`, { status: 'BUDGET' }], ['PATCH', `/repairs/${f.repair.id}/status/advance`, {}], ['PATCH', `/repairs/${f.repair.id}/status/rewind`, {}],
      ['PATCH', `/repairs/${f.repair.id}/approve`, {}], ['PATCH', `/repairs/${f.repair.id}/start`, {}],
      ['POST', `/repairs/${f.repair.id}/payments`, { amount: 10, method: 'CASH' }], ['PATCH', `/repairs/${f.repair.id}/advance`, { amount: 10, method: 'CASH' }], ['PATCH', `/repairs/${f.repair.id}/initial-cost`, { amount: 10, method: 'CASH' }],
      ['POST', `/repairs/${f.repair.id}/cancel`, { reviewFee: 0, refundMethod: 'CASH' }], ['POST', `/repairs/${f.repair.id}/cancellation-payment`, { amount: 10, method: 'CASH' }],
      ['POST', `/repairs/${f.delivery.id}/delivery/correction`, { reason: 'Synthetic correction' }],
      ['POST', `/repairs/${f.repair.id}/tracking-link`, {}], ['PATCH', `/repairs/${f.repair.id}/tracking-link`, { enabled: false }],
      ['PATCH', `/commerce/products/${f.product.id}`, { ...productInput, expectedStock: 9 }], ['DELETE', `/commerce/products/${f.product.id}`],
      ['PATCH', `/commerce/categories/${f.category.id}`, { name: 'Intruder' }], ['DELETE', `/commerce/categories/${f.category.id}`], ['POST', `/commerce/sales/${f.sale.id}/cancel`, {}],
      ['PATCH', `/equipment-sales/${f.device.id}`, { ...deviceInput, expectedVersion: 1 }], ['POST', `/equipment-sales/${f.device.id}/sell`, { expectedVersion: 1, actualSalePrice: 200, salePaymentMethod: 'CASH' }],
      ['PATCH', `/warranties/${f.delivery.id}`, { durationDays: 5 }], ['DELETE', `/warranties/${f.delivery.id}`],
      ['POST', `/warranties/${f.delivery.id}/claims`, { description: 'Intruder warranty', initialExpense: { concept: 'Intruder cost', amount: 5, method: 'CASH', idempotencyKey: randomUUID() } }],
      ['PATCH', `/warranties/claims/${f.claim.id}`, { status: 'RESOLVED' }], ['POST', `/warranties/claims/${f.claim.id}/expenses`, { concept: 'Intruder cost', amount: 5, method: 'CASH', idempotencyKey: randomUUID() }], ['POST', `/warranties/claims/${f.claim.id}/delivery`, { warrantyDurationDays: 5 }],
      ['GET', `/team/${f.staff.id}`], ['PATCH', `/team/${f.staff.id}`, { isActive: false }], ['DELETE', `/team/${f.staff.id}`], ['POST', `/team/${f.staff.id}/reset-password`, { password: 'IntruderPassword8' }],
    ]
    for (const [own, other] of [[A, B], [B, A]]) {
      for (const [method, path, body] of attacks(other)) {
        const result = await request(own.token, method, path, body)
        assert.equal(result.status, 404, `${method} ${path}: ${result.text}`)
        for (const marker of foreignMarkers(other)) assert.ok(!result.text.includes(marker), `${path} error leaks tenant data`)
        const absentPath = [other.client.id, other.repair.id, other.delivery.id, other.product.id, other.category.id, other.sale.id, other.device.id, other.claim.id, other.staff.id].reduce((value, id) => value.replace(id, 'nonexistent-record'), path)
        const absent = await request(own.token, method, absentPath, body)
        assert.equal(absent.status, 404, `${method} ${absentPath}: ${absent.text}`)
        assert.deepEqual(result.body, absent.body, `${path} distinguishes foreign and nonexistent records`)
        checks++
        checks++
      }
      await expect(own.token, 'POST', '/repairs', 404, { clientId: other.client.id, deviceBrand: 'Synthetic', deviceModel: 'Fixture', issue: 'Intruder association', total: 500, advanceAmount: 20, advanceMethod: 'CASH', partsCost: 10, partsCostMethod: 'CASH' })
      await expect(own.token, 'PATCH', `/repairs/${own.repair.id}`, 400, { clientId: other.client.id, deviceBrand: 'Intruder', deviceModel: 'Fixture', issue: 'Intruder issue', total: 10000 })
      await expect(own.token, 'PATCH', `/repairs/${own.repair.id}/edit`, 400, { clientId: other.client.id, advanceAmount: 20, advanceMethod: 'CASH', partsCost: 10, partsCostMethod: 'CASH' })
      const mixedSale = { lines: [{ productId: own.product.id, quantity: 1, expectedUnitPrice: 200 }, { productId: other.product.id, quantity: 1, expectedUnitPrice: 200 }], paymentMethod: 'CASH', expectedTotal: 400, idempotencyKey: randomUUID() }
      await expect(own.token, 'POST', '/commerce/sales', 404, mixedSale)
      await expect(own.token, 'POST', '/commerce/sales', 404, other.saleBody) // Same foreign idempotency key cannot replay its sale.
      await expect(own.token, 'PATCH', '/settings/business', 400, { name: 'Intruder', businessId: other.business.id })
      await expect(own.token, 'PATCH', `/team/${own.staff.id}`, 400, { businessId: other.business.id, isActive: false })
      await expect(sign(own.owner, { businessId: other.business.id }), 'GET', `/clients/${other.client.id}`, 401)
      await expect(sign(own.owner, { purpose: 'password-change' }), 'GET', '/clients', 401)
      await expect(sign(own.staff, { role: 'OWNER', platformRole: 'SUPER_ADMIN' }), 'PATCH', `/team/${other.staff.id}`, 403, { isActive: false })
      for (const path of ['/platform-admin/dashboard', '/platform-admin/businesses', `/platform-admin/businesses/${other.business.id}`, '/platform-admin/subscriptions', `/platform-admin/subscriptions/${other.subscription.id}`, '/platform-admin/payments', '/platform-admin/billing-settings', '/platform-admin/service-settings']) await expect(sign(own.owner, { platformRole: 'SUPER_ADMIN' }), 'GET', path, 403)
      for (const [path, body] of [[`/platform-admin/businesses/${other.business.id}/block`, { reason: 'OTHER' }], [`/platform-admin/payments/${other.submission.id}/approve`, {}], [`/platform-admin/payments/${other.submission.id}/reject`, { reason: 'Intruder' }]] as const) await expect(own.token, 'POST', path, 403, body)
      // Foreign financial/state races cannot claim a row or create side effects.
      await Promise.all(Array.from({ length: 4 }, () => Promise.all([
        expect(own.token, 'POST', `/repairs/${other.repair.id}/payments`, 404, { amount: 10, method: 'CASH' }),
        expect(own.token, 'POST', `/repairs/${other.repair.id}/cancel`, 404, { refundMethod: 'CASH' }),
        expect(own.token, 'PATCH', `/repairs/${other.repair.id}/status/advance`, 404, {}),
        expect(own.token, 'POST', `/commerce/sales/${other.sale.id}/cancel`, 404, {}),
      ])))
    }
    assert.deepEqual(await snapshot(), before, 'Rejected cross-tenant requests left partial changes')
    const concurrentBefore = await snapshot()
    const [legitimatePayment] = await Promise.all([
      expect(B.token, 'POST', `/repairs/${B.repair.id}/payments`, 201, { amount: 13, method: 'CASH' }),
      ...Array.from({ length: 4 }, () => expect(A.token, 'POST', `/repairs/${B.repair.id}/payments`, 404, { amount: 13, method: 'CASH' })),
    ])
    const concurrentAfter = await snapshot()
    const paidRepair = concurrentAfter.repairs.find(repair => repair.id === B.repair.id)!
    assert.equal(paidRepair.paid, 913)
    const payment = concurrentAfter.payments.find(row => row.id === legitimatePayment.id)!
    assert.ok(payment && payment.cashMovementId)
    assert.deepEqual({ businessId: payment.businessId, repairId: payment.repairId, clientId: payment.clientId, amount: payment.amount, method: payment.method }, { businessId: B.business.id, repairId: B.repair.id, clientId: B.client.id, amount: 13, method: 'CASH' })
    const movement = concurrentAfter.cash.find(row => row.id === payment.cashMovementId)!
    assert.ok(movement)
    assert.deepEqual({ businessId: movement.businessId, repairId: movement.repairId, amount: movement.amount, type: movement.type, origin: movement.origin, method: movement.method }, { businessId: B.business.id, repairId: B.repair.id, amount: 13, type: 'INCOME', origin: 'REPAIR', method: 'CASH' })
    // Remove only the two legitimate new rows and expected paid/timestamp change.
    // Every other row/field, including all of A and any orphan cash, must match.
    const priorRepair = concurrentBefore.repairs.find(repair => repair.id === B.repair.id)!
    assert.deepEqual({ ...concurrentAfter,
      payments: concurrentAfter.payments.filter(row => row.id !== payment.id),
      cash: concurrentAfter.cash.filter(row => row.id !== movement.id),
      repairs: concurrentAfter.repairs.map(row => row.id === B.repair.id ? { ...row, paid: priorRepair.paid, updatedAt: priorRepair.updatedAt } : row),
    }, concurrentBefore, 'Concurrent rejected requests changed state beyond the legitimate payment')
    // Global authority is explicit: admin reads other tenants here, never in ordinary modules.
    const global = await expect(admin.token, 'GET', `/platform-admin/businesses/${B.business.id}`, 200)
    assert.equal(global.id, B.business.id)
    assert.ok(JSON.stringify(global).includes(B.owner.email))
    assert.ok(!JSON.stringify(global).includes(hash), 'Admin response exposes password hash')
    await expect(admin.token, 'GET', `/clients/${B.client.id}`, 404)
    await expect(admin.token, 'POST', `/repairs/${B.repair.id}/payments`, 404, { amount: 1, method: 'CASH' })
    assert.deepEqual(await snapshot(), concurrentAfter, 'Admin ordinary-route rejection changed tenant state')
    const note = await expect(admin.token, 'POST', `/platform-admin/businesses/${B.business.id}/notes`, 201, { content: 'Synthetic internal note' })
    const noteBefore = await snapshot()
    await expect(admin.token, 'PATCH', `/platform-admin/businesses/${A.business.id}/notes/${note.id}`, 404, { content: 'Wrong nested parent' })
    await expect(admin.token, 'DELETE', `/platform-admin/businesses/${A.business.id}/notes/${note.id}`, 404)
    assert.deepEqual(await snapshot(), noteBefore, 'Wrong nested note parent changed state')
    // Public tokens only expose the declared projection; IDs/query parameters do not redirect it.
    for (const [own, other] of [[A, B], [B, A]]) {
      const publicResult = await expect(undefined, 'GET', `/tracking/${own.delivery.trackingToken}?businessId=${other.business.id}&repairId=${other.repair.id}`, 200)
      assert.equal(publicResult.id, own.delivery.id)
      assert.deepEqual(publicResult.client.name, '')
      assert.equal(publicResult.clientId, '')
      assert.equal(publicResult.diagnosis, null)
      assert.equal(publicResult.notes, null)
      for (const marker of foreignMarkers(other)) assert.ok(!JSON.stringify(publicResult).includes(marker))
      const privateTracking = await prisma.repair.findUniqueOrThrow({ where: { id: own.repair.id } })
      const visible = await expect(undefined, 'GET', `/tracking/${privateTracking.trackingToken}`, 200)
      assert.ok(!JSON.stringify(visible).includes(`Private-note-${own.business.id}`))
      assert.ok(!JSON.stringify(visible).includes(`private-photo-${own.business.id}`))
      await expect(undefined, 'GET', `/tracking/${other.repair.id}`, 404)
      const preview = await expect(undefined, 'GET', `/tracking-preview/${own.delivery.trackingToken}?clientSlug=foreign-slug&businessId=${other.business.id}`, 200)
      assert.ok(preview.includes(own.business.name))
      assert.ok(!preview.includes(other.business.name))
      assert.ok(!preview.includes(own.client.name))
      await prisma.repair.update({ where: { id: own.delivery.id }, data: { trackingEnabled: false } })
      await expect(undefined, 'GET', `/tracking/${own.delivery.trackingToken}`, 404)
      const disabledPreview = await expect(undefined, 'GET', `/tracking-preview/${own.delivery.trackingToken}`, 200)
      assert.ok(!disabledPreview.includes(own.business.name))
      await prisma.repair.update({ where: { id: own.delivery.id }, data: { trackingEnabled: true, trackingExpiresAt: new Date(Date.now() - 1000) } })
      const expired = await expect(undefined, 'GET', `/tracking/${own.delivery.trackingToken}`, 410)
      assert.ok(!JSON.stringify(expired).includes(own.business.id))
    }
    // Manual cash inputs cannot connect to an arbitrary repair/product/sale.
    const manual = await expect(A.token, 'POST', '/cash/movements', 201, { type: 'INCOME', origin: 'REPAIR', description: 'Synthetic manual entry', amount: 7, method: 'CASH', businessId: B.business.id, repairId: B.repair.id, commerceSaleId: B.sale.id })
    assert.equal(manual.businessId, A.business.id)
    assert.equal(manual.repairId, null)
    assert.equal(manual.commerceSaleId, null)
    assert.equal((await expect(A.token, 'GET', `/clients/${A.client.id}`, 200)).id, A.client.id)
    await expect(sign(A.staff), 'GET', `/clients/${A.client.id}`, 200)
    await expect(sign(A.staff), 'POST', '/clients', 403, { name: 'No permission' })
    // Account deletion takes its subject exclusively from verified claims; caller cannot select B.
    const { issueAccountDeletionToken } = await import('../src/modules/account/account-deletion.auth')
    const deletionToken = issueAccountDeletionToken(A.owner)
    assert.ok(deletionToken)
    const deletionBefore = await snapshot()
    await expect(deletionToken, 'DELETE', '/account', 400, { password, confirmation: 'ELIMINAR MI CUENTA', businessId: B.business.id })
    await expect(sign(A.owner, { purpose: 'account-deletion', businessId: B.business.id }), 'DELETE', '/account', 401, { password, confirmation: 'ELIMINAR MI CUENTA' })
    assert.deepEqual(await snapshot(), deletionBefore, 'Rejected account deletion changed tenant state')
    const bBeforeDelete = await prisma.business.findUniqueOrThrow({ where: { id: B.business.id } })
    await expect(deletionToken, 'DELETE', '/account', 200, { password, confirmation: 'ELIMINAR MI CUENTA' })
    assert.equal(await prisma.business.findUnique({ where: { id: A.business.id } }), null)
    assert.deepEqual(await prisma.business.findUniqueOrThrow({ where: { id: B.business.id } }), bBeforeDelete)
    assert.equal((await expect(B.token, 'GET', `/repairs/${B.repair.id}`, 200)).id, B.repair.id)
    console.log(`TENANT ISOLATION COMPLETE PASSED: ${checks} HTTP checks; two independent workshops, real PostgreSQL, full rejected-operation snapshots, concurrent attacks and explicit public/admin exceptions.`)
  } finally {
    // Only this run's synthetic businesses. Existing test data and global plans stay intact.
    const where = { businessId: { in: businessIds } }
    await prisma.$transaction(async tx => {
      await tx.warrantyClaimExpense.deleteMany({ where }); await tx.warrantyClaim.deleteMany({ where })
      await tx.payment.deleteMany({ where }); await tx.inventoryMovement.deleteMany({ where })
      await tx.repairPart.deleteMany({ where: { repair: where } }); await tx.repairPhoto.deleteMany({ where: { repair: where } }); await tx.repairStatusHistory.deleteMany({ where: { repair: where } })
      await tx.repair.deleteMany({ where }); await tx.stockItem.deleteMany({ where }); await tx.cashMovement.deleteMany({ where })
      await tx.commerceSaleLine.deleteMany({ where: { sale: where } }); await tx.commerceSale.deleteMany({ where }); await tx.commerceProduct.deleteMany({ where }); await tx.commerceCategory.deleteMany({ where }); await tx.resaleDevice.deleteMany({ where })
      await tx.device.deleteMany({ where }); await tx.client.deleteMany({ where }); await tx.paymentSubmission.deleteMany({ where }); await tx.subscriptionAuditLog.deleteMany({ where }); await tx.platformInternalNote.deleteMany({ where }); await tx.subscription.deleteMany({ where })
      await tx.passwordResetToken.deleteMany({ where: { user: where } }); await tx.user.deleteMany({ where }); await tx.business.deleteMany({ where: { id: { in: businessIds } } })
    }, { timeout: 30000 }).finally(async () => {
      await prisma.$disconnect()
      await new Promise<void>(resolve => server.close(() => resolve()))
    })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

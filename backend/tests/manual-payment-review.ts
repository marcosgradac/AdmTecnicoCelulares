import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname), 'Local PostgreSQL only')
assert.ok(database.pathname.endsWith('_test') && database.pathname !== '/tecnodesk_visual_test', 'Isolated test database required')
process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '500'

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const service = await import('../src/modules/billing/billing.service')
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const business = await prisma.business.create({ data: { name: `Payment review ${randomUUID()}` } })
  const password = 'Payment-Review-2026!'
  const admin = await prisma.user.create({ data: { businessId: business.id, name: 'Review admin', email: `${randomUUID()}@local.test`, passwordHash: await bcrypt.hash(password, 10), role: 'OWNER', platformRole: 'SUPER_ADMIN' } })
  const now = new Date('2026-10-05T15:00:00.000Z')
  const expired = new Date('2026-09-01T15:00:00.000Z')
  const subscription = await prisma.subscription.create({ data: { businessId: business.id, planCode: 'INITIAL', status: 'SUSPENDED', trialStartedAt: expired, trialEndsAt: expired, trialConsumedAt: expired, currentPeriodEnd: expired, accessExpiresAt: expired, graceEndsAt: expired, graceDaysOverride: 0 } })
  const professional = await prisma.plan.findUniqueOrThrow({ where: { code: 'PROFESSIONAL' } })
  let token = ''
  const call = async (path: string, body?: object, bearer = token) => {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, body: await response.json() as any }
  }
  const payment = () => prisma.paymentSubmission.create({ data: { businessId: business.id, subscriptionId: subscription.id, planCode: 'PROFESSIONAL', expectedAmount: professional.priceARS, reportedAmount: professional.priceARS, payerName: 'Client', transferDate: now } })
  const reset = () => prisma.subscription.update({ where: { id: subscription.id }, data: { planCode: 'INITIAL', status: 'SUSPENDED', currentPeriodEnd: expired, accessExpiresAt: expired, graceEndsAt: expired } })
  try {
    const login = await call('/auth/login', { email: admin.email, password }, '')
    assert.equal(login.status, 200); token = login.body.token
    const pending = await payment()
    assert.equal((await call(`/platform-admin/payments/${pending.id}/confirm-accreditation`)).status, 409, 'PENDING cannot use late accreditation')
    const approved = await call(`/platform-admin/payments/${pending.id}/approve`)
    assert.equal(approved.status, 200)
    assert.equal(approved.body.subscription.planCode, 'PROFESSIONAL', 'normal approval uses payment plan, not INITIAL')
    assert.equal((await call(`/platform-admin/payments/${pending.id}/confirm-accreditation`)).status, 409)
    assert.equal((await call(`/platform-admin/payments/${randomUUID()}/confirm-accreditation`)).status, 404)
    await reset()
    const rejected = await payment()
    const rejection = await call(`/platform-admin/payments/${rejected.id}/reject`, { reason: 'No acreditado todavía' })
    assert.equal(rejection.status, 200)
    assert.equal(rejection.body.status, 'REJECTED')
    const previous = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: rejected.id } })
    const blocked = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })
    assert.equal(blocked.status, 'SUSPENDED')
    assert.equal((await service.getAccountAccessStatus(blocked)).shouldBlock, true)
    assert.equal((await call(`/platform-admin/payments/${rejected.id}/approve`)).status, 409)
    assert.equal((await call(`/platform-admin/payments/${rejected.id}/confirm-accreditation`, { planCode: 'COMPLETE' })).status, 400, 'body cannot override the plan')
    const found = await call(`/platform-admin/payments/${rejected.id}/confirm-accreditation`)
    assert.equal(found.status, 200)
    assert.equal(found.body.payment.id, rejected.id)
    assert.equal(found.body.payment.status, 'APPROVED')
    assert.equal(found.body.payment.rejectionReason, null)
    assert.equal(found.body.payment.reviewedByUserId, admin.id)
    assert.equal(found.body.subscription.status, 'ACTIVE')
    assert.equal(found.body.subscription.planCode, 'PROFESSIONAL')
    assert.ok(new Date(found.body.subscription.accessExpiresAt) > new Date())
    for (const field of ['graceEndsAt', 'manuallyBlockedAt', 'manualBlockReason', 'manualBlockNote']) assert.equal(found.body.subscription[field], null)
    assert.equal(await prisma.paymentSubmission.count({ where: { businessId: business.id } }), 2, 'no new submission')
    const audits = await prisma.subscriptionAuditLog.findMany({ where: { businessId: business.id } })
    const rejectionAudit = audits.find(item => item.action === 'PAYMENT_REJECTED')!
    assert.ok(rejectionAudit)
    assert.deepEqual(rejectionAudit.metadata, { paymentId: rejected.id, planCode: 'PROFESSIONAL', rejectionReason: 'No acreditado todavía', reviewedAt: previous.reviewedAt!.toISOString() })
    const lateAudit = audits.find(item => item.action === 'PAYMENT_APPROVED_AFTER_REJECTION')!
    assert.ok(lateAudit); assert.equal(lateAudit.actorUserId, admin.id)
    assert.deepEqual(lateAudit.metadata, { paymentId: rejected.id, planCode: 'PROFESSIONAL', previousRejectionReason: 'No acreditado todavía', previousReviewedAt: previous.reviewedAt!.toISOString(), previousReviewedByUserId: admin.id, approvedAt: found.body.payment.reviewedAt, currentPeriodEnd: found.body.subscription.currentPeriodEnd })

    // Concurrent confirmations must grant one month exactly once and audit once.
    await reset()
    const concurrent = await payment()
    await call(`/platform-admin/payments/${concurrent.id}/reject`, { reason: 'No acreditado todavía' })
    const outcomes = await Promise.all([call(`/platform-admin/payments/${concurrent.id}/confirm-accreditation`), call(`/platform-admin/payments/${concurrent.id}/confirm-accreditation`)])
    assert.deepEqual(outcomes.map(item => item.status).sort(), [200, 409])
    const success = outcomes.find(item => item.status === 200)!
    const renewed = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })
    assert.equal(renewed.currentPeriodEnd!.toISOString(), success.body.subscription.currentPeriodEnd)
    assert.equal(await prisma.subscriptionAuditLog.count({ where: { businessId: business.id, action: 'PAYMENT_APPROVED_AFTER_REJECTION' } }), 2)

    // Null legacy review fields remain explicit nulls; future/trial and expired bases agree with normal approval.
    for (const [status, end, expectedStart, expectedEnd] of [
      ['TRIALING', '2026-10-31T15:00:00.000Z', '2026-10-31T15:00:00.000Z', '2026-11-30T15:00:00.000Z'],
      ['ACTIVE', '2026-12-31T15:00:00.000Z', '2026-12-31T15:00:00.000Z', '2027-01-31T15:00:00.000Z'],
      ['SUSPENDED', expired.toISOString(), now.toISOString(), '2026-11-05T15:00:00.000Z'],
    ] as const) {
      await prisma.subscription.update({ where: { id: subscription.id }, data: { status, planCode: 'INITIAL', trialEndsAt: new Date(end), currentPeriodEnd: new Date(end), manuallyBlockedAt: expired, manualBlockReason: 'OTHER', manualBlockNote: 'Old block' } })
      const legacy = await payment()
      await prisma.paymentSubmission.update({ where: { id: legacy.id }, data: { status: 'REJECTED' } })
      const result = await service.confirmRejectedPaymentAccreditation(legacy.id, admin.id, now)
      assert.equal(result.subscription.currentPeriodStart!.toISOString(), expectedStart)
      assert.equal(result.subscription.currentPeriodEnd!.toISOString(), expectedEnd)
      assert.equal(result.subscription.planCode, 'PROFESSIONAL')
      assert.equal(result.subscription.manuallyBlockedAt, null)
      const audit = await prisma.subscriptionAuditLog.findFirstOrThrow({ where: { businessId: business.id, action: 'PAYMENT_APPROVED_AFTER_REJECTION', metadata: { path: ['paymentId'], equals: legacy.id } } })
      for (const field of ['previousRejectionReason', 'previousReviewedAt', 'previousReviewedByUserId']) assert.equal((audit.metadata as Record<string, unknown>)[field], null)
    }
    assert.equal((await call(`/platform-admin/payments/${rejected.id}/confirm-accreditation`, undefined, '')).status, 401)
    const owner = await prisma.user.create({ data: { businessId: business.id, name: 'Owner', email: `${randomUUID()}@local.test`, passwordHash: await bcrypt.hash(password, 10), role: 'OWNER' } })
    const ownerLogin = await call('/auth/login', { email: owner.email, password }, '')
    assert.equal(ownerLogin.status, 200)
    assert.equal((await call(`/platform-admin/payments/${rejected.id}/confirm-accreditation`, undefined, ownerLogin.body.token)).status, 403)
    console.log('MANUAL PAYMENT REVIEW PASSED: normal approval, rejected accreditation, audit, invalid states/body, concurrency, null history, temporal bases and Super Admin protection')
  } finally {
    await prisma.$transaction([
      prisma.subscriptionAuditLog.deleteMany({ where: { businessId: business.id } }),
      prisma.paymentSubmission.deleteMany({ where: { businessId: business.id } }),
      prisma.subscription.deleteMany({ where: { businessId: business.id } }),
      prisma.user.deleteMany({ where: { businessId: business.id } }),
      prisma.business.delete({ where: { id: business.id } }),
    ])
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

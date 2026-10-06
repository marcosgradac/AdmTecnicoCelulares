import 'dotenv/config'
import assert from 'node:assert/strict'

// Guard before importing Prisma: this test may only write to an isolated local DB.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['postgres:', 'postgresql:'].includes(database.protocol))
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname))
assert.ok(database.pathname.endsWith('_test') && database.pathname !== '/tecnodesk_visual_test')

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { ensureSubscription, calculateAccountAccessStatus, addDays, TRIAL_DAYS } = await import('../src/modules/billing/billing.service')
  const now = new Date('2026-10-06T15:00:00.000Z')
  const expectedEnd = new Date('2026-11-05T15:00:00.000Z')
  const settings = { expirationWarningDays: 7, defaultGraceDays: 5 }
  const businesses: string[] = []
  try {
    const business = await prisma.business.create({ data: { name: 'Fallback trial test' } })
    businesses.push(business.id)
    assert.equal(await prisma.subscription.count({ where: { businessId: business.id } }), 0)
    const trial = await ensureSubscription(business.id, now)
    assert.equal(TRIAL_DAYS, 30)
    assert.equal(trial.status, 'TRIALING')
    assert.equal(trial.planCode, 'COMPLETE')
    assert.equal(trial.trialStartedAt.getTime(), now.getTime())
    assert.equal(trial.trialConsumedAt.getTime(), now.getTime())
    assert.equal(trial.trialEndsAt.getTime(), expectedEnd.getTime())
    assert.equal(trial.accessExpiresAt?.getTime(), expectedEnd.getTime(), 'fallback access must expire exactly with trial')
    const statuses = [now, new Date(expectedEnd.getTime() + 1), new Date(addDays(expectedEnd, 5).getTime() + 1)]
      .map(clock => calculateAccountAccessStatus(trial, settings, clock).status)
    assert.deepEqual(statuses, ['ACTIVE', 'GRACE', 'BLOCKED'])
    const again = await ensureSubscription(business.id, addDays(now, 60))
    assert.deepEqual(again, trial, 'later call must return the unchanged subscription, including all trial dates')
    assert.equal(await prisma.subscription.count({ where: { businessId: business.id } }), 1)

    const manual = await prisma.business.create({ data: { name: 'Intentional no expiry test' } })
    businesses.push(manual.id)
    const existing = await prisma.subscription.create({ data: { businessId: manual.id, planCode: 'COMPLETE', status: 'ACTIVE', trialStartedAt: now, trialConsumedAt: now, trialEndsAt: expectedEnd, accessExpiresAt: null }, include: { plan: true } })
    const preserved = await ensureSubscription(manual.id, addDays(now, 60))
    assert.deepEqual(preserved, existing, 'existing null expiry must remain untouched')
    assert.equal(preserved.accessExpiresAt, null)
    assert.equal(calculateAccountAccessStatus(preserved, settings, addDays(now, 60)).status, 'NO_EXPIRY')
    assert.equal(await prisma.subscription.count({ where: { businessId: manual.id } }), 1)
    console.log('SUBSCRIPTION FALLBACK PASSED: fixed 30-day trial, exact expiry, ACTIVE/GRACE/BLOCKED, idempotency and existing NO_EXPIRY preserved')
  } finally {
    for (const businessId of businesses) {
      await prisma.subscription.deleteMany({ where: { businessId } })
      await prisma.business.delete({ where: { id: businessId } })
    }
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

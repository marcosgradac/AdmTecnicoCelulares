import 'dotenv/config'
import assert from 'node:assert/strict'
import type { Subscription } from '@prisma/client'
import {
  calculateAccountAccessStatus,
  getBillingLifecycleSettings,
  invalidateBillingLifecycleSettingsCache,
} from '../src/modules/billing/billing.service'
import { validRegistrationPayload } from './helpers/registration'

process.env.NODE_ENV = 'test'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

let app: typeof import('../src/server').app
let prisma: typeof import('../src/lib/prisma').prisma

const now = new Date('2026-08-24T15:00:00.000Z')
const base = {
  id: 'performance-access', businessId: 'performance-access', planCode: 'COMPLETE', status: 'ACTIVE',
  trialStartedAt: now, trialEndsAt: now, trialConsumedAt: now, currentPeriodStart: null,
  currentPeriodEnd: null, graceEndsAt: null, accessExpiresAt: null, graceDaysOverride: null,
  manuallyBlockedAt: null, manualBlockReason: null, manualBlockNote: null, createdAt: now, updatedAt: now,
} satisfies Subscription
const settings = { expirationWarningDays: 7, defaultGraceDays: 5 }

const request = async (base: string, method: string, path: string, body?: object, token?: string) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) as Record<string, unknown> : null }
}

async function assertServiceSettingsInvalidatesCachedLifecycleSettings() {
  const original = await prisma.billingSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
    select: { expirationWarningDays: true, defaultGraceDays: true },
  })
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}/api`
  const suffix = Date.now()
  let businessId = ''

  try {
    invalidateBillingLifecycleSettingsCache()
    const cached = await getBillingLifecycleSettings()
    assert.deepEqual(cached, original)
    const next = {
      expirationWarningDays: cached.expirationWarningDays === 60 ? 59 : cached.expirationWarningDays + 1,
      defaultGraceDays: cached.defaultGraceDays === 60 ? 59 : cached.defaultGraceDays + 1,
    }
    const registration = await request(baseUrl, 'POST', '/auth/register', validRegistrationPayload({
      businessName: `Performance access ${suffix}`,
      firstName: 'Performance',
      lastName: 'Admin',
      email: `performance-access-${suffix}@example.com`,
      password: 'Performance-2026!',
    }))
    assert.equal(registration.status, 201)
    const user = registration.body?.user as { id: string, business: { id: string } }
    const token = registration.body?.token as string
    businessId = user.business.id
    await prisma.user.update({ where: { id: user.id }, data: { platformRole: 'SUPER_ADMIN' } })

    const update = await request(baseUrl, 'PATCH', '/platform-admin/service-settings', next, token)
    assert.equal(update.status, 200)
    assert.equal(update.body?.expirationWarningDays, next.expirationWarningDays)
    assert.equal(update.body?.defaultGraceDays, next.defaultGraceDays)
    assert.deepEqual(await getBillingLifecycleSettings(), next)
    console.log('performance access: service settings cache invalidation passed')
  } finally {
    await prisma.billingSettings.upsert({ where: { id: 'default' }, create: { id: 'default', ...original }, update: original })
    invalidateBillingLifecycleSettingsCache()
    if (businessId) await prisma.$transaction([
      prisma.subscription.deleteMany({ where: { businessId } }),
      prisma.user.deleteMany({ where: { businessId } }),
      prisma.business.deleteMany({ where: { id: businessId } }),
    ])
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

async function run() {
  ;({ app } = await import('../src/server'))
  ;({ prisma } = await import('../src/lib/prisma'))
  const active = { ...base, accessExpiresAt: new Date('2026-09-10T15:00:00.000Z') }
  const manuallyBlocked = { ...base, manuallyBlockedAt: now, manualBlockReason: 'ADMINISTRATIVE' }
  const expired = { ...base, accessExpiresAt: new Date('2026-08-23T15:00:00.000Z') }
  assert.equal(calculateAccountAccessStatus(active, settings, now).status, 'ACTIVE')
  assert.equal(calculateAccountAccessStatus(manuallyBlocked, settings, now).shouldBlock, true)
  assert.equal(calculateAccountAccessStatus(expired, settings, now).status, 'GRACE')

  invalidateBillingLifecycleSettingsCache()
  const originalFindUnique = prisma.billingSettings.findUnique
  let settingsQueries = 0
  prisma.billingSettings.findUnique = ((...args: Parameters<typeof originalFindUnique>) => {
    settingsQueries += 1
    return originalFindUnique(...args)
  }) as typeof originalFindUnique
  try {
    const lifecycleSettings = await getBillingLifecycleSettings()
    await getBillingLifecycleSettings()
    assert.equal(settingsQueries, 1)
    const fixtures = [active, manuallyBlocked, expired]
    const accessStatuses = fixtures.map(subscription => calculateAccountAccessStatus(subscription, lifecycleSettings, now))
    assert.deepEqual(accessStatuses.map(access => access.status), ['ACTIVE', 'BLOCKED', 'GRACE'])
    assert.equal(settingsQueries, 1)
    invalidateBillingLifecycleSettingsCache()
    await getBillingLifecycleSettings()
    assert.equal(settingsQueries, 2)
    console.log('performance access: calculation and lifecycle settings cache passed')
  } finally {
    prisma.billingSettings.findUnique = originalFindUnique
  }
  await assertServiceSettingsInvalidatesCachedLifecycleSettings()
}

run().finally(() => prisma.$disconnect())

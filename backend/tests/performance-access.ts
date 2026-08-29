import 'dotenv/config'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
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

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolver => { resolve = resolver })
  return { promise, resolve }
}

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

async function assertConcurrentLifecycleLoadsAreCoalesced() {
  invalidateBillingLifecycleSettingsCache()
  const originalFindUnique = prisma.billingSettings.findUnique
  const query = deferred<{ expirationWarningDays: number, defaultGraceDays: number } | null>()
  let settingsQueries = 0
  prisma.billingSettings.findUnique = (() => {
    settingsQueries += 1
    return query.promise
  }) as typeof originalFindUnique
  try {
    const first = getBillingLifecycleSettings()
    const second = getBillingLifecycleSettings()
    assert.equal(settingsQueries, 1, 'concurrent cold loads share one BillingSettings query')
    query.resolve({ expirationWarningDays: 11, defaultGraceDays: 6 })
    assert.deepEqual(await Promise.all([first, second]), [
      { expirationWarningDays: 11, defaultGraceDays: 6 },
      { expirationWarningDays: 11, defaultGraceDays: 6 },
    ])
  } finally {
    prisma.billingSettings.findUnique = originalFindUnique
    invalidateBillingLifecycleSettingsCache()
  }
}

async function assertInvalidationDuringLoadCannotPublishStaleSettings() {
  invalidateBillingLifecycleSettingsCache()
  const originalFindUnique = prisma.billingSettings.findUnique
  const staleQuery = deferred<{ expirationWarningDays: number, defaultGraceDays: number } | null>()
  const freshQuery = deferred<{ expirationWarningDays: number, defaultGraceDays: number } | null>()
  let settingsQueries = 0
  prisma.billingSettings.findUnique = (() => {
    settingsQueries += 1
    return settingsQueries === 1 ? staleQuery.promise : freshQuery.promise
  }) as typeof originalFindUnique
  try {
    const staleLoad = getBillingLifecycleSettings()
    invalidateBillingLifecycleSettingsCache()
    const freshLoad = getBillingLifecycleSettings()
    freshQuery.resolve({ expirationWarningDays: 13, defaultGraceDays: 8 })
    assert.deepEqual(await freshLoad, { expirationWarningDays: 13, defaultGraceDays: 8 })
    staleQuery.resolve({ expirationWarningDays: 2, defaultGraceDays: 1 })
    assert.deepEqual(await staleLoad, { expirationWarningDays: 2, defaultGraceDays: 1 })
    assert.deepEqual(
      await getBillingLifecycleSettings(),
      { expirationWarningDays: 13, defaultGraceDays: 8 },
      'a pre-invalidation read cannot repopulate the cache after a newer read',
    )
    assert.equal(settingsQueries, 2)
  } finally {
    prisma.billingSettings.findUnique = originalFindUnique
    invalidateBillingLifecycleSettingsCache()
  }
}

async function assertSuperAdminAuthenticationSkipsLifecycleSettings() {
  invalidateBillingLifecycleSettingsCache()
  const originalUserFindUnique = prisma.user.findUnique
  const originalSettingsFindUnique = prisma.billingSettings.findUnique
  let settingsQueries = 0
  prisma.user.findUnique = (async () => ({
    id: 'super-admin-user', businessId: base.businessId, role: 'OWNER', platformRole: 'SUPER_ADMIN', isActive: true,
    tokenVersion: 0, permissions: [], business: { isActive: true, subscription: base },
  })) as typeof originalUserFindUnique
  prisma.billingSettings.findUnique = (async () => {
    settingsQueries += 1
    return settings
  }) as typeof originalSettingsFindUnique
  try {
    const { authenticate } = await import('../src/middlewares/auth')
    const token = jwt.sign({ userId: 'super-admin-user', businessId: base.businessId, role: 'OWNER', platformRole: 'SUPER_ADMIN', tokenVersion: 0 }, process.env.JWT_SECRET!)
    const req = { headers: { authorization: `Bearer ${token}` } } as Request
    const res = {
      status() { return this },
      json() { return this },
    } as unknown as Response
    let nextCalls = 0
    await authenticate(req, res, (() => { nextCalls += 1 }) as NextFunction)
    assert.equal(nextCalls, 1)
    assert.equal(settingsQueries, 0, 'SUPER_ADMIN authentication does not load lifecycle settings')
    assert.equal(req.accountAccess, null, 'SUPER_ADMIN authentication attaches the exempt account access value')
  } finally {
    prisma.user.findUnique = originalUserFindUnique
    prisma.billingSettings.findUnique = originalSettingsFindUnique
    invalidateBillingLifecycleSettingsCache()
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
  await assertConcurrentLifecycleLoadsAreCoalesced()
  await assertInvalidationDuringLoadCannotPublishStaleSettings()
  await assertSuperAdminAuthenticationSkipsLifecycleSettings()
  await assertServiceSettingsInvalidatesCachedLifecycleSettings()
}

run().finally(() => prisma.$disconnect())

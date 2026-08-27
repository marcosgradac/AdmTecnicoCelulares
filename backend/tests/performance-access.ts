import 'dotenv/config'
import assert from 'node:assert/strict'
import type { Subscription } from '@prisma/client'
import {
  calculateAccountAccessStatus,
  getBillingLifecycleSettings,
  invalidateBillingLifecycleSettingsCache,
} from '../src/modules/billing/billing.service'
import { prisma } from '../src/lib/prisma'

const now = new Date('2026-08-24T15:00:00.000Z')
const base = {
  id: 'performance-access', businessId: 'performance-access', planCode: 'COMPLETE', status: 'ACTIVE',
  trialStartedAt: now, trialEndsAt: now, trialConsumedAt: now, currentPeriodStart: null,
  currentPeriodEnd: null, graceEndsAt: null, accessExpiresAt: null, graceDaysOverride: null,
  manuallyBlockedAt: null, manualBlockReason: null, manualBlockNote: null, createdAt: now, updatedAt: now,
} satisfies Subscription
const settings = { expirationWarningDays: 7, defaultGraceDays: 5 }

async function run() {
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
    await getBillingLifecycleSettings()
    await getBillingLifecycleSettings()
    assert.equal(settingsQueries, 1)
    invalidateBillingLifecycleSettingsCache()
    await getBillingLifecycleSettings()
    assert.equal(settingsQueries, 2)
    console.log('performance access: calculation and lifecycle settings cache passed')
  } finally {
    prisma.billingSettings.findUnique = originalFindUnique
  }
}

run().finally(() => prisma.$disconnect())

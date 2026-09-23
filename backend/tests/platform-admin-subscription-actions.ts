import assert from 'node:assert/strict'
import type { Prisma, Subscription } from '@prisma/client'
import { buildCourtesyDaysUpdate, buildReactivateSubscriptionUpdate, buildSuspendSubscriptionUpdate, calculateAccountAccessStatus } from '../src/modules/billing/billing.service'

const now = new Date('2026-09-22T15:00:00.000Z')
const at = (days: number) => new Date(now.getTime() + days * 86_400_000)
const settings = { expirationWarningDays: 7, defaultGraceDays: 5 }

const base = {
  id: 'qa', businessId: 'qa', planCode: 'COMPLETE', status: 'ACTIVE',
  trialStartedAt: at(-40), trialEndsAt: at(-10), trialConsumedAt: at(-40),
  currentPeriodStart: at(-10), currentPeriodEnd: at(20),
  graceEndsAt: null, accessExpiresAt: at(20), graceDaysOverride: null,
  manuallyBlockedAt: null, manualBlockReason: null, manualBlockNote: null,
  createdAt: at(-40), updatedAt: at(-40),
} satisfies Subscription

const apply = (subscription: Subscription, update: Prisma.SubscriptionUpdateInput) => ({ ...subscription, ...update }) as Subscription
const access = (subscription: Subscription) => calculateAccountAccessStatus(subscription, settings, now)

function run() {
  // SUSPEND bloquea el acceso real vía bloqueo manual, no solo el status
  const suspendUpdate = buildSuspendSubscriptionUpdate(now)
  assert.equal(suspendUpdate.status, 'SUSPENDED')
  const suspended = apply(base, suspendUpdate)
  const suspendedAccess = access(suspended)
  assert.equal(suspendedAccess.status, 'BLOCKED')
  assert.equal(suspendedAccess.shouldBlock, true)
  assert.equal(suspendedAccess.blockType, 'MANUAL')
  assert.equal(suspendedAccess.blockReason, 'ADMINISTRATIVE')

  // REACTIVATE restaura acceso real: 30 días desde hoy, vencimiento alineado y bloqueos limpios
  const reactivateUpdate = buildReactivateSubscriptionUpdate(now)
  assert.equal(reactivateUpdate.status, 'ACTIVE')
  assert.equal((reactivateUpdate.currentPeriodStart as Date).getTime(), now.getTime())
  assert.equal((reactivateUpdate.accessExpiresAt as Date).getTime(), (reactivateUpdate.currentPeriodEnd as Date).getTime())
  assert.equal(reactivateUpdate.graceEndsAt, null)
  const reactivated = apply(suspended, reactivateUpdate)
  assert.equal(reactivated.manuallyBlockedAt, null)
  const reactivatedAccess = access(reactivated)
  assert.equal(reactivatedAccess.status, 'ACTIVE')
  assert.equal(reactivatedAccess.shouldBlock, false)
  assert.equal(reactivatedAccess.daysRemaining, 30)

  // Días de cortesía sobre suscripción activa: extienden desde el vencimiento vigente
  const courtesyActive = buildCourtesyDaysUpdate(base, 7, now)
  assert.equal((courtesyActive.accessExpiresAt as Date).getTime(), at(27).getTime())
  assert.equal((courtesyActive.currentPeriodEnd as Date).getTime(), at(27).getTime())
  assert.equal(courtesyActive.trialEndsAt, undefined)
  assert.equal(access(apply(base, courtesyActive)).daysRemaining, 27)

  // Días de cortesía sobre cuenta vencida/en gracia: cuentan desde hoy y limpian la gracia
  const expired = { ...base, currentPeriodEnd: at(-2), accessExpiresAt: at(-2), graceEndsAt: at(3), status: 'GRACE' } as Subscription
  assert.equal(access(expired).status, 'GRACE')
  const courtesyExpired = buildCourtesyDaysUpdate(expired, 10, now)
  assert.equal((courtesyExpired.accessExpiresAt as Date).getTime(), at(10).getTime())
  assert.equal(courtesyExpired.graceEndsAt, null)
  assert.equal(courtesyExpired.status, 'ACTIVE')
  assert.equal(access(apply(expired, courtesyExpired)).status, 'ACTIVE')

  // Días de cortesía sobre trial vigente: extienden el trial sin romperlo
  const trialing = { ...base, status: 'TRIALING', currentPeriodStart: null, currentPeriodEnd: null, trialEndsAt: at(15), accessExpiresAt: at(15) } as Subscription
  const courtesyTrial = buildCourtesyDaysUpdate(trialing, 5, now)
  assert.equal((courtesyTrial.trialEndsAt as Date).getTime(), at(20).getTime())
  assert.equal((courtesyTrial.accessExpiresAt as Date).getTime(), at(20).getTime())
  assert.equal(courtesyTrial.status, undefined)
  const extendedTrial = apply(trialing, courtesyTrial)
  assert.equal(extendedTrial.status, 'TRIALING')
  assert.equal(extendedTrial.trialConsumedAt?.getTime(), at(-40).getTime())
  assert.equal(access(extendedTrial).shouldBlock, false)

  // Días de cortesía sobre cuenta suspendida: levantan el bloqueo y restauran el acceso
  const courtesySuspended = buildCourtesyDaysUpdate(suspended, 15, now)
  const reactivatedByCourtesy = apply(suspended, courtesySuspended)
  assert.equal(reactivatedByCourtesy.manuallyBlockedAt, null)
  assert.equal(access(reactivatedByCourtesy).shouldBlock, false)

  // graceDaysOverride = 0 es un override válido: sin gracia, bloqueo inmediato al vencer
  const noGrace = { ...base, accessExpiresAt: at(-1), graceDaysOverride: 0 } as Subscription
  const noGraceAccess = access(noGrace)
  assert.equal(noGraceAccess.graceDays, 0)
  assert.equal(noGraceAccess.status, 'BLOCKED')
  assert.equal(noGraceAccess.shouldBlock, true)
  const withGrace = { ...base, accessExpiresAt: at(-1), graceDaysOverride: 3 } as Subscription
  assert.equal(access(withGrace).status, 'GRACE')

  console.log('platform-admin subscription actions: 8 escenarios correctos')
}

run()

import { type PlanCode, type Prisma, type Subscription } from '@prisma/client'
import { prisma } from '../../lib/prisma'

export const TRIAL_DAYS = 30
export const GRACE_DAYS = 5
export type AccountAccessStatusCode = 'NO_EXPIRY' | 'ACTIVE' | 'EXPIRING' | 'GRACE' | 'BLOCKED'
const DAY_MS = 86_400_000
const daysBetween = (future: Date, now: Date) => Math.max(0, Math.ceil((future.getTime() - now.getTime()) / DAY_MS))

export async function getAccountAccessStatus(subscription: Subscription, now = new Date()) {
  const settings = await prisma.billingSettings.findUnique({ where: { id: 'default' }, select: { expirationWarningDays: true, defaultGraceDays: true } })
  const warningDays = settings?.expirationWarningDays ?? 7
  const graceDays = subscription.graceDaysOverride ?? settings?.defaultGraceDays ?? GRACE_DAYS
  const expiresAt = subscription.accessExpiresAt
  const graceEndsAt = expiresAt ? addDays(expiresAt, graceDays) : null
  if (subscription.manuallyBlockedAt) return { status: 'BLOCKED' as const, expiresAt, graceEndsAt, warningDays, graceDays, daysRemaining: 0, graceDaysRemaining: 0, shouldBlock: true, blockType: 'MANUAL' as const, blockedAt: subscription.manuallyBlockedAt, blockReason: subscription.manualBlockReason, blockNote: subscription.manualBlockNote }
  if (!expiresAt) return { status: 'NO_EXPIRY' as const, expiresAt: null, graceEndsAt: null, warningDays, graceDays, daysRemaining: null, graceDaysRemaining: null, shouldBlock: false, blockType: null, blockedAt: null, blockReason: null, blockNote: null }
  if (now <= expiresAt) { const daysRemaining = daysBetween(expiresAt, now); return { status: daysRemaining <= warningDays ? 'EXPIRING' as const : 'ACTIVE' as const, expiresAt, graceEndsAt, warningDays, graceDays, daysRemaining, graceDaysRemaining: 0, shouldBlock: false, blockType: null, blockedAt: null, blockReason: null, blockNote: null } }
  if (graceEndsAt && now <= graceEndsAt) return { status: 'GRACE' as const, expiresAt, graceEndsAt, warningDays, graceDays, daysRemaining: 0, graceDaysRemaining: Math.max(1, daysBetween(graceEndsAt, now)), shouldBlock: false, blockType: null, blockedAt: null, blockReason: null, blockNote: null }
  return { status: 'BLOCKED' as const, expiresAt, graceEndsAt, warningDays, graceDays, daysRemaining: 0, graceDaysRemaining: 0, shouldBlock: true, blockType: 'AUTOMATIC' as const, blockedAt: graceEndsAt, blockReason: 'SUBSCRIPTION_EXPIRED', blockNote: null }
}

export async function getBusinessAccessStatus(businessId: string, now = new Date()) {
  const subscription = await prisma.subscription.findUnique({ where: { businessId } })
  return subscription ? getAccountAccessStatus(subscription, now) : null
}

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000)
export const addBillingMonth = (date: Date) => {
  const result = new Date(date)
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + 1)
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}

export const PLAN_ENTITLEMENTS = {
  INITIAL: { repairLimitPerPeriod: 40, trackingLimitPerPeriod: 10, dashboardComplete: false, advancedReports: false },
  PROFESSIONAL: { repairLimitPerPeriod: 150, trackingLimitPerPeriod: null, dashboardComplete: true, advancedReports: true },
  COMPLETE: { repairLimitPerPeriod: null, trackingLimitPerPeriod: null, dashboardComplete: true, advancedReports: true },
} as const satisfies Record<PlanCode, object>

export async function ensureSubscription(businessId: string, now = new Date()) {
  const existing = await prisma.subscription.findUnique({ where: { businessId }, include: { plan: true } })
  if (existing) return existing
  return prisma.subscription.create({
    data: { businessId, planCode: 'COMPLETE', status: 'TRIALING', trialStartedAt: now, trialEndsAt: addDays(now, TRIAL_DAYS), trialConsumedAt: now },
    include: { plan: true },
  })
}

export async function refreshSubscriptionStatus(businessId: string, now = new Date()) {
  const subscription = await ensureSubscription(businessId, now)
  let status = subscription.status
  let graceEndsAt = subscription.graceEndsAt
  const end = status === 'TRIALING' ? subscription.trialEndsAt : subscription.currentPeriodEnd
  if ((status === 'TRIALING' || status === 'ACTIVE') && end && now >= end) {
    status = 'GRACE'
    graceEndsAt = addDays(end, GRACE_DAYS)
  }
  if ((status === 'GRACE' || status === 'PAST_DUE') && graceEndsAt && now >= graceEndsAt) status = 'SUSPENDED'
  if (status !== subscription.status || graceEndsAt?.getTime() !== subscription.graceEndsAt?.getTime()) {
    return prisma.subscription.update({ where: { id: subscription.id }, data: { status, graceEndsAt }, include: { plan: true } })
  }
  return subscription
}

const periodBounds = (subscription: Subscription) => ({
  start: subscription.status === 'TRIALING' ? subscription.trialStartedAt : subscription.currentPeriodStart ?? subscription.trialStartedAt,
  end: subscription.status === 'TRIALING' ? subscription.trialEndsAt : subscription.currentPeriodEnd ?? new Date(),
})

export async function subscriptionUsage(businessId: string) {
  const subscription = await refreshSubscriptionStatus(businessId)
  const bounds = periodBounds(subscription)
  const [repairs, trackingLinks] = await Promise.all([
    prisma.repair.count({ where: { businessId, createdAt: { gte: bounds.start, lt: bounds.end } } }),
    prisma.repair.count({ where: { businessId, trackingCreatedAt: { gte: bounds.start, lt: bounds.end } } }),
  ])
  const retainsTrialAccess = subscription.trialEndsAt > new Date() && (!subscription.currentPeriodStart || subscription.currentPeriodStart >= subscription.trialEndsAt)
  const entitlements = subscription.status === 'TRIALING' || retainsTrialAccess ? PLAN_ENTITLEMENTS.COMPLETE : PLAN_ENTITLEMENTS[subscription.planCode]
  return { repairs, trackingLinks, entitlements, periodStart: bounds.start, periodEnd: bounds.end }
}

export async function assertWithinLimit(businessId: string, resource: 'repairs' | 'trackingLinks') {
  const usage = await subscriptionUsage(businessId)
  const limit = resource === 'repairs' ? usage.entitlements.repairLimitPerPeriod : usage.entitlements.trackingLimitPerPeriod
  if (limit !== null && usage[resource] >= limit) {
    const label = resource === 'repairs' ? 'reparaciones' : 'links de seguimiento'
    throw Object.assign(new Error(`Alcanzaste el límite de ${limit} ${label} de tu plan.`), { statusCode: 409 })
  }
  return usage
}

export async function assertFeatureAccess(businessId: string, feature: 'dashboardComplete' | 'advancedReports') {
  const { entitlements } = await subscriptionUsage(businessId)
  if (!entitlements[feature]) throw Object.assign(new Error('Esta función no está incluida en tu plan.'), { statusCode: 403 })
}

export async function approvePayment(paymentId: string, actorUserId: string, now = new Date()) {
  return prisma.$transaction(async tx => {
    const payment = await tx.paymentSubmission.findUnique({ where: { id: paymentId }, include: { subscription: true } })
    if (!payment) throw Object.assign(new Error('Pago no encontrado'), { statusCode: 404 })
    if (payment.status !== 'PENDING') throw Object.assign(new Error('Este pago ya fue procesado.'), { statusCode: 409 })
    const baseCandidate = payment.subscription.status === 'TRIALING' ? payment.subscription.trialEndsAt : payment.subscription.currentPeriodEnd
    const billingBase = baseCandidate && baseCandidate > now ? baseCandidate : now
    const currentPeriodEnd = addBillingMonth(billingBase)
    const updated = await tx.paymentSubmission.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'APPROVED', reviewedByUserId: actorUserId, reviewedAt: now, rejectionReason: null } })
    if (updated.count !== 1) throw Object.assign(new Error('Este pago ya fue procesado.'), { statusCode: 409 })
    const subscription = await tx.subscription.update({ where: { id: payment.subscriptionId }, data: { status: 'ACTIVE', planCode: payment.planCode, currentPeriodStart: billingBase, currentPeriodEnd, accessExpiresAt: currentPeriodEnd, graceEndsAt: null, manuallyBlockedAt: null, manualBlockReason: null, manualBlockNote: null } })
    await tx.subscriptionAuditLog.create({ data: { actorUserId, businessId: payment.businessId, action: 'PAYMENT_APPROVED', metadata: { paymentId, planCode: payment.planCode, currentPeriodEnd } as Prisma.InputJsonValue } })
    return { payment: await tx.paymentSubmission.findUnique({ where: { id: payment.id } }), subscription }
  })
}

export const serializeSubscription = async (businessId: string) => {
  const subscription = await refreshSubscriptionStatus(businessId)
  const usage = await subscriptionUsage(businessId)
  const now = new Date()
  const end = subscription.status === 'TRIALING' ? subscription.trialEndsAt : subscription.currentPeriodEnd
  const daysRemaining = end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000)) : 0
  const pendingPayment = await prisma.paymentSubmission.findFirst({ where: { businessId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, select: { id: true, planCode: true, createdAt: true } })
  const effectivePlanCode = subscription.status === 'TRIALING' || (subscription.trialEndsAt > now && (!subscription.currentPeriodStart || subscription.currentPeriodStart >= subscription.trialEndsAt)) ? 'COMPLETE' : subscription.planCode
  return { ...subscription, effectivePlanCode, daysRemaining, access: await getAccountAccessStatus(subscription), usage, pendingPayment }
}

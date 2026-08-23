import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authOf, requireSuperAdmin } from '../../middlewares/auth'
import { addDays, approvePayment, refreshSubscriptionStatus, serializeSubscription, subscriptionUsage } from '../billing/billing.service'

export const platformAdminRouter = Router()
platformAdminRouter.use(requireSuperAdmin)

platformAdminRouter.get('/dashboard', async (_req, res) => {
  const [clients, active, trials, pendingPayments, grace, suspended, activeSubscriptions] = await Promise.all([
    prisma.business.count(), prisma.subscription.count({ where: { status: 'ACTIVE' } }), prisma.subscription.count({ where: { status: 'TRIALING' } }), prisma.paymentSubmission.count({ where: { status: 'PENDING' } }), prisma.subscription.count({ where: { status: 'GRACE' } }), prisma.subscription.count({ where: { status: 'SUSPENDED' } }), prisma.subscription.findMany({ where: { status: 'ACTIVE' }, include: { plan: true } }),
  ])
  return res.json({ clients, active, trials, pendingPayments, grace, suspended, estimatedMrrARS: activeSubscriptions.reduce((sum, item) => sum + item.plan.priceARS, 0) })
})

platformAdminRouter.get('/subscriptions', async (req, res) => {
  const parsed = z.object({ status: z.enum(['TRIALING', 'ACTIVE', 'GRACE', 'SUSPENDED']).optional(), search: z.string().trim().optional() }).safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Filtros inválidos' })
  const rows = await prisma.subscription.findMany({ where: { ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.search ? { business: { OR: [{ name: { contains: parsed.data.search, mode: 'insensitive' } }, { users: { some: { email: { contains: parsed.data.search, mode: 'insensitive' } } } }] } } : {}) }, include: { plan: true, business: { include: { users: { where: { role: 'OWNER' }, select: { id: true, name: true, email: true, createdAt: true }, take: 1 } } }, payments: { where: { status: 'APPROVED' }, orderBy: { reviewedAt: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' } })
  return res.json(rows)
})

platformAdminRouter.get('/subscriptions/:id', async (req, res) => {
  const row = await prisma.subscription.findUnique({ where: { id: req.params.id }, include: { plan: true, business: { include: { users: { orderBy: { createdAt: 'asc' } } } }, payments: { include: { plan: true }, orderBy: { createdAt: 'desc' } }, } })
  if (!row) return res.status(404).json({ success: false, message: 'Suscripción no encontrada' })
  return res.json({ ...row, usage: await subscriptionUsage(row.businessId) })
})

platformAdminRouter.patch('/subscriptions/:id', async (req, res) => {
  const parsed = z.object({ action: z.enum(['CHANGE_PLAN', 'ADD_COURTESY_DAYS', 'SUSPEND', 'REACTIVATE']), planCode: z.enum(['INITIAL', 'PROFESSIONAL', 'COMPLETE']).optional(), days: z.number().int().min(1).max(365).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Acción inválida' })
  const current = await prisma.subscription.findUnique({ where: { id: req.params.id } })
  if (!current) return res.status(404).json({ success: false, message: 'Suscripción no encontrada' })
  const data = parsed.data.action === 'CHANGE_PLAN' && parsed.data.planCode ? { planCode: parsed.data.planCode }
    : parsed.data.action === 'ADD_COURTESY_DAYS' && parsed.data.days ? { currentPeriodEnd: addDays(current.currentPeriodEnd ?? current.trialEndsAt, parsed.data.days), ...(current.status === 'SUSPENDED' ? { status: 'ACTIVE' as const } : {}) }
    : parsed.data.action === 'SUSPEND' ? { status: 'SUSPENDED' as const }
    : parsed.data.action === 'REACTIVATE' ? { status: 'ACTIVE' as const, currentPeriodStart: new Date(), currentPeriodEnd: addDays(new Date(), 30), graceEndsAt: null }
    : null
  if (!data) return res.status(400).json({ success: false, message: 'Faltan datos para la acción' })
  const updated = await prisma.$transaction(async tx => {
    const subscription = await tx.subscription.update({ where: { id: current.id }, data })
    await tx.subscriptionAuditLog.create({ data: { actorUserId: authOf(req).userId, businessId: current.businessId, action: parsed.data.action, metadata: parsed.data } })
    return subscription
  })
  return res.json(updated)
})

platformAdminRouter.get('/payments', async (req, res) => {
  const status = z.enum(['PENDING', 'APPROVED', 'REJECTED']).safeParse(req.query.status)
  const where = status.success ? { status: status.data } : {}
  return res.json(await prisma.paymentSubmission.findMany({ where, include: { plan: true, business: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }))
})
platformAdminRouter.post('/payments/:id/approve', async (req, res) => {
  try { return res.json(await approvePayment(req.params.id, authOf(req).userId)) }
  catch (error) { return res.status(typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500).json({ success: false, message: error instanceof Error ? error.message : 'No pudimos aprobar el pago' }) }
})
platformAdminRouter.post('/payments/:id/reject', async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Indicá el motivo del rechazo' })
  const payment = await prisma.paymentSubmission.findUnique({ where: { id: req.params.id } })
  if (!payment) return res.status(404).json({ success: false, message: 'Pago no encontrado' })
  if (payment.status !== 'PENDING') return res.status(409).json({ success: false, message: 'Este pago ya fue procesado.' })
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.paymentSubmission.update({ where: { id: payment.id }, data: { status: 'REJECTED', rejectionReason: parsed.data.reason, reviewedAt: new Date(), reviewedByUserId: authOf(req).userId } })
    await tx.subscriptionAuditLog.create({ data: { actorUserId: authOf(req).userId, businessId: payment.businessId, action: 'PAYMENT_REJECTED', metadata: { paymentId: payment.id, reason: parsed.data.reason } } })
    return result
  })
  return res.json(updated)
})

platformAdminRouter.get('/billing-settings', async (_req, res) => res.json(await prisma.billingSettings.findUnique({ where: { id: 'default' } })))
platformAdminRouter.patch('/billing-settings', async (req, res) => {
  const parsed = z.object({ holderName: z.string().trim().min(2), bankName: z.string().trim().min(2), alias: z.string().trim().min(3), cbuCvu: z.string().trim().min(6), taxId: z.string().trim().min(6), additionalText: z.string().trim().max(1000).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos bancarios inválidos' })
  return res.json(await prisma.billingSettings.upsert({ where: { id: 'default' }, create: { id: 'default', ...parsed.data }, update: parsed.data }))
})

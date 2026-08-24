import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authOf, requireSuperAdmin } from '../../middlewares/auth'
import { addDays, approvePayment, getAccountAccessStatus, refreshSubscriptionStatus, subscriptionUsage } from '../billing/billing.service'

export const platformAdminRouter = Router()
platformAdminRouter.use(requireSuperAdmin)

platformAdminRouter.get('/dashboard', async (_req, res) => {
  const [clients, activeBusinesses, inactiveBusinesses, owners, technicians, active, trials, pendingPayments, grace, suspended, activeSubscriptions, recentBusinesses, subscriptions] = await Promise.all([
    prisma.business.count(), prisma.business.count({ where: { isActive: true } }), prisma.business.count({ where: { isActive: false } }), prisma.user.count({ where: { role: 'OWNER' } }), prisma.user.count({ where: { role: 'TECHNICIAN' } }), prisma.subscription.count({ where: { status: 'ACTIVE' } }), prisma.subscription.count({ where: { status: 'TRIALING' } }), prisma.paymentSubmission.count({ where: { status: 'PENDING' } }), prisma.subscription.count({ where: { status: 'GRACE' } }), prisma.subscription.count({ where: { status: 'SUSPENDED' } }), prisma.subscription.findMany({ where: { status: 'ACTIVE' }, include: { plan: true } }), prisma.business.findMany({ take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, isActive: true, createdAt: true } }), prisma.subscription.findMany({ include: { business: { select: { id: true, name: true } } } }),
  ])
  const lifecycles = await Promise.all(subscriptions.map(async item => ({ business: item.business, access: await getAccountAccessStatus(item) })))
  const count = (status: string) => lifecycles.filter(item => item.access.status === status).length
  const attention = lifecycles.filter(item => ['EXPIRING','GRACE','BLOCKED'].includes(item.access.status)).sort((a,b) => (a.access.expiresAt?.getTime() ?? Infinity) - (b.access.expiresAt?.getTime() ?? Infinity)).slice(0,8)
  return res.json({ clients, activeBusinesses, inactiveBusinesses, owners, technicians, active, trials, pendingPayments, grace, suspended, lifecycle: { active: count('ACTIVE'), expiring: count('EXPIRING'), grace: count('GRACE'), blocked: count('BLOCKED'), noExpiry: count('NO_EXPIRY') }, attention, estimatedMrrARS: activeSubscriptions.reduce((sum, item) => sum + item.plan.priceARS, 0), recentBusinesses })
})

platformAdminRouter.get('/businesses', async (req, res) => {
  const parsed = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(5).max(50).default(10), search: z.string().trim().max(120).optional(), lifecycle: z.enum(['ACTIVE','EXPIRING','GRACE','BLOCKED','NO_EXPIRY','TODAY','WEEK']).optional(), sort: z.enum(['EXPIRY_ASC','REMAINING_DESC','RECENT','OLDEST','NAME']).default('EXPIRY_ASC') }).safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Filtros inválidos' })
  const { page, pageSize, search, lifecycle, sort } = parsed.data
  const rows = await prisma.business.findMany({ where: search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { users: { some: { OR: [{ email: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }] } } }] } : {}, select: { id: true, name: true, phone: true, isActive: true, createdAt: true, _count: { select: { users: true, repairs: true, clients: true } }, users: { where: { role: 'OWNER' }, take: 1, select: { name: true, email: true } }, subscription: { include: { plan: true } } } })
  const now = new Date(); let enriched = await Promise.all(rows.map(async row => ({ ...row, access: row.subscription ? await getAccountAccessStatus(row.subscription, now) : { status: 'NO_EXPIRY' as const, expiresAt: null, graceEndsAt: null, daysRemaining: null } })))
  if (lifecycle) enriched = enriched.filter(row => lifecycle === 'TODAY' ? row.access.status === 'EXPIRING' && row.access.daysRemaining === 0 : lifecycle === 'WEEK' ? row.access.status === 'EXPIRING' && Number(row.access.daysRemaining) <= 7 : row.access.status === lifecycle)
  enriched.sort((a,b) => sort === 'RECENT' ? +b.createdAt - +a.createdAt : sort === 'OLDEST' ? +a.createdAt - +b.createdAt : sort === 'NAME' ? a.name.localeCompare(b.name) : sort === 'REMAINING_DESC' ? Number(b.access.daysRemaining ?? -1) - Number(a.access.daysRemaining ?? -1) : (a.access.expiresAt?.getTime() ?? Infinity) - (b.access.expiresAt?.getTime() ?? Infinity))
  const total = enriched.length, items = enriched.slice((page - 1) * pageSize, page * pageSize)
  return res.json({ items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) })
})

platformAdminRouter.get('/businesses/:id', async (req, res) => {
  const business = await prisma.business.findUnique({ where: { id: req.params.id }, include: { users: { select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true, updatedAt: true } }, subscription: { include: { plan: true } }, subscriptionAudits: { include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }, internalNotes: { orderBy: { createdAt: 'desc' } }, _count: { select: { repairs: true, clients: true, cashMovements: true } } } })
  if (!business) return res.status(404).json({ success: false, message: 'Negocio no encontrado' })
  return res.json({ ...business, access: business.subscription ? await getAccountAccessStatus(business.subscription) : null })
})

platformAdminRouter.patch('/businesses/:id/status', async (req, res) => {
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Estado inválido' })
  const current = await prisma.business.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, isActive: true } })
  if (!current) return res.status(404).json({ success: false, message: 'Negocio no encontrado' })
  if (current.id === authOf(req).businessId && !parsed.data.isActive) return res.status(409).json({ success: false, message: 'No podés desactivar el negocio desde el que administrás la plataforma' })
  const business = await prisma.$transaction(async tx => {
    const updated = await tx.business.update({ where: { id: current.id }, data: { isActive: parsed.data.isActive } })
    if (current.isActive !== parsed.data.isActive) await tx.user.updateMany({ where: { businessId: current.id }, data: { tokenVersion: { increment: 1 } } })
    await tx.subscriptionAuditLog.create({ data: { actorUserId: authOf(req).userId, businessId: current.id, action: parsed.data.isActive ? 'BUSINESS_REACTIVATED' : 'BUSINESS_DEACTIVATED', metadata: { previous: current.isActive } } })
    return updated
  })
  return res.json(business)
})

platformAdminRouter.post('/businesses/:id/renew', async (req, res) => {
  const parsed = z.object({ days: z.number().int().min(1).max(730), base: z.enum(['TODAY','EXPIRY']).default('TODAY') }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Extensión inválida' })
  const subscription = await prisma.subscription.findUnique({ where: { businessId: req.params.id } })
  if (!subscription) return res.status(404).json({ success: false, message: 'Suscripción no encontrada' })
  const now = new Date(), previous = subscription.accessExpiresAt
  const base = parsed.data.base === 'EXPIRY' && previous ? previous : now
  const next = addDays(base, parsed.data.days)
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.subscription.update({ where: { id: subscription.id }, data: { accessExpiresAt: next, currentPeriodEnd: next, status: 'ACTIVE', graceEndsAt: null, manuallyBlockedAt: null, manualBlockReason: null, manualBlockNote: null } })
    await tx.subscriptionAuditLog.create({ data: { actorUserId: authOf(req).userId, businessId: req.params.id, action: 'ACCESS_EXTENDED', metadata: { previousExpiresAt: previous, newExpiresAt: next, days: parsed.data.days, base: parsed.data.base } } })
    return result
  })
  return res.json({ subscription: updated, access: await getAccountAccessStatus(updated) })
})

platformAdminRouter.patch('/businesses/:id/expiry', async (req, res) => {
  const parsed = z.object({ expiresAt: z.coerce.date(), graceDaysOverride: z.number().int().min(0).max(60).nullable().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Fecha inválida' })
  const subscription = await prisma.subscription.findUnique({ where: { businessId: req.params.id } })
  if (!subscription) return res.status(404).json({ success: false, message: 'Suscripción no encontrada' })
  const previous = subscription.accessExpiresAt
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.subscription.update({ where: { id: subscription.id }, data: { accessExpiresAt: parsed.data.expiresAt, currentPeriodEnd: parsed.data.expiresAt, ...(parsed.data.graceDaysOverride !== undefined ? { graceDaysOverride: parsed.data.graceDaysOverride } : {}) } })
    await tx.subscriptionAuditLog.create({ data: { actorUserId: authOf(req).userId, businessId: req.params.id, action: 'EXPIRY_CHANGED', metadata: { previousExpiresAt: previous, newExpiresAt: parsed.data.expiresAt } } })
    return result
  })
  return res.json({ subscription: updated, access: await getAccountAccessStatus(updated) })
})

platformAdminRouter.post('/businesses/:id/block', async (req, res) => {
  const parsed = z.object({ reason: z.enum(['ADMINISTRATIVE','CUSTOMER_REQUEST','NON_COMPLIANCE','OTHER']), note: z.string().trim().max(1000).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Indicá un motivo válido' })
  if (req.params.id === authOf(req).businessId) return res.status(409).json({ success: false, message: 'No podés bloquear la cuenta administradora' })
  const subscription = await prisma.subscription.findUnique({ where: { businessId: req.params.id } }); if (!subscription) return res.status(404).json({ success: false, message: 'Suscripción no encontrada' })
  const now = new Date(); const updated = await prisma.$transaction(async tx => { const result = await tx.subscription.update({ where: { id: subscription.id }, data: { manuallyBlockedAt: now, manualBlockReason: parsed.data.reason, manualBlockNote: parsed.data.note || null } }); await tx.user.updateMany({ where: { businessId: req.params.id }, data: { tokenVersion: { increment: 1 } } }); await tx.subscriptionAuditLog.create({ data: { actorUserId: authOf(req).userId, businessId: req.params.id, action: 'ACCOUNT_BLOCKED_MANUALLY', metadata: parsed.data } }); return result })
  return res.json({ subscription: updated, access: await getAccountAccessStatus(updated) })
})

platformAdminRouter.post('/businesses/:id/unblock', async (req, res) => {
  const parsed = z.object({ expiresAt: z.coerce.date().optional() }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: 'Fecha inválida' })
  const subscription = await prisma.subscription.findUnique({ where: { businessId: req.params.id } }); if (!subscription) return res.status(404).json({ success: false, message: 'Suscripción no encontrada' })
  const updated = await prisma.$transaction(async tx => { const result = await tx.subscription.update({ where: { id: subscription.id }, data: { manuallyBlockedAt: null, manualBlockReason: null, manualBlockNote: null, ...(parsed.data.expiresAt ? { accessExpiresAt: parsed.data.expiresAt, currentPeriodEnd: parsed.data.expiresAt } : {}) } }); await tx.user.updateMany({ where: { businessId: req.params.id }, data: { tokenVersion: { increment: 1 } } }); await tx.subscriptionAuditLog.create({ data: { actorUserId: authOf(req).userId, businessId: req.params.id, action: 'ACCOUNT_UNBLOCKED', metadata: { newExpiresAt: parsed.data.expiresAt ?? subscription.accessExpiresAt } } }); return result }); return res.json({ subscription: updated, access: await getAccountAccessStatus(updated) })
})

platformAdminRouter.post('/businesses/:id/notes', async (req, res) => { const parsed=z.object({content:z.string().trim().min(2).max(2000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:'Nota inválida'});return res.status(201).json(await prisma.platformInternalNote.create({data:{businessId:req.params.id,authorUserId:authOf(req).userId,content:parsed.data.content}})) })
platformAdminRouter.patch('/businesses/:businessId/notes/:id', async (req,res)=>{const parsed=z.object({content:z.string().trim().min(2).max(2000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:'Nota inválida'});const note=await prisma.platformInternalNote.findFirst({where:{id:req.params.id,businessId:req.params.businessId,authorUserId:authOf(req).userId}});if(!note)return res.status(404).json({success:false,message:'Nota no encontrada'});return res.json(await prisma.platformInternalNote.update({where:{id:note.id},data:{content:parsed.data.content}}))})
platformAdminRouter.delete('/businesses/:businessId/notes/:id', async (req,res)=>{const note=await prisma.platformInternalNote.findFirst({where:{id:req.params.id,businessId:req.params.businessId,authorUserId:authOf(req).userId}});if(!note)return res.status(404).json({success:false,message:'Nota no encontrada'});await prisma.platformInternalNote.delete({where:{id:note.id}});return res.json({success:true})})

platformAdminRouter.get('/service-settings', async (_req,res)=>res.json(await prisma.billingSettings.upsert({where:{id:'default'},create:{id:'default'},update:{}})))
platformAdminRouter.patch('/service-settings', async (req,res)=>{const parsed=z.object({expirationWarningDays:z.number().int().min(0).max(60),defaultGraceDays:z.number().int().min(0).max(60)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({success:false,message:'Configuración inválida'});return res.json(await prisma.billingSettings.upsert({where:{id:'default'},create:{id:'default',...parsed.data},update:parsed.data}))})

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

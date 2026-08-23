import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authOf } from '../../middlewares/auth'
import { assertWithinLimit, ensureSubscription, serializeSubscription, subscriptionUsage } from './billing.service'

export const billingRouter = Router()

billingRouter.get('/plans', async (_req, res) => res.json(await prisma.plan.findMany({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } })))
billingRouter.get('/subscription', async (req, res) => res.json(await serializeSubscription(authOf(req).businessId)))
billingRouter.get('/usage', async (req, res) => res.json(await subscriptionUsage(authOf(req).businessId)))
billingRouter.get('/transfer-details', async (_req, res) => {
  const settings = await prisma.billingSettings.findUnique({ where: { id: 'default' } })
  const configured = Boolean(settings?.holderName && settings.bankName && settings.alias && settings.cbuCvu && settings.taxId)
  return configured ? res.json({ configured: true, ...settings }) : res.status(503).json({ configured: false, message: 'Los datos de transferencia todavía no están configurados.' })
})
billingRouter.post('/select-plan', async (req, res) => {
  const parsed = z.object({ planCode: z.enum(['INITIAL', 'PROFESSIONAL', 'COMPLETE']) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Plan inválido' })
  const plan = await prisma.plan.findFirst({ where: { code: parsed.data.planCode, isActive: true } })
  if (!plan) return res.status(404).json({ success: false, message: 'Plan no disponible' })
  return res.json({ plan })
})
billingRouter.post('/payments', async (req, res) => {
  const parsed = z.object({ planCode: z.enum(['INITIAL', 'PROFESSIONAL', 'COMPLETE']), reportedAmount: z.number().int().positive(), payerName: z.string().trim().min(2).max(160), transferDate: z.coerce.date(), reference: z.string().trim().max(160).optional(), notes: z.string().trim().max(1000).optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos del pago inválidos' })
  const businessId = authOf(req).businessId
  const [plan, subscription] = await Promise.all([prisma.plan.findFirst({ where: { code: parsed.data.planCode, isActive: true } }), ensureSubscription(businessId)])
  if (!plan) return res.status(404).json({ success: false, message: 'Plan no disponible' })
  const payment = await prisma.paymentSubmission.create({ data: { subscriptionId: subscription.id, businessId, planCode: plan.code, expectedAmount: plan.priceARS, reportedAmount: parsed.data.reportedAmount, payerName: parsed.data.payerName, transferDate: parsed.data.transferDate, reference: parsed.data.reference || null, notes: parsed.data.notes || null } })
  return res.status(201).json(payment)
})
billingRouter.get('/payments', async (req, res) => res.json(await prisma.paymentSubmission.findMany({ where: { businessId: authOf(req).businessId }, include: { plan: true }, orderBy: { createdAt: 'desc' } })))

export { assertWithinLimit }

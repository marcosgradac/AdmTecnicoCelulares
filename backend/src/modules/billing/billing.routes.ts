import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authOf, requireRole } from '../../middlewares/auth'
import { assertWithinLimit, ensureSubscription, getFeatureEntitlements, serializeSubscription, subscriptionUsage } from './billing.service'

export const billingRouter = Router()
// Authenticated staff need feature availability, without access to billing details.
billingRouter.get('/entitlements', async (req, res) => res.json(await getFeatureEntitlements(authOf(req).businessId)))
billingRouter.use(requireRole('OWNER'))

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
  // Un pago pendiente ya informado se revisa antes de aceptar otro: evita doble carga por doble clic.
  const alreadyPending = await prisma.paymentSubmission.findFirst({ where: { businessId, status: 'PENDING' }, select: { id: true } })
  if (alreadyPending) return res.status(409).json({ success: false, code: 'PAYMENT_ALREADY_PENDING', message: 'Ya tenés un pago pendiente de verificación.' })
  try {
    const payment = await prisma.paymentSubmission.create({ data: { subscriptionId: subscription.id, businessId, planCode: plan.code, expectedAmount: plan.priceARS, reportedAmount: parsed.data.reportedAmount, payerName: parsed.data.payerName, transferDate: parsed.data.transferDate, reference: parsed.data.reference || null, notes: parsed.data.notes || null } })
    return res.status(201).json(payment)
  } catch (error) {
    // El índice parcial protege las carreras que pasan el precheck. Sólo atrapamos
    // este create; meta.target de un índice SQL manual no tiene un formato portable.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ success: false, code: 'PAYMENT_ALREADY_PENDING', message: 'Ya tenés un pago pendiente de verificación.' })
    }
    throw error
  }
})
billingRouter.get('/payments', async (req, res) => res.json(await prisma.paymentSubmission.findMany({ where: { businessId: authOf(req).businessId }, include: { plan: true }, orderBy: { createdAt: 'desc' } })))

export { assertWithinLimit }

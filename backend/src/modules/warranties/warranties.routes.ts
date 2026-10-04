import { Router, type Request, type Response, type NextFunction } from 'express'
import { PaymentMethod, WarrantyClaimStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { repairResponse } from '../repairs/repair-response'
import { authOf, requirePermission } from '../../middlewares/auth'
import { addClaimExpense, claimInclude, createClaim, deliverClaim, editWarranty, removeWarranty, updateClaim, WarrantyError } from './warranties.service'

export const warrantiesRouter = Router()
warrantiesRouter.use(requirePermission('repairs.view'))
const canReadCosts = (req: Request) => authOf(req).role === 'OWNER' || authOf(req).permissions?.some(p => ['repairs.viewFinancials', 'cash.view', 'cash.create'].includes(p))
const publicClaim = <T extends { expenses: unknown }>(req: Request, claim: T) => canReadCosts(req) ? claim : { ...claim, expenses: [] }
const run = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await fn(req, res) } catch (error) { if (error instanceof WarrantyError) res.status(error.statusCode).json({ success: false, message: error.message }); else next(error) }
}
warrantiesRouter.get('/', run(async (req, res) => {
  const repairs = await prisma.repair.findMany({
    where: { businessId: authOf(req).businessId, warrantyDeletedAt: null, OR: [{ warrantyEnabled: true }, { warrantyClaims: { some: {} } }] },
    include: { client: true, warrantyClaims: { orderBy: { createdAt: 'desc' }, include: claimInclude } },
    orderBy: [{ warrantyExpiresAt: 'asc' }, { updatedAt: 'desc' }],
  })
  res.json(repairs.map(repair => repairResponse(authOf(req), { ...repair, warrantyClaims: repair.warrantyClaims.map(claim => publicClaim(req, claim)) })))
}))
warrantiesRouter.patch('/:repairId', requirePermission('repairs.update'), run(async (req, res) => {
  const input = z.object({ durationDays: z.number().int().min(1).max(365), conditions: z.string().trim().max(2000).optional() }).safeParse(req.body)
  if (!input.success) return res.status(400).json({ message: 'Datos de garantía inválidos' })
  res.json(repairResponse(authOf(req), await editWarranty(authOf(req).businessId, String(req.params.repairId), input.data)))
}))
warrantiesRouter.delete('/:repairId', requirePermission('repairs.update'), run(async (req, res) => {
  res.json(await removeWarranty(authOf(req).businessId, String(req.params.repairId)))
}))
const expenseSchema = z.object({ concept: z.string().trim().min(2).max(200), amount: z.number().int().positive().max(2147483647), method: z.nativeEnum(PaymentMethod), idempotencyKey: z.string().trim().min(8).max(100) })
const canCreateExpense = (req: Request) => authOf(req).role === 'OWNER' || authOf(req).permissions?.includes('cash.create')
warrantiesRouter.post('/:repairId/claims', requirePermission('repairs.update'), run(async (req, res) => {
  const input = z.object({ description: z.string().trim().min(5).max(1500), initialExpense: expenseSchema.optional() }).safeParse(req.body)
  if (!input.success) return res.status(400).json({ message: 'Describí el reclamo de garantía' })
  // El gasto inicial se registra junto al reclamo: exige los mismos permisos que un gasto posterior.
  if (input.data.initialExpense && !canCreateExpense(req)) return res.status(403).json({ message: 'No tenés permisos para registrar gastos' })
  res.status(201).json(publicClaim(req, await createClaim(authOf(req).businessId, String(req.params.repairId), input.data.description, input.data.initialExpense)))
}))
warrantiesRouter.patch('/claims/:id', requirePermission('repairs.update'), run(async (req, res) => {
  const input = z.object({ status: z.nativeEnum(WarrantyClaimStatus), resolution: z.string().trim().max(1500).optional() }).safeParse(req.body)
  if (!input.success) return res.status(400).json({ message: 'Actualización inválida' })
  res.json(publicClaim(req, await updateClaim(authOf(req).businessId, String(req.params.id), input.data)))
}))
warrantiesRouter.post('/claims/:id/expenses', requirePermission('repairs.update'), requirePermission('cash.create'), run(async (req, res) => {
  const input = expenseSchema.safeParse(req.body)
  if (!input.success) return res.status(400).json({ message: 'Indicá concepto, importe positivo y medio de pago.' })
  res.status(201).json(await addClaimExpense(authOf(req).businessId, String(req.params.id), input.data))
}))
warrantiesRouter.post('/claims/:id/delivery', requirePermission('repairs.changeStatus'), run(async (req, res) => {
  const input = z.object({ warrantyDurationDays: z.number().int().min(0).max(365) }).safeParse(req.body)
  if (!input.success) return res.status(400).json({ message: 'Elegí sin garantía o una duración de 1 a 365 días.' })
  res.json(publicClaim(req, await deliverClaim(authOf(req).businessId, String(req.params.id), input.data.warrantyDurationDays)))
}))

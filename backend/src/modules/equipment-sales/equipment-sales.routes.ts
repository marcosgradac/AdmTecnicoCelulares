import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { authOf, requirePermission } from '../../middlewares/auth'
import { createDevice, deviceSummary, editDevice, EquipmentSalesError, listDevices, sellDevice } from './equipment-sales.service'

const amount = z.number().int().min(0).max(2147483647)
const fields = {
  brand: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(120),
  purchasePrice: amount, repairExpenses: amount, estimatedSalePrice: amount,
}
const version = z.number().int().min(0).max(2147483646)
const status = z.enum(['PURCHASED', 'REPAIRING', 'READY_FOR_SALE', 'SOLD'])
export const equipmentSalesRouter = Router()

equipmentSalesRouter.get('/', requirePermission('equipmentSales.view'), async (req, res) => {
  const parsed = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), search: z.string().trim().max(120).optional(), status: status.optional() }).safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ message: 'Filtros de equipos inválidos.' })
  return res.json(await listDevices(authOf(req).businessId, parsed.data))
})

equipmentSalesRouter.get('/summary', requirePermission('equipmentSales.view'), async (req, res) => res.json(await deviceSummary(authOf(req).businessId)))

equipmentSalesRouter.post('/', requirePermission('equipmentSales.manage'), async (req, res) => {
  const parsed = z.object({ ...fields, repairExpenses: amount.default(0) }).strict().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: 'Completá marca, modelo e importes enteros no negativos válidos.' })
  return res.status(201).json(await createDevice(authOf(req).businessId, parsed.data))
})

equipmentSalesRouter.patch('/:id', requirePermission('equipmentSales.manage'), async (req, res) => {
  const parsed = z.object({ ...fields, status: z.enum(['PURCHASED', 'REPAIRING', 'READY_FOR_SALE']), expectedVersion: version }).strict().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: 'Datos de equipo inválidos. No se puede marcar como vendido desde la edición.' })
  return res.json(await editDevice(authOf(req).businessId, String(req.params.id), parsed.data))
})

equipmentSalesRouter.post('/:id/sell', requirePermission('equipmentSales.sell'), async (req, res) => {
  const parsed = z.object({
    expectedVersion: version, actualSalePrice: amount.min(1), salePaymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD', 'OTHER']),
    soldAt: z.string().datetime({ offset: true }).transform(value => new Date(value)).refine(value => value.getFullYear() >= 1900 && value.getTime() <= Date.now(), 'Fecha de venta inválida o futura').optional(),
  }).strict().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: 'Completá precio real, medio de pago y una fecha de venta válida, no futura.' })
  return res.json(await sellDevice(authOf(req).businessId, String(req.params.id), parsed.data))
})

equipmentSalesRouter.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof EquipmentSalesError) return res.status(error.status).json({ message: error.message })
  return next(error)
})

import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { clientRepairSelect } from '../repairs/repair-response'
import { authOf, requirePermission } from '../../middlewares/auth'
import type { Express } from 'express'

export function registerClientRoutes(app: Express) {
  app.get('/api/clients', requirePermission('clients.view'), async (req, res) => {
    const businessId = authOf(req).businessId
    if (req.query.paginated !== 'true') return res.json(await prisma.client.findMany({ where: { businessId, deletedAt: null }, orderBy: { createdAt: 'desc' } }))
    const parsed = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(10), search: z.string().trim().optional() }).safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Filtros inválidos' })
    const { page, pageSize, search } = parsed.data
    const where = { businessId, deletedAt: null, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { phone: { contains: search } }] } : {}) }
    const [items, total] = await prisma.$transaction([prisma.client.findMany({ where, select: { id: true, name: true, phone: true, createdAt: true, _count: { select: { repairs: true } }, repairs: { select: { deviceBrand: true, deviceModel: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), prisma.client.count({ where })])
    return res.json({ items: items.map(({ _count, repairs, ...client }) => ({ ...client, repairCount: _count.repairs, lastRepair: repairs[0] ?? null })), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
  })
  app.get('/api/clients/options', requirePermission('clients.view'), async (req, res) => {
    return res.json(await prisma.client.findMany({ where: { businessId: authOf(req).businessId, deletedAt: null }, select: { id: true, name: true, phone: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }))
  })
  app.get('/api/clients/:id', requirePermission('clients.view'), async (req, res) => {
    const client = await prisma.client.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, include: { repairs: { select: clientRepairSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] } } })
    return client ? res.json(client) : res.status(404).json({ success: false, message: 'Cliente no encontrado' })
  })
  app.post('/api/clients', requirePermission('clients.create'), async (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(2), phone: z.string().min(6).optional() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos inválidos' })
    const businessId = authOf(req).businessId
    const phone = parsed.data.phone?.replace(/\D/g, '')
    if (phone && await prisma.client.findFirst({ where: { businessId, phone, deletedAt: null } })) return res.status(409).json({ success: false, message: 'Ya existe un cliente con ese teléfono' })
    return res.status(201).json(await prisma.client.create({ data: { businessId, name: parsed.data.name, phone } }))
  })
  app.patch('/api/clients/:id', requirePermission('clients.update'), async (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().min(6).optional().nullable() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos inválidos' })
    const businessId = authOf(req).businessId
    const current = await prisma.client.findFirst({ where: { id: String(req.params.id), businessId, deletedAt: null } })
    if (!current) return res.status(404).json({ success: false, message: 'Cliente no encontrado' })
    const phone = parsed.data.phone?.replace(/\D/g, '') || null
    if (phone && await prisma.client.findFirst({ where: { businessId, phone, deletedAt: null, NOT: { id: current.id } } })) return res.status(409).json({ success: false, message: 'Ya existe un cliente con ese teléfono' })
    const updated = await prisma.client.updateMany({ where: { id: current.id, businessId, deletedAt: null }, data: { name: parsed.data.name, phone } })
    if (!updated.count) return res.status(404).json({ success: false, message: 'Cliente no encontrado' })
    return res.json(await prisma.client.findFirst({ where: { id: current.id, businessId } }))
  })
  app.delete('/api/clients/:id', requirePermission('clients.delete'), async (req, res) => {
    const id = String(req.params.id), businessId = authOf(req).businessId
    const client = await prisma.client.findFirst({ where: { id, businessId }, select: { id: true, deletedAt: true } })
    if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' })
    // Guard the write too: repeated/concurrent DELETEs preserve the original timestamp.
    if (!client.deletedAt) await prisma.client.updateMany({ where: { id, businessId, deletedAt: null }, data: { deletedAt: new Date() } })
    return res.json({ success: true })
  })

}

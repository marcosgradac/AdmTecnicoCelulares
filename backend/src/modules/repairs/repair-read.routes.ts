import { z } from 'zod'
import { RepairStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { repairResponse } from './repair-response'
import { authOf, requirePermission } from '../../middlewares/auth'
import type { Express } from 'express'
import { includeRepair } from './repair-query'

const repairListSelect = {
  id: true, number: true, clientId: true, deviceBrand: true, deviceModel: true, imei: true, color: true, issue: true,
  diagnosis: true, notes: true, status: true, total: true, paid: true, trackingToken: true, trackingEnabled: true, trackingExpiresAt: true,
  cancelledAt: true, cancellationPaidAmount: true, cancellationReviewFee: true, cancellationReviewPaid: true, cancellationRefundAmount: true,
  cancellationRefundMethod: true, cancellationRefundMovementId: true,
  estimatedDeliveryDate: true, warrantyEnabled: true, warrantyDurationDays: true, warrantyStartedAt: true,
  warrantyExpiresAt: true, createdAt: true, updatedAt: true,
  client: { select: { id: true, name: true, phone: true, createdAt: true } },
} as const

export function registerRepairReadRoutes(app: Express) {
  app.get('/api/repairs', requirePermission('repairs.view'), async (req, res) => {
    const parsed = z.object({
      page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(10),
      search: z.string().trim().optional(), status: z.nativeEnum(RepairStatus).optional(),
      from: z.coerce.date().optional(), to: z.coerce.date().optional(), order: z.enum(['asc', 'desc']).default('desc'),
    }).safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Filtros inválidos' })
    try {
      const { page, pageSize, search, status, from, to, order } = parsed.data
      const where = {
        businessId: authOf(req).businessId, ...(status ? { status } : {}),
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        ...(search ? {
          OR: [
            ...(Number.isInteger(Number(search)) ? [{ number: Number(search) }] : []),
            { client: { name: { contains: search, mode: 'insensitive' as const } } },
            { client: { phone: { contains: search } } },
            { deviceBrand: { contains: search, mode: 'insensitive' as const } },
            { deviceModel: { contains: search, mode: 'insensitive' as const } },
            { imei: { contains: search } },
            { issue: { contains: search, mode: 'insensitive' as const } },
          ]
        } : {}),
      }
      const [items, total] = await prisma.$transaction([
        prisma.repair.findMany({ where, select: repairListSelect, orderBy: [{ createdAt: order }, { id: order }], skip: (page - 1) * pageSize, take: pageSize }),
        prisma.repair.count({ where }),
      ])
      return res.json({ items: items.map(item => repairResponse(authOf(req), item)), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) })
    }
    catch { return res.status(500).json({ success: false, message: 'Error obteniendo reparaciones' }) }
  })
  app.get('/api/repairs/:id', requirePermission('repairs.view'), async (req, res) => {
    const repair = await prisma.repair.findFirst({ where: { id: String(req.params.id), businessId: authOf(req).businessId }, include: includeRepair })
    return repair ? res.json(repairResponse(authOf(req), repair)) : res.status(404).json({ success: false, message: 'Reparación no encontrada' })
  })

}

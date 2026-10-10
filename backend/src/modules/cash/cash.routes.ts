import { z } from 'zod'
import { CashMovementOrigin, CashMovementType, PaymentMethod, Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { emptyLoose, linkedWhereFor, looseCashMovements, looseColumns, looseWhereFor, repairCashGroups, toLooseBlock } from './cash-groups.service'
import { cashPeriodWhere, DEFAULT_CASH_PERIOD, isCashPeriod } from './cash-period'
import { authOf, requirePermission } from '../../middlewares/auth'
import { assertFeatureAccess } from '../billing/billing.service'
import { deviceSummary } from '../equipment-sales/equipment-sales.service'
import type { Express } from 'express'

export function registerCashRoutes(app: Express) {
  app.get('/api/cash/movements', requirePermission('cash.view'), async (req, res) => {
    const parsed = z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(10),
      origin: z.nativeEnum(CashMovementOrigin).optional(),
      // Caja de reparaciones agrupada por reparación, con paginación por grupos.
      groupByRepair: z.coerce.boolean().optional(),
      // Período de todas las cajas. Un valor desconocido cae en TODAY en lugar de fallar.
      period: z.string().optional(),
    }).safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Parámetros de paginación inválidos' })

    const { page, pageSize } = parsed.data
    const businessId = authOf(req).businessId
    if (parsed.data.origin === 'COMMERCE') {
      try { await assertFeatureAccess(businessId, 'commerce') }
      catch (error) { return res.status((error as { statusCode?: number }).statusCode ?? 500).json({ success: false, message: error instanceof Error ? error.message : 'No pudimos validar Comercio.' }) }
    }
    // El backend es la única fuente de los límites temporales: el navegador elige el período
    // de una lista cerrada y nunca manda un rango arbitrario.
    const period = isCashPeriod(parsed.data.period) ? parsed.data.period : DEFAULT_CASH_PERIOD
    const now = new Date()
    const createdAt = cashPeriodWhere(period, now)
    const where = { businessId, ...(parsed.data.origin ? { origin: parsed.data.origin } : {}), createdAt }
    // El resumen usa exactamente el mismo rango que el listado: tarjetas y tabla no se contradicen.
    const summaryQuery = prisma.cashMovement.groupBy({ by: ['type'], where, orderBy: { type: 'asc' }, _sum: { amount: true } })
    const countQuery = prisma.cashMovement.count({ where })
    const buildSummary = (grouped: { type: CashMovementType; _sum: { amount: number | null } }[], totalMovements: number) => {
      const income = grouped.find(row => row.type === CashMovementType.INCOME)?._sum?.amount ?? 0
      const expense = grouped.find(row => row.type === CashMovementType.EXPENSE)?._sum?.amount ?? 0
      return { income, expense, balance: income - expense, totalMovements }
    }

    if (parsed.data.groupByRepair) {
      if (parsed.data.origin && parsed.data.origin !== 'REPAIR') {
        return res.status(400).json({ success: false, message: 'La agrupación por reparación sólo existe para la caja de reparaciones.' })
      }
      // El resumen y el total se leen juntos; la agrupación no cambia ninguna cifra.
      const [grouped, movementCount] = await prisma.$transaction([summaryQuery, countQuery], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
      const [groups, loose] = await Promise.all([repairCashGroups(businessId, page, pageSize, period, now), looseCashMovements(businessId, 'REPAIR', period, now)])
      return res.json({
        items: groups.items,
        total: groups.total,
        page,
        pageSize,
        pages: Math.max(1, Math.ceil(groups.total / pageSize)),
        period,
        summary: buildSummary(grouped, movementCount),
        // Los movimientos manuales van en su propia tabla y NO se paginan con los grupos: la
        // paginación sigue siendo por reparación, así que un manual nunca desplaza un grupo.
        loose,
      })
    }

    // La tabla principal muestra sólo lo vinculado al módulo; los manuales van aparte pero
    // SIGUEN contando en el resumen de la caja: ningún importe se pierde por separarlos.
    const [items, linkedTotal, grouped, loose] = await prisma.$transaction([
      prisma.cashMovement.findMany({ where: { ...where, ...linkedWhereFor(parsed.data.origin) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.cashMovement.count({ where: { ...where, ...linkedWhereFor(parsed.data.origin) } }),
      summaryQuery,
      prisma.cashMovement.findMany({ where: { ...where, ...looseWhereFor(parsed.data.origin) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: looseColumns }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
    const equipmentSummary = parsed.data.origin === 'EQUIPMENT' ? await deviceSummary(businessId, createdAt) : undefined
    return res.json({
      items,
      total: linkedTotal,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(linkedTotal / pageSize)),
      period,
      summary: buildSummary(grouped, linkedTotal + loose.length),
      loose: loose.length ? toLooseBlock(loose) : emptyLoose,
      ...(equipmentSummary ? { equipmentSummary } : {}),
    })
  })
  app.post('/api/cash/movements', requirePermission('cash.create'), async (req, res) => {
    const parsed = z.object({ type: z.nativeEnum(CashMovementType), origin: z.nativeEnum(CashMovementOrigin).default('GENERAL'), description: z.string().trim().min(2), amount: z.number().int().positive(), method: z.nativeEnum(PaymentMethod).optional() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Movimiento inválido' })
    // COMMERCE es un origen válido de movements manuales: se valida el plan y se registra
    // un único CashMovement, igual que GENERAL, REPAIR y EQUIPMENT.
    if (parsed.data.origin === 'COMMERCE') {
      try { await assertFeatureAccess(authOf(req).businessId, 'commerce') }
      catch (error) { return res.status((error as { statusCode?: number }).statusCode ?? 500).json({ success: false, message: error instanceof Error ? error.message : 'No pudimos validar Comercio.' }) }
    }
    return res.status(201).json(await prisma.cashMovement.create({ data: { businessId: authOf(req).businessId, ...parsed.data } }))
  })

}

import { Prisma, type RepairStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { getArgentinaDayBounds } from '../../lib/argentina-day'
import { getFeatureEntitlements } from '../billing/billing.service'
import { dashboardPeriod, type DashboardPeriod } from './dashboard-period'
import { dashboardCashFlow } from './dashboard-cash'

const repairSelect = { id: true, number: true, deviceBrand: true, deviceModel: true, total: true, paid: true, client: { select: { name: true } } } as const
type AttentionItem = { id: string; title: string; detail: string; href: string }
type AttentionGroup = { key: string; title: string; count: number; href: string; items: AttentionItem[] }
const repairItem = (repair: { id: string; number: number; deviceBrand: string; deviceModel: string; client: { name: string } }): AttentionItem => ({
  id: repair.id, title: `${repair.deviceBrand} ${repair.deviceModel}`, detail: `#${repair.number} · ${repair.client.name}`, href: `/admin/reparaciones/${repair.id}`,
})

export async function dashboardOverview(businessId: string, period: DashboardPeriod, now = new Date()) {
  const range = dashboardPeriod(period, now)
  const features = await getFeatureEntitlements(businessId)
  const createdAt = { gte: range.start, lt: range.end }
  const today = getArgentinaDayBounds(now).start
  // Existing date-only delivery inputs are stored at UTC midnight. Compare calendar dates,
  // not AR midnight instants, so a repair due today remains due today.
  const deliveryCutoff = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  // A single read snapshot keeps KPI totals and chart buckets consistent on both engines.
  return prisma.$transaction(async tx => {
    const outstanding = { businessId, paid: { lt: tx.repair.fields.total } }
    const delayed = { businessId, status: { notIn: ['DELIVERED', 'CANCELLED', 'READY'] as RepairStatus[] }, estimatedDeliveryDate: { lt: deliveryCutoff } }
    const warranty = { businessId, warrantyEnabled: true, warrantyDeletedAt: null, warrantyExpiresAt: { gte: now, lt: new Date(now.getTime() + 7 * 86400000) } }
    const [cash, status, pending, received, readyItems, pendingItems, delayedCount, delayedItems, warrantyCount, warrantyItems, deviceStatus, deviceSales, commerce, activity, equipmentItems] = await Promise.all([
      tx.cashMovement.groupBy({ by: ['type', 'origin'], where: { businessId, createdAt }, _sum: { amount: true }, _count: true }),
      tx.repair.groupBy({ by: ['status'], where: { businessId }, _count: true }),
      tx.repair.aggregate({ where: outstanding, _sum: { total: true, paid: true }, _count: true }),
      tx.repair.count({ where: { businessId, createdAt } }),
      tx.repair.findMany({ where: { businessId, status: 'READY' }, select: repairSelect, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take: 3 }),
      tx.repair.findMany({ where: outstanding, select: repairSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 3 }),
      tx.repair.count({ where: delayed }),
      tx.repair.findMany({ where: delayed, select: repairSelect, orderBy: [{ estimatedDeliveryDate: 'asc' }, { id: 'asc' }], take: 3 }),
      tx.repair.count({ where: warranty }),
      tx.repair.findMany({ where: warranty, select: repairSelect, orderBy: [{ warrantyExpiresAt: 'asc' }, { id: 'asc' }], take: 3 }),
      tx.resaleDevice.groupBy({ by: ['status'], where: { businessId }, _count: true }),
      // Cash records the confirmation instant. soldAt can be a different accounting date.
      tx.resaleDevice.aggregate({ where: { businessId, status: 'SOLD', cashMovements: { some: { businessId, resaleKind: 'SALE', createdAt } } }, _count: true, _sum: { actualSalePrice: true, saleCostBasis: true } }),
      features.commerce ? tx.commerceSale.aggregate({ where: { businessId, createdAt }, _count: true, _sum: { total: true, profit: true } }) : null,
      tx.cashMovement.findMany({ where: { businessId, createdAt }, select: { id: true, type: true, amount: true, origin: true, description: true, createdAt: true, repairId: true, resaleDeviceId: true, commerceSaleId: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 6 }),
      tx.resaleDevice.findMany({ where: { businessId, status: 'READY_FOR_SALE' }, select: { id: true, brand: true, model: true }, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take: 3 }),
    ])
    const income = cash.filter(row => row.type === 'INCOME').reduce((sum, row) => sum + (row._sum.amount ?? 0), 0)
    const expense = cash.filter(row => row.type === 'EXPENSE').reduce((sum, row) => sum + (row._sum.amount ?? 0), 0)
    const countStatus = (value: RepairStatus) => status.find(row => row.status === value)?._count ?? 0
    const equipmentReady = deviceStatus.find(row => row.status === 'READY_FOR_SALE')?._count ?? 0
    const activeRepairs = status.filter(row => row.status !== 'DELIVERED' && row.status !== 'CANCELLED').reduce((sum, row) => sum + row._count, 0)
    let charts = null
    if (features.dashboardComplete) {
      charts = {
        cashFlow: await dashboardCashFlow(tx, businessId, range),
        byStatus: status.map(row => ({ status: row.status.toLowerCase(), value: row._count })),
        incomeByArea: cash.filter(row => row.type === 'INCOME' && (row._sum.amount ?? 0) > 0).map(row => ({ origin: row.origin, value: row._sum.amount ?? 0 })),
      }
    }
    const attention: AttentionGroup[] = [
      { key: 'ready', title: 'Listas para entregar', count: countStatus('READY'), href: '/admin/reparaciones?status=ready', items: readyItems.map(repairItem) },
      { key: 'pending', title: 'Reparaciones con saldo', count: pending._count, href: '/admin/reparaciones', items: pendingItems.map(repairItem) },
      { key: 'delayed', title: 'Entrega estimada vencida', count: delayedCount, href: '/admin/reparaciones', items: delayedItems.map(repairItem) },
      { key: 'warranty', title: 'Garantías que vencen en 7 días', count: warrantyCount, href: '/admin/garantias', items: warrantyItems.map(repairItem) },
      { key: 'equipment', title: 'Equipos listos para vender', count: equipmentReady, href: '/admin/venta-equipos', items: equipmentItems.map(device => ({ id: device.id, title: `${device.brand} ${device.model}`, detail: 'Listo para vender', href: '/admin/venta-equipos' })) },
    ]
    return {
      generatedAt: now.toISOString(),
      period: { key: period, start: range.start.toISOString(), end: range.end.toISOString(), timeZone: range.timeZone },
      financial: { income, expense, balance: income - expense },
      current: { activeRepairs, readyRepairs: countStatus('READY'), pending: (pending._sum.total ?? 0) - (pending._sum.paid ?? 0) },
      charts,
      attention: attention.filter(group => group.count > 0),
      modules: {
        repairs: { received, active: activeRepairs, income: cash.find(row => row.origin === 'REPAIR' && row.type === 'INCOME')?._sum.amount ?? 0 },
        commerce: commerce ? { sales: commerce._count, revenue: commerce._sum.total ?? 0, grossProfit: commerce._sum.profit ?? 0 } : null,
        // Equipment has no plan gate in the existing module; Dashboard is OWNER-only.
        equipment: { ready: equipmentReady, inProcess: deviceStatus.filter(row => row.status !== 'SOLD').reduce((sum, row) => sum + row._count, 0), sales: deviceSales._count, revenue: deviceSales._sum.actualSalePrice ?? 0, profit: (deviceSales._sum.actualSalePrice ?? 0) - (deviceSales._sum.saleCostBasis ?? 0) },
      },
      activity: activity.map(item => ({ ...item, href: item.repairId ? `/admin/reparaciones/${item.repairId}` : item.resaleDeviceId ? '/admin/venta-equipos' : item.commerceSaleId && features.commerce ? '/admin/comercio' : '/admin/caja' })),
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 })
}

import { PaymentMethod, RepairStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

export const reportPeriodSchema = z.object({
  period: z.enum(['today', 'last_7_days', 'this_month', 'previous_month', 'last_3_months', 'this_year', 'custom']).default('this_month'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).superRefine((value, context) => {
  if (value.period === 'custom' && (!value.from || !value.to)) {
    context.addIssue({ code: 'custom', message: 'El período personalizado requiere fecha desde y hasta' })
  }
})

export type ReportPeriodInput = z.infer<typeof reportPeriodSchema>

const DAY_MS = 86_400_000
const activeStatuses: RepairStatus[] = Object.values(RepairStatus).filter(status => !['DELIVERED', 'CANCELLED'].includes(status))

const startOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
const addUtcDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS)
const parseUtcDate = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('INVALID_PERIOD')
  return date
}

export function resolveReportPeriod(input: ReportPeriodInput, now = new Date()) {
  const today = startOfUtcDay(now)
  let from: Date
  let toExclusive: Date
  switch (input.period) {
    case 'today': from = today; toExclusive = addUtcDays(today, 1); break
    case 'last_7_days': from = addUtcDays(today, -6); toExclusive = addUtcDays(today, 1); break
    case 'previous_month':
      from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
      toExclusive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)); break
    case 'last_3_months':
      from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1))
      toExclusive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)); break
    case 'this_year':
      from = new Date(Date.UTC(today.getUTCFullYear(), 0, 1))
      toExclusive = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1)); break
    case 'custom':
      from = parseUtcDate(input.from as string)
      toExclusive = addUtcDays(parseUtcDate(input.to as string), 1); break
    default:
      from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
      toExclusive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
  }
  if (from >= toExclusive || toExclusive.getTime() - from.getTime() > 366 * DAY_MS) throw new Error('INVALID_PERIOD')
  return { key: input.period, timezone: 'UTC' as const, from, toExclusive, to: new Date(toExclusive.getTime() - 1) }
}

type CountItem = { label: string; value: number }
const topCounts = (values: string[], limit = 7): CountItem[] => Object.entries(values.reduce<Record<string, number>>((acc, value) => {
  const label = value.trim() || 'Sin especificar'
  acc[label] = (acc[label] ?? 0) + 1
  return acc
}, {})).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label, value]) => ({ label, value }))

const groupByDay = (from: Date, toExclusive: Date) => {
  const days = Math.ceil((toExclusive.getTime() - from.getTime()) / DAY_MS)
  return days <= 31 ? 'day' : days <= 120 ? 'week' : 'month'
}

const bucketKey = (date: Date, granularity: 'day' | 'week' | 'month') => {
  const day = startOfUtcDay(date)
  if (granularity === 'month') return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}`
  if (granularity === 'week') {
    const mondayOffset = (day.getUTCDay() + 6) % 7
    return addUtcDays(day, -mondayOffset).toISOString().slice(0, 10)
  }
  return day.toISOString().slice(0, 10)
}

export async function getReportsOverview(businessId: string, input: ReportPeriodInput) {
  const period = resolveReportPeriod(input)
  const range = { gte: period.from, lt: period.toExclusive }
  const now = new Date()
  const [repairs, deliveredRepairs, payments, expenses, newClients] = await Promise.all([
    prisma.repair.findMany({
      where: { businessId, createdAt: range },
      select: { id: true, number: true, clientId: true, deviceBrand: true, deviceModel: true, issue: true, status: true, total: true, paid: true, partsCost: true, laborCost: true, estimatedDeliveryDate: true, deliveredAt: true, createdAt: true, client: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.repair.findMany({ where: { businessId, deliveredAt: range }, select: { createdAt: true, deliveredAt: true } }),
    prisma.payment.findMany({ where: { businessId, createdAt: range }, select: { amount: true, method: true, createdAt: true } }),
    prisma.cashMovement.findMany({ where: { businessId, type: 'EXPENSE', createdAt: range }, select: { amount: true, createdAt: true } }),
    prisma.client.count({ where: { businessId, createdAt: range } }),
  ])

  const validRepairs = repairs.filter(repair => repair.status !== 'CANCELLED')
  const billed = validRepairs.reduce((sum, repair) => sum + repair.total, 0)
  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const outstanding = validRepairs.reduce((sum, repair) => sum + Math.max(0, repair.total - repair.paid), 0)
  const repairPartsCost = validRepairs.reduce((sum, repair) => sum + repair.partsCost, 0)
  const laborCost = validRepairs.reduce((sum, repair) => sum + repair.laborCost, 0)
  const expensesTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const estimatedProfit = billed - repairPartsCost - laborCost - expensesTotal
  const active = repairs.filter(repair => activeStatuses.includes(repair.status)).length
  const overdue = repairs.filter(repair => activeStatuses.includes(repair.status) && repair.estimatedDeliveryDate && repair.estimatedDeliveryDate < now).length
  const averageDeliveryHours = deliveredRepairs.length
    ? deliveredRepairs.reduce((sum, repair) => sum + Math.max(0, (repair.deliveredAt as Date).getTime() - repair.createdAt.getTime()), 0) / deliveredRepairs.length / 3_600_000
    : 0
  const clientStats = new Map<string, { name: string; repairs: number; billed: number; outstanding: number }>()
  for (const repair of validRepairs) {
    const current = clientStats.get(repair.clientId) ?? { name: repair.client.name, repairs: 0, billed: 0, outstanding: 0 }
    current.repairs += 1; current.billed += repair.total; current.outstanding += Math.max(0, repair.total - repair.paid)
    clientStats.set(repair.clientId, current)
  }
  const clientRows = [...clientStats.values()]
  const granularity = groupByDay(period.from, period.toExclusive)
  const timelineMap = new Map<string, { label: string; billed: number; collected: number; expenses: number; partsCost: number; repairs: number }>()
  const timelineRow = (date: Date) => {
    const label = bucketKey(date, granularity)
    const current = timelineMap.get(label) ?? { label, billed: 0, collected: 0, expenses: 0, partsCost: 0, repairs: 0 }
    timelineMap.set(label, current); return current
  }
  for (const repair of validRepairs) { const row = timelineRow(repair.createdAt); row.billed += repair.total; row.repairs += 1 }
  for (const payment of payments) timelineRow(payment.createdAt).collected += payment.amount
  for (const expense of expenses) timelineRow(expense.createdAt).expenses += expense.amount
  const profitability = validRepairs.map(repair => ({ id: repair.id, number: repair.number, label: `#${repair.number} · ${repair.deviceBrand} ${repair.deviceModel}`, billed: repair.total, profit: repair.total - repair.partsCost - repair.laborCost, margin: repair.total ? (repair.total - repair.partsCost - repair.laborCost) / repair.total : 0 }))

  return {
    period: { key: period.key, timezone: period.timezone, from: period.from.toISOString(), to: period.to.toISOString(), granularity },
    summary: {
      income: collected, expenses: expensesTotal, estimatedProfit, collected, receivable: outstanding,
      repairsIncoming: repairs.length, repairsDelivered: deliveredRepairs.length, repairsActive: active,
      averageTicket: validRepairs.length ? billed / validRepairs.length : 0,
      partsCost: repairPartsCost, estimatedMargin: billed ? estimatedProfit / billed : 0,
      newClients, recurrentClients: clientRows.filter(client => client.repairs > 1).length,
    },
    repairs: {
      byStatus: Object.values(RepairStatus).map(status => ({ label: status, value: repairs.filter(repair => repair.status === status).length })),
      timeline: [...timelineMap.values()].sort((a, b) => a.label.localeCompare(b.label)).map(row => ({ label: row.label, value: row.repairs })),
      completed: deliveredRepairs.length, cancelled: repairs.filter(repair => repair.status === 'CANCELLED').length,
      averageDeliveryHours, overdue, topIssues: topCounts(repairs.map(repair => repair.issue)),
      topBrands: topCounts(repairs.map(repair => repair.deviceBrand)), topModels: topCounts(repairs.map(repair => repair.deviceModel)),
      topServices: topCounts(repairs.map(repair => repair.issue)),
      employees: { available: false, reason: 'Las reparaciones todavía no registran un técnico asignado.' },
    },
    finance: {
      billed, collected, outstanding, partsCost: repairPartsCost, laborCost, expenses: expensesTotal, estimatedProfit,
      timeline: [...timelineMap.values()].sort((a, b) => a.label.localeCompare(b.label)),
      mostProfitable: [...profitability].sort((a, b) => b.profit - a.profit).slice(0, 7),
      lowestMargin: profitability.filter(item => item.billed > 0).sort((a, b) => a.margin - b.margin).slice(0, 7),
      paymentMethods: Object.values(PaymentMethod).map(method => ({ label: method, value: payments.filter(payment => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0) })),
      fullyPaid: validRepairs.filter(repair => repair.total > 0 && repair.paid >= repair.total).length,
      partiallyPaid: validRepairs.filter(repair => repair.paid > 0 && repair.paid < repair.total).length,
    },
    clients: {
      new: newClients, recurrent: clientRows.filter(client => client.repairs > 1).length,
      topByRepairs: [...clientRows].sort((a, b) => b.repairs - a.repairs).slice(0, 7),
      topByBilled: [...clientRows].sort((a, b) => b.billed - a.billed).slice(0, 7),
      topOutstanding: [...clientRows].sort((a, b) => b.outstanding - a.outstanding).filter(item => item.outstanding > 0).slice(0, 7),
      averageRepairs: clientRows.length ? validRepairs.length / clientRows.length : 0,
    },
    employees: { available: false, reason: 'No existe una relación de asignación entre reparaciones y usuarios; no se muestran métricas estimadas.' },
  }
}

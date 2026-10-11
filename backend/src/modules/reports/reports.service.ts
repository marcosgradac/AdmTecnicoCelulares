import { PaymentMethod, Prisma, RepairStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ARGENTINA_TIME_ZONE, getArgentinaCalendarDate, getArgentinaCalendarDayBounds, getArgentinaCalendarDayNumber, getArgentinaDayBounds, getArgentinaDayRangeBack } from '../../lib/argentina-day'

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

const parseCalendarDate = (value: string) => {
  // Esta fecha UTC representa sólo la fecha civil para validación, no un límite de query.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_PERIOD')
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('INVALID_PERIOD')
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), ordinal: date.getTime() / DAY_MS }
}

export function resolveReportPeriod(input: ReportPeriodInput, now = new Date()) {
  const { year, month } = getArgentinaCalendarDate(now)
  const midnight = (y: number, m: number, d = 1) => getArgentinaCalendarDayBounds(y, m, d).start
  let from: Date
  let toExclusive: Date
  switch (input.period) {
    case 'today': {
      const bounds = getArgentinaDayBounds(now)
      from = bounds.start; toExclusive = bounds.end; break
    }
    case 'last_7_days': {
      const bounds = getArgentinaDayRangeBack(now, 6)
      from = bounds.start; toExclusive = bounds.end; break
    }
    case 'previous_month':
      from = midnight(year, month - 1)
      toExclusive = midnight(year, month); break
    case 'last_3_months':
      from = midnight(year, month - 2)
      toExclusive = midnight(year, month + 1); break
    case 'this_year':
      from = midnight(year, 1)
      toExclusive = midnight(year + 1, 1); break
    case 'custom': {
      const start = parseCalendarDate(input.from as string)
      const end = parseCalendarDate(input.to as string)
      const days = end.ordinal - start.ordinal + 1
      if (days < 1 || days > 366) throw new Error('INVALID_PERIOD')
      from = midnight(start.year, start.month, start.day)
      toExclusive = getArgentinaCalendarDayBounds(end.year, end.month, end.day).end; break
    }
    default:
      from = midnight(year, month)
      toExclusive = midnight(year, month + 1)
  }
  return { key: input.period, timezone: ARGENTINA_TIME_ZONE, from, toExclusive, to: new Date(toExclusive.getTime() - 1) }
}

type CountItem = { label: string; value: number }
const topCounts = (values: string[], limit = 7): CountItem[] => Object.entries(values.reduce<Record<string, number>>((acc, value) => {
  const label = value.trim() || 'Sin especificar'
  acc[label] = (acc[label] ?? 0) + 1
  return acc
}, {})).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label, value]) => ({ label, value }))

const groupByDay = (from: Date, toExclusive: Date) => {
  const days = getArgentinaCalendarDayNumber(toExclusive) - getArgentinaCalendarDayNumber(from)
  return days <= 31 ? 'day' : days <= 120 ? 'week' : 'month'
}

const bucketKey = (date: Date, granularity: 'day' | 'week' | 'month') => {
  // Proxy UTC de la fecha CIVIL argentina, usado sólo para etiquetas y aritmética semanal.
  const day = new Date(getArgentinaCalendarDayNumber(date) * DAY_MS)
  if (granularity === 'month') return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}`
  if (granularity === 'week') {
    const mondayOffset = (day.getUTCDay() + 6) % 7
    day.setUTCDate(day.getUTCDate() - mondayOffset)
    return day.toISOString().slice(0, 10)
  }
  return day.toISOString().slice(0, 10)
}

export const getReportsOverview = (businessId: string, input: ReportPeriodInput) => prisma.$transaction(tx => getReportsOverviewInTransaction(tx, businessId, input), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 })

async function getReportsOverviewInTransaction(tx: Prisma.TransactionClient, businessId: string, input: ReportPeriodInput) {
  const period = resolveReportPeriod(input)
  const range = { gte: period.from, lt: period.toExclusive }
  const now = new Date()
  const [repairs, deliveredRepairs, payments, expenses, newClients] = await Promise.all([
    tx.repair.findMany({
      where: { businessId, createdAt: range },
      select: { id: true, number: true, clientId: true, deviceBrand: true, deviceModel: true, issue: true, status: true, cancelledAt: true, cancellationRefundMovementId: true, total: true, paid: true, partsCost: true, financeVersion: true, laborCost: true, estimatedDeliveryDate: true, deliveredAt: true, createdAt: true, client: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    tx.repair.findMany({ where: { businessId, deliveredAt: range }, select: { createdAt: true, deliveredAt: true } }),
    tx.payment.findMany({ where: { businessId, createdAt: range }, select: { amount: true, method: true, createdAt: true } }),
    tx.cashMovement.findMany({ where: { businessId, type: 'EXPENSE', createdAt: range }, select: { id: true, amount: true, repairId: true, accountingOnly: true, repairFinanceKind: true, createdAt: true } }),
    tx.client.count({ where: { businessId, createdAt: range } }),
  ])

  const [cashIncomeRows, actualPartsEntries, cancelledBalances] = await Promise.all([
    tx.cashMovement.findMany({ where: { businessId, type: 'INCOME', createdAt: range }, select: { amount: true, repairFinanceKind: true } }),
    tx.cashMovement.findMany({ where: { businessId, repairId: { in: repairs.map(repair => repair.id) }, OR: [{ repairFinanceKind: { in: ['PURCHASE', 'SUPPLIER_REFUND', 'EXPENSE_CORRECTION'] } }, { repairFinanceKind: null, type: 'EXPENSE', warrantyExpense: { is: null } }], createdAt: { lt: period.toExclusive } }, select: { id: true, amount: true, repairId: true, repairFinanceKind: true, createdAt: true } }),
    tx.repair.findMany({ where: { businessId, status: 'CANCELLED', cancellationReviewFee: { gt: 0 } }, select: { cancellationReviewFee: true, cancellationPaidAmount: true, cancellationReviewPaid: true } }),
  ])
  const cashIncome = cashIncomeRows.reduce((sum, row) => sum + row.amount, 0)
  const supplierRecovery = cashIncomeRows.filter(row => row.repairFinanceKind === 'SUPPLIER_REFUND').reduce((sum, row) => sum + row.amount, 0)
  const accountingAdjustment = -expenses.filter(row => row.accountingOnly).reduce((sum, row) => sum + row.amount, 0)
  const unclassifiedExpenses = actualPartsEntries.filter(row => row.repairFinanceKind === null && !repairs.some(repair => repair.cancellationRefundMovementId === row.id)).length
  const actualCost = (repair: typeof repairs[number]) => actualPartsEntries.filter(row => row.repairId === repair.id && row.id !== repair.cancellationRefundMovementId).reduce((sum, row) => sum + (row.repairFinanceKind === 'SUPPLIER_REFUND' ? -row.amount : row.amount), 0)

  const validRepairs = repairs.filter(repair => repair.status !== 'CANCELLED' || repair.cancelledAt !== null && repair.cancelledAt >= period.toExclusive)
  const billed = validRepairs.reduce((sum, repair) => sum + repair.total, 0)
  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const cancellationReceivable = cancelledBalances.reduce((sum, repair) => sum + Math.max(0, (repair.cancellationReviewFee ?? 0) - (repair.cancellationPaidAmount ?? 0) - repair.cancellationReviewPaid), 0)
  const outstanding = validRepairs.reduce((sum, repair) => sum + Math.max(0, repair.total - repair.paid), 0) + cancellationReceivable
  const repairPartsCost = validRepairs.reduce((sum, repair) => sum + actualCost(repair), 0)
  const laborCost = validRepairs.reduce((sum, repair) => sum + repair.laborCost, 0)
  const expensesTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  // Costs come from the dated ledger, never from an editable parts budget.
  // Entries recognized in an order's costs must not be deducted a second time.
  const expensesAlreadyInRepairCosts = expenses.reduce((sum, expense) => sum + (
    validRepairs.some(repair => repair.id === expense.repairId) && actualPartsEntries.some(row => row.id === expense.id && !repairs.some(repair => repair.cancellationRefundMovementId === row.id))
      ? expense.amount : 0
  ), 0)
  const additionalExpenses = expensesTotal - expensesAlreadyInRepairCosts
  const additionalRecoveries = supplierRecovery - actualPartsEntries.filter(row => row.repairFinanceKind === 'SUPPLIER_REFUND' && row.createdAt >= period.from && validRepairs.some(repair => repair.id === row.repairId)).reduce((sum, row) => sum + row.amount, 0)
  const estimatedProfit = billed - repairPartsCost - laborCost - additionalExpenses + additionalRecoveries
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
  const timelineMap = new Map<string, { label: string; billed: number; collected: number; expenses: number; accountingAdjustment: number; partsCost: number; repairs: number }>()
  const timelineRow = (date: Date) => {
    const label = bucketKey(date, granularity)
    const current = timelineMap.get(label) ?? { label, billed: 0, collected: 0, expenses: 0, accountingAdjustment: 0, partsCost: 0, repairs: 0 }
    timelineMap.set(label, current); return current
  }
  for (const repair of validRepairs) { const row = timelineRow(repair.createdAt); row.billed += repair.total; row.partsCost += actualCost(repair); row.repairs += 1 }
  for (const payment of payments) timelineRow(payment.createdAt).collected += payment.amount
  for (const expense of expenses) {
    const row = timelineRow(expense.createdAt)
    if (expense.accountingOnly) row.accountingAdjustment -= expense.amount
    else row.expenses += expense.amount
  }
  const profitability = validRepairs.map(repair => ({ id: repair.id, number: repair.number, label: `#${repair.number} · ${repair.deviceBrand} ${repair.deviceModel}`, billed: repair.total, profit: repair.total - actualCost(repair) - repair.laborCost, margin: repair.total ? (repair.total - actualCost(repair) - repair.laborCost) / repair.total : 0 }))

  return {
    period: { key: period.key, timezone: period.timezone, from: period.from.toISOString(), to: period.to.toISOString(), granularity },
    summary: {
      income: cashIncome, expenses: expensesTotal, estimatedProfit, collected, receivable: outstanding,
      cashBalance: cashIncome - expensesTotal - accountingAdjustment, accountingAdjustment, balance: cashIncome - expensesTotal,
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
      unclassifiedExpenses, cashIncome, supplierRecovery, cashExpenses: expensesTotal + accountingAdjustment, cashBalance: cashIncome - expensesTotal - accountingAdjustment, accountingAdjustment, balance: cashIncome - expensesTotal, cancellationReceivable,
      billed, collected, outstanding, partsCost: repairPartsCost, laborCost, expenses: expensesTotal, expensesAlreadyInRepairCosts, additionalExpenses, estimatedProfit,
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

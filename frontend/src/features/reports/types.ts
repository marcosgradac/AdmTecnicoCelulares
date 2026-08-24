export type ReportPeriodKey = 'today' | 'last_7_days' | 'this_month' | 'previous_month' | 'last_3_months' | 'this_year' | 'custom'
export type ReportCount = { label: string; value: number }
export type ReportClient = { name: string; repairs: number; billed: number; outstanding: number }

export interface ReportsOverview {
  period: { key: ReportPeriodKey; timezone: 'UTC'; from: string; to: string; granularity: 'day' | 'week' | 'month' }
  summary: { income: number; expenses: number; estimatedProfit: number; collected: number; receivable: number; repairsIncoming: number; repairsDelivered: number; repairsActive: number; averageTicket: number; partsCost: number; estimatedMargin: number; newClients: number; recurrentClients: number }
  repairs: { byStatus: ReportCount[]; timeline: ReportCount[]; completed: number; cancelled: number; averageDeliveryHours: number; overdue: number; topIssues: ReportCount[]; topBrands: ReportCount[]; topModels: ReportCount[]; topServices: ReportCount[]; employees: ReportAvailability }
  finance: { billed: number; collected: number; outstanding: number; partsCost: number; laborCost: number; expenses: number; estimatedProfit: number; timeline: Array<{ label: string; billed: number; collected: number; expenses: number; partsCost: number; repairs: number }>; mostProfitable: ReportRepairProfit[]; lowestMargin: ReportRepairProfit[]; paymentMethods: ReportCount[]; fullyPaid: number; partiallyPaid: number }
  clients: { new: number; recurrent: number; topByRepairs: ReportClient[]; topByBilled: ReportClient[]; topOutstanding: ReportClient[]; averageRepairs: number }
  employees: ReportAvailability
}

export type ReportAvailability = { available: false; reason: string }
export type ReportRepairProfit = { id: string; number: number; label: string; billed: number; profit: number; margin: number }

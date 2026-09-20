import { api } from './api'
import type { RepairStatus } from '../types'

export type DashboardPeriod = 'today' | '7d' | '30d' | 'month'
export type DashboardOrigin = 'REPAIR' | 'COMMERCE' | 'EQUIPMENT' | 'GENERAL'
export interface DashboardOverview {
  generatedAt: string
  period: { key: DashboardPeriod; start: string; end: string; timeZone: string }
  financial: { income: number; expense: number; balance: number }
  current: { activeRepairs: number; readyRepairs: number; pending: number }
  charts: null | {
    cashFlow: Array<{ label: string; income: number; expense: number }>
    byStatus: Array<{ status: RepairStatus; value: number }>
    incomeByArea: Array<{ origin: DashboardOrigin; value: number }>
  }
  attention: Array<{ key: string; title: string; count: number; href: string; items: Array<{ id: string; title: string; detail: string; href: string }> }>
  modules: {
    repairs: { received: number; active: number; income: number }
    commerce: null | { sales: number; revenue: number; grossProfit: number }
    equipment: { ready: number; inProcess: number; sales: number; revenue: number; profit: number }
  }
  activity: Array<{ id: string; type: 'INCOME' | 'EXPENSE'; amount: number; origin: DashboardOrigin; description: string; createdAt: string; href: string }>
}

export const getDashboardOverview = async (period: DashboardPeriod, signal?: AbortSignal) =>
  (await api.get<DashboardOverview>('/dashboard/overview', { params: { period }, signal })).data

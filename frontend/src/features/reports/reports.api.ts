import { api } from '../../services/api'
import type { ReportPeriodKey, ReportsOverview } from './types'

export interface ReportFilters { period: ReportPeriodKey; from?: string; to?: string }

export async function getReportsOverview(filters: ReportFilters, signal?: AbortSignal) {
  return (await api.get<ReportsOverview>('/reports/overview', { params: filters, signal })).data
}

import type { ReactNode } from 'react'
import type { WorkflowRepairStatus } from './repair.types'

export interface DashboardMetric {
  label: string
  value: string
  icon: ReactNode
  tone: 'primary' | 'warning' | 'success' | 'info'
}

export interface DashboardRepair {
  id: string
  number: number
  client: string
  device: string
  issue: string
  status: WorkflowRepairStatus
  receivedAt: string
  total: number
}

import { api } from './api'
import type { Repair } from '../types'

export interface ClientOption {
  id: string
  name: string
  phone: string | null
}

export interface ClientListRecord extends ClientOption {
  createdAt: string
  repairCount: number
  lastRepair: { deviceBrand: string; deviceModel: string } | null
}

export interface ClientRecord extends ClientOption {
  createdAt: string
  repairs: Array<{ id: string; number: number; total: number; paid: number; createdAt: string; updatedAt: string; deviceBrand: string; deviceModel: string; issue: string; status: string }>
}

export interface CashMovement {
  id: string
  type: 'INCOME' | 'EXPENSE'
  description: string
  amount: number
  method: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER' | null
  repairId: string | null
  clientName: string | null
  createdAt: string
}

export interface CashMovementsSummary {
  incomeToday: number
  expenseToday: number
  balanceToday: number
  totalMovements: number
}

export interface CashMovementsPage {
  items: CashMovement[]
  total: number
  page: number
  pageSize: number
  pages: number
  summary: CashMovementsSummary
}

export interface DashboardSummary {
  activeRepairs: number
  repairsToday: number
  monthlyIncome: number
  monthlyExpenses: number
  pending: number
  readyRepairs: number
  activeWarranties: number
  clients: number
  byStatus: Array<{ status: string; value: number }>
  recentRepairs: Array<{ id:string; number:number; deviceBrand:string; deviceModel:string; issue:string; status:string; total:number; createdAt:string; client:{name:string} }>
  cashFlow: Array<{ label: string; income: number; expense: number }>
}

export const getClientsPage = async (params:{page:number;pageSize?:number;search?:string}) => (await api.get<{items:ClientListRecord[];total:number;page:number;pageSize:number;totalPages:number}>('/clients',{params:{...params,paginated:true}})).data
export const getClientOptions = async () => (await api.get<ClientOption[]>('/clients/options')).data
export const getClient = async (id: string) => (await api.get<ClientRecord>(`/clients/${id}`)).data
export const createClient = async (input: { name: string; phone?: string }) => (await api.post<ClientRecord>('/clients', input)).data
export const updateClient = async (id: string, input: { name: string; phone?: string | null }) => (await api.patch<ClientRecord>(`/clients/${id}`, input)).data
export const getCashMovements = async (params: { page: number; pageSize: number }) => (await api.get<CashMovementsPage>('/cash/movements', { params })).data
export const createCashMovement = async (input: { type: 'INCOME' | 'EXPENSE'; description: string; amount: number; method?: CashMovement['method'] }) => (await api.post<CashMovement>('/cash/movements', input)).data
export const getDashboardSummary = async () => (await api.get<DashboardSummary>('/dashboard/summary')).data
export const registerPayment = async (repairId: string, input: { amount: number; method: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'; note?: string }) => { await api.post(`/repairs/${repairId}/payments`, input) }

export type { Repair }

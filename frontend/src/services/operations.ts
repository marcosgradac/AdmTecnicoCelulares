import { api } from './api'
import type { Repair } from '../types'

export interface ClientRecord {
  id: string
  name: string
  phone: string | null
  createdAt: string
  repairs: Array<{ id: string; number: number; total: number; paid: number; createdAt: string; updatedAt: string; deviceBrand: string; deviceModel: string; issue: string; status: string }>
}

export interface StockItem {
  id: string
  name: string
  category: string
  compatibleBrand: string | null
  compatibleModel: string | null
  quantity: number
  minimumStock: number
  cost: number
  salePrice: number
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

export interface DashboardSummary {
  activeRepairs: number
  repairsToday: number
  monthlyIncome: number
  clients: number
  byStatus: Array<{ status: string; value: number }>
  recentRepairs: unknown[]
}

export const getClients = async () => (await api.get<ClientRecord[]>('/clients')).data
export const getClient = async (id: string) => (await api.get<ClientRecord>(`/clients/${id}`)).data
export const createClient = async (input: { name: string; phone?: string }) => (await api.post<ClientRecord>('/clients', input)).data
export const getStock = async () => (await api.get<StockItem[]>('/stock')).data
export const createStockItem = async (input: Omit<StockItem, 'id'>) => (await api.post<StockItem>('/stock', input)).data
export const updateStockItem = async (id: string, input: Partial<Omit<StockItem, 'id'>>) => (await api.patch<StockItem>(`/stock/${id}`, input)).data
export const deactivateStockItem = async (id: string) => { await api.delete(`/stock/${id}`) }
export const getCashMovements = async () => (await api.get<CashMovement[]>('/cash/movements')).data
export const createCashMovement = async (input: { type: 'INCOME' | 'EXPENSE'; description: string; amount: number; method?: CashMovement['method'] }) => (await api.post<CashMovement>('/cash/movements', input)).data
export const getDashboardSummary = async () => (await api.get<DashboardSummary>('/dashboard/summary')).data
export const registerPayment = async (repairId: string, input: { amount: number; method: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'; note?: string }) => { await api.post(`/repairs/${repairId}/payments`, input) }

export type { Repair }

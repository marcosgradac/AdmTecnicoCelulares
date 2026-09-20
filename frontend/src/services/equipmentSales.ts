import { api } from './api'

export type EquipmentStatus = 'PURCHASED' | 'REPAIRING' | 'READY_FOR_SALE' | 'SOLD'
export type EquipmentPaymentMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'
export interface EquipmentInput {
  brand: string
  model: string
  purchasePrice: number
  repairExpenses: number
  estimatedSalePrice: number
}
export interface ResaleDevice extends EquipmentInput {
  id: string
  status: EquipmentStatus
  version: number
  actualSalePrice: number | null
  salePaymentMethod: EquipmentPaymentMethod | null
  saleCostBasis: number | null
  soldAt: string | null
  createdAt: string
  updatedAt: string
  totalCost: number
  estimatedProfit: number
  realizedProfit: number | null
}
export interface EquipmentSummary {
  inProcess: number
  readyForSale: number
  totalInvested: number
  purchaseInvestment: number
  repairInvestment: number
  salesCount: number
  salesRevenue: number
  realizedProfit: number
}
export interface EquipmentPage { items: ResaleDevice[]; total: number; page: number; pageSize: number; pages: number }
export interface EquipmentSaleInput { expectedVersion: number; actualSalePrice: number; salePaymentMethod: EquipmentPaymentMethod; soldAt?: string }

export const getEquipmentPage = async (params: { page: number; pageSize: number; search?: string; status?: EquipmentStatus }) => (await api.get<EquipmentPage>('/equipment-sales', { params })).data
export const getEquipmentSummary = async () => (await api.get<EquipmentSummary>('/equipment-sales/summary')).data
export const createEquipment = async (input: EquipmentInput) => (await api.post<ResaleDevice>('/equipment-sales', input)).data
export const updateEquipment = async (id: string, input: EquipmentInput & { status: Exclude<EquipmentStatus, 'SOLD'>; expectedVersion: number }) => (await api.patch<ResaleDevice>(`/equipment-sales/${id}`, input)).data
export const sellEquipment = async (id: string, input: EquipmentSaleInput) => (await api.post<ResaleDevice>(`/equipment-sales/${id}/sell`, input)).data

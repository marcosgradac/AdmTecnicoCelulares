import { api } from './api'

export interface RepairPart {
  id: string
  stockItemId: string
  name: string
  quantity: number
  unitCost: number
  unitPrice: number
  subtotal: number
  createdAt: string
}

export interface AddRepairPartInput {
  stockItemId: string
  quantity: number
  unitPrice: number
}

export const getRepairParts = async (repairId: string) =>
  (await api.get<RepairPart[]>(`/repairs/${repairId}/parts`)).data

export const addRepairPart = async (repairId: string, input: AddRepairPartInput) =>
  (await api.post<RepairPart>(`/repairs/${repairId}/parts`, input)).data

export const removeRepairPart = async (repairId: string, partId: string) => {
  await api.delete(`/repairs/${repairId}/parts/${partId}`)
}

import { api } from '../../../services/api'
import type { InventoryItem, InventoryItemDetail, InventoryItemInput, InventoryList, InventoryMovement, InventoryMovementInput, InventorySummary } from '../types/inventory.types'

export interface InventoryFilters { page?: number; pageSize?: number; search?: string; category?: string; stock?: 'all'|'low'|'out'; active?: 'true'|'false'|'all'; sortBy?: 'name'|'stock'|'updatedAt'; order?: 'asc'|'desc' }
export const listInventory = async (filters: InventoryFilters = {}) => (await api.get<InventoryList>('/inventory', { params: filters })).data
export const getInventorySummary = async () => (await api.get<InventorySummary>('/inventory/summary')).data
export const getInventoryItem = async (id: string) => (await api.get<InventoryItemDetail>(`/inventory/${id}`)).data
export const createInventoryItem = async (input: InventoryItemInput) => (await api.post<InventoryItem>('/inventory', input)).data
export const updateInventoryItem = async (id: string, input: Partial<Omit<InventoryItemInput,'currentStock'>>) => (await api.patch<InventoryItem>(`/inventory/${id}`, input)).data
export const deactivateInventoryItem = async (id: string) => (await api.patch<InventoryItem>(`/inventory/${id}/deactivate`)).data
export const createInventoryMovement = async (id: string, input: InventoryMovementInput) => (await api.post<InventoryMovement>(`/inventory/${id}/movements`, input)).data

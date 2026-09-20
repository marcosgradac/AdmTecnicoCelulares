import { api } from './api'

export type CommercePaymentMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'
export interface CommerceProduct {
  id: string
  name: string
  category: string
  purchaseCost: number
  salePrice: number
  currentStock: number
  active: boolean
  unitProfit: number
}
export interface CommerceCategory { id: string; name: string; productCount: number }
export interface CommerceSaleLine { id: string; productId: string; productName: string; quantity: number; unitCost: number; unitPrice: number; lineTotal: number; lineCost: number; lineProfit: number }
export interface CommerceSale { id: string; total: number; costOfGoodsSold: number; profit: number; paymentMethod: CommercePaymentMethod; createdAt: string; lines: CommerceSaleLine[] }
export interface CommerceSummary { sales: number; revenue: number; costOfGoodsSold: number; profit: number; commercialExpenses: number; netProfit: number; products: number }

export const getCommerceProducts = async (params: { page?: number; pageSize?: number; search?: string; inStock?: boolean } = {}) => (await api.get<{ items: CommerceProduct[]; total: number; page: number; pageSize: number; pages: number }>('/commerce/products', { params })).data
export const getCommerceCategories = async () => (await api.get<CommerceCategory[]>('/commerce/categories')).data
export const createCommerceCategory = async (name: string) => (await api.post<CommerceCategory>('/commerce/categories', { name })).data
export const createCommerceProduct = async (input: Pick<CommerceProduct, 'name' | 'category' | 'purchaseCost' | 'salePrice' | 'currentStock'>) => (await api.post<CommerceProduct>('/commerce/products', input)).data
export const updateCommerceProduct = async (id: string, input: Pick<CommerceProduct, 'name' | 'category' | 'purchaseCost' | 'salePrice' | 'currentStock'> & { active?: boolean; expectedStock: number }) => (await api.patch<CommerceProduct>(`/commerce/products/${id}`, input)).data
export const deleteCommerceProduct = async (id: string) => (await api.delete(`/commerce/products/${id}`)).data
export const deleteCommerceCategory = async (id: string) => (await api.delete(`/commerce/categories/${id}`)).data
export const createCommerceSale = async (input: { lines: Array<{ productId: string; quantity: number; expectedUnitPrice: number }>; paymentMethod: CommercePaymentMethod; expectedTotal: number; idempotencyKey: string }) => (await api.post<CommerceSale>('/commerce/sales', input)).data
export const getCommerceSales = async (params: { page?: number; pageSize?: number } = {}) => (await api.get<{ items: CommerceSale[]; total: number; page: number; pageSize: number; pages: number }>('/commerce/sales', { params })).data
export const getCommerceSummary = async (params: { from?: string; to?: string } = {}) => (await api.get<CommerceSummary>('/commerce/summary', { params })).data
export const createCommerceExpense = async (input: { description: string; amount: number; paymentMethod: CommercePaymentMethod }) => (await api.post('/commerce/expenses', input)).data

export const updateCommerceCategory = async (id: string, name: string) => (await api.patch<CommerceCategory>('/commerce/categories/' + encodeURIComponent(id), { name })).data

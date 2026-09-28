import { api } from '../../services/api'

export type WarrantyClaimStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED'
export type WarrantyPaymentMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'
export interface WarrantyExpense { id: string; concept: string; createdAt: string; cashMovementId: string; cashMovement: { id: string; amount: number; method: WarrantyPaymentMethod } }
export interface WarrantyClaim {
  id: string; repairId: string; description: string; status: WarrantyClaimStatus; resolution: string | null; createdAt: string; resolvedAt: string | null
  coveredWarrantyStartedAt: string | null; coveredWarrantyExpiresAt: string | null; coveredWarrantyDurationDays: number | null; coveredWarrantyConditions: string | null
  deliveredAt: string | null; newWarrantyDurationDays: number | null; newWarrantyStartedAt: string | null; newWarrantyExpiresAt: string | null
  expenses: WarrantyExpense[]
}
export interface WarrantyRepair { id: string; number: number; deviceBrand: string; deviceModel: string; warrantyEnabled: boolean; warrantyDurationDays: number | null; warrantyStartedAt: string | null; warrantyExpiresAt: string | null; warrantyConditions: string | null; client: { id: string; name: string; phone: string | null }; warrantyClaims: WarrantyClaim[] }
export const getWarranties = async () => (await api.get<WarrantyRepair[]>('/warranties')).data
export interface WarrantyInitialExpense { concept: string; amount: number; method: WarrantyPaymentMethod; idempotencyKey: string }
export const createWarrantyClaim = async (repairId: string, description: string, initialExpense?: WarrantyInitialExpense) =>
  // El gasto inicial viaja en la misma petición: el backend registra reclamo y egreso atómicamente.
  (await api.post<WarrantyClaim>(`/warranties/${repairId}/claims`, { description, ...(initialExpense && { initialExpense }) })).data
export const updateWarrantyClaim = async (id: string, input: { status: WarrantyClaimStatus; resolution?: string }) => (await api.patch<WarrantyClaim>(`/warranties/claims/${id}`, input)).data
export const addWarrantyExpense = async (id: string, input: { concept: string; amount: number; method: WarrantyPaymentMethod; idempotencyKey: string }) => (await api.post<WarrantyExpense>(`/warranties/claims/${id}/expenses`, input)).data
export const deliverWarrantyClaim = async (id: string, warrantyDurationDays: number) => (await api.post<WarrantyClaim>(`/warranties/claims/${id}/delivery`, { warrantyDurationDays })).data
export const updateWarranty = async (repairId:string,input:{durationDays:number;conditions?:string}) => (await api.patch<WarrantyRepair>(`/warranties/${repairId}`,input)).data
export const deleteWarranty = async (repairId:string) => { await api.delete(`/warranties/${repairId}`) }

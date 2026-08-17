import { api } from '../../services/api'

export type WarrantyClaimStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED'
export interface WarrantyClaim { id: string; repairId: string; description: string; status: WarrantyClaimStatus; resolution: string | null; createdAt: string; resolvedAt: string | null }
export interface WarrantyRepair { id: string; number: number; deviceBrand: string; deviceModel: string; warrantyDurationDays: number | null; warrantyStartedAt: string | null; warrantyExpiresAt: string | null; warrantyConditions: string | null; client: { id: string; name: string; phone: string | null }; warrantyClaims: WarrantyClaim[] }
export const getWarranties = async () => (await api.get<WarrantyRepair[]>('/warranties')).data
export const createWarrantyClaim = async (repairId: string, description: string) => (await api.post<WarrantyClaim>(`/warranties/${repairId}/claims`, { description })).data
export const updateWarrantyClaim = async (id: string, input: { status: WarrantyClaimStatus; resolution?: string }) => (await api.patch<WarrantyClaim>(`/warranties/claims/${id}`, input)).data
export const updateWarranty = async (repairId:string,input:{durationDays:number;conditions?:string}) => (await api.patch<WarrantyRepair>(`/warranties/${repairId}`,input)).data
export const deleteWarranty = async (repairId:string) => { await api.delete(`/warranties/${repairId}`) }

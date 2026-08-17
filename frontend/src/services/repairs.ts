import { api } from './api'
import type { Repair, RepairStatus } from '../types'

export type ApiRepairStatus = 'RECEIVED' | 'REVIEW' | 'BUDGET' | 'APPROVED' | 'WAITING_PART' | 'REPAIRING' | 'TESTING' | 'READY' | 'DELIVERED' | 'CANCELLED' | 'WARRANTY'

interface ApiClient {
  id: string
  name: string
  phone: string | null
  createdAt: string
}

interface ApiRepair {
  id: string
  number: number
  clientId: string
  deviceBrand: string
  deviceModel: string
  imei: string | null
  color: string | null
  issue: string
  diagnosis: string | null
  notes: string | null
  status: ApiRepairStatus
  total: number
  paid: number
  trackingToken: string | null
  trackingEnabled: boolean
  estimatedDeliveryDate: string | null
  statusHistory?: Array<{ id?: string; newStatus: ApiRepairStatus; publicMessage?: string | null; internalNote?: string | null; createdAt: string }>
  createdAt: string
  updatedAt: string
  client: ApiClient
}

export interface CreateRepairInput {
  clientId: string
  deviceBrand: string
  deviceModel: string
  imei?: string
  color?: string
  issue: string
  diagnosis?: string
  notes?: string
  total: number
  estimatedDeliveryDate?: string
  status?: RepairStatus
}

const statusFromApi: Record<ApiRepairStatus, RepairStatus> = {
  RECEIVED: 'received',
  REVIEW: 'review',
  BUDGET: 'budget',
  APPROVED: 'approved',
  WAITING_PART: 'waiting_part',
  REPAIRING: 'repairing',
  TESTING: 'testing',
  READY: 'ready',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  WARRANTY: 'warranty',
}

const statusToApi: Record<RepairStatus, ApiRepairStatus> = {
  received: 'RECEIVED',
  review: 'REVIEW',
  budget: 'BUDGET',
  approved: 'APPROVED',
  waiting_part: 'WAITING_PART',
  repairing: 'REPAIRING',
  testing: 'TESTING',
  ready: 'READY',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  warranty: 'WARRANTY',
}

const mapRepair = (repair: ApiRepair): Repair => ({
  id: repair.id,
  number: repair.number,
  clientId: repair.clientId,
  clientName: repair.client.name,
  phone: repair.client.phone ?? '',
  device: `${repair.deviceBrand} ${repair.deviceModel}`.trim(),
  deviceBrand: repair.deviceBrand,
  deviceModel: repair.deviceModel,
  imei: repair.imei ?? undefined,
  color: repair.color ?? undefined,
  issue: repair.issue,
  diagnosis: repair.diagnosis ?? undefined,
  notes: repair.notes ?? undefined,
  status: statusFromApi[repair.status],
  total: repair.total,
  paid: repair.paid,
  createdAt: repair.createdAt,
  updatedAt: repair.updatedAt,
  trackingToken: repair.trackingToken ?? undefined,
  trackingEnabled: repair.trackingEnabled,
  estimatedDeliveryDate: repair.estimatedDeliveryDate ?? undefined,
  history: (repair.statusHistory ?? []).map(item => ({ ...item, newStatus: statusFromApi[item.newStatus] })),
})

export async function getRepairs() {
  const response = await api.get<{ items: ApiRepair[] }>('/repairs')
  return response.data.items.map(mapRepair)
}

export async function getRepair(id: string) {
  const response = await api.get<ApiRepair>(`/repairs/${id}`)
  return mapRepair(response.data)
}

export async function getTrackingRepair(token: string) {
  const response = await api.get<ApiRepair>(`/tracking/${token}`)
  return mapRepair(response.data)
}

export async function createRepair(input: CreateRepairInput) {
  const response = await api.post<ApiRepair>('/repairs', { ...input, status: input.status ? statusToApi[input.status] : undefined })
  return mapRepair(response.data)
}

export async function updateRepairStatus(id: string, status: RepairStatus, messages?: { publicMessage?: string; internalNote?: string }) {
  const response = await api.patch<ApiRepair>(`/repairs/${id}/status`, { status: statusToApi[status], ...messages })
  return mapRepair(response.data)
}

export async function generateTrackingLink(id: string) {
  return (await api.post<{ trackingToken: string; trackingEnabled: boolean }>(`/repairs/${id}/tracking-link`)).data
}

export async function disableTrackingLink(id: string) {
  return (await api.patch<{ trackingToken: string; trackingEnabled: boolean }>(`/repairs/${id}/tracking-link`)).data
}

export type UpdateRepairInput = Pick<CreateRepairInput, 'clientId' | 'deviceBrand' | 'deviceModel' | 'imei' | 'color' | 'issue' | 'diagnosis' | 'notes' | 'total'>

export async function updateRepair(id: string, input: UpdateRepairInput) {
  const response = await api.patch<ApiRepair>(`/repairs/${id}`, input)
  return mapRepair(response.data)
}

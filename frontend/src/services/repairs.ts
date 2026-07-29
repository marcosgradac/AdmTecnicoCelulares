import { api } from './api'
import type { Repair, RepairStatus } from '../types'

export type ApiRepairStatus = 'RECEIVED' | 'REVIEW' | 'BUDGET' | 'APPROVED' | 'REPAIRING' | 'TESTING' | 'READY' | 'DELIVERED'

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
  trackingToken: string
  createdAt: string
  updatedAt: string
  client: ApiClient
}

export interface CreateRepairInput {
  clientId?: string
  clientName: string
  phone?: string
  deviceBrand: string
  deviceModel: string
  imei?: string
  color?: string
  issue: string
  diagnosis?: string
  notes?: string
  total: number
}

const statusFromApi: Record<ApiRepairStatus, RepairStatus> = {
  RECEIVED: 'received',
  REVIEW: 'review',
  BUDGET: 'budget',
  APPROVED: 'approved',
  REPAIRING: 'repairing',
  TESTING: 'testing',
  READY: 'ready',
  DELIVERED: 'delivered',
}

const statusToApi: Record<RepairStatus, ApiRepairStatus> = {
  received: 'RECEIVED',
  review: 'REVIEW',
  budget: 'BUDGET',
  approved: 'APPROVED',
  repairing: 'REPAIRING',
  testing: 'TESTING',
  ready: 'READY',
  delivered: 'DELIVERED',
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
  trackingToken: repair.trackingToken,
})

export async function getRepairs() {
  const response = await api.get<ApiRepair[]>('/repairs')
  return response.data.map(mapRepair)
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
  const response = await api.post<ApiRepair>('/repairs', input)
  return mapRepair(response.data)
}

export async function updateRepairStatus(id: string, status: RepairStatus) {
  const response = await api.patch<ApiRepair>(`/repairs/${id}/status`, { status: statusToApi[status] })
  return mapRepair(response.data)
}

export type UpdateRepairInput = Pick<CreateRepairInput, 'clientId' | 'deviceBrand' | 'deviceModel' | 'imei' | 'color' | 'issue' | 'diagnosis' | 'notes' | 'total'>

export async function updateRepair(id: string, input: UpdateRepairInput) {
  const response = await api.patch<ApiRepair>(`/repairs/${id}`, input)
  return mapRepair(response.data)
}

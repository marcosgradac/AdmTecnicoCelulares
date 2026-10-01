import { api, apiAssetUrl } from './api'
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
  partsCost?: number
  laborCost?: number
  laborCharge?: number
  cancelledAt?: string | null
  cancellationPaidAmount?: number | null
  cancellationReviewFee?: number | null
  cancellationReviewPaid?: number | null
  cancellationRefundAmount?: number | null
  cancellationRefundMethod?: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER' | null
  cancellationRefundMovementId?: string | null
  trackingToken: string | null
  trackingEnabled: boolean
  estimatedDeliveryDate: string | null
  warrantyEnabled: boolean
  warrantyDurationDays: number | null
  warrantyStartedAt: string | null
  warrantyExpiresAt: string | null
  statusHistory?: Array<{ id?: string; previousStatus?: ApiRepairStatus | null; newStatus: ApiRepairStatus; publicMessage?: string | null; internalNote?: string | null; createdAt: string }>
  payments?: Array<{ id: string; amount: number; method: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'; note?: string | null; cancellationReview?: boolean; isAdvance?: boolean; createdAt: string }>
  createdAt: string
  updatedAt: string
  client: ApiClient
  business?: { name: string | null; logoUrl: string | null }
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
  partsCost?: number
  laborCharge?: number
  advanceAmount?: number
  advanceMethod?: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'
  estimatedDeliveryDate?: string
  status?: RepairStatus
  warrantyEnabled?: boolean
  warrantyDurationDays?: number
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
  partsCost: repair.partsCost,
  laborCost: repair.laborCost,
  laborCharge: repair.laborCharge,
  cancelledAt: repair.cancelledAt ?? undefined,
  cancellationPaidAmount: repair.cancellationPaidAmount ?? undefined,
  cancellationReviewFee: repair.cancellationReviewFee ?? undefined,
  cancellationReviewPaid: repair.cancellationReviewPaid ?? undefined,
  cancellationRefundAmount: repair.cancellationRefundAmount ?? undefined,
  cancellationRefundMethod: repair.cancellationRefundMethod ?? undefined,
  cancellationRefundMovementId: repair.cancellationRefundMovementId ?? undefined,
  createdAt: repair.createdAt,
  updatedAt: repair.updatedAt,
  trackingToken: repair.trackingToken ?? undefined,
  trackingEnabled: repair.trackingEnabled,
  estimatedDeliveryDate: repair.estimatedDeliveryDate ?? undefined,
  warrantyEnabled: repair.warrantyEnabled,
  warrantyDurationDays: repair.warrantyDurationDays ?? undefined,
  warrantyStartedAt: repair.warrantyStartedAt ?? undefined,
  warrantyExpiresAt: repair.warrantyExpiresAt ?? undefined,
  history: (repair.statusHistory ?? []).map(item => ({ ...item, previousStatus: item.previousStatus ? statusFromApi[item.previousStatus] : null, newStatus: statusFromApi[item.newStatus] })),
  payments: repair.payments,
  business: repair.business ? { ...repair.business, logoUrl: apiAssetUrl(repair.business.logoUrl) ?? null } : undefined,
})

export async function getRepairs() {
  const response = await api.get<{ items: ApiRepair[] }>('/repairs', { params:{pageSize:100} })
  return response.data.items.map(mapRepair)
}
export async function getRepairsPage(params:{page:number;pageSize?:number;search?:string;status?:RepairStatus}) { const response=await api.get<{items:ApiRepair[];total:number;page:number;pageSize:number;pages:number}>('/repairs',{params:{...params,status:params.status?statusToApi[params.status]:undefined}});return {...response.data,items:response.data.items.map(mapRepair),totalPages:response.data.pages} }

export async function getRepair(id: string) {
  const response = await api.get<ApiRepair>(`/repairs/${id}`)
  return mapRepair(response.data)
}

export async function getTrackingRepair(token: string, turnstileToken?: string) {
  const response = await api.get<ApiRepair>(`/tracking/${token}`, { headers: turnstileToken ? { 'X-Turnstile-Token': turnstileToken } : undefined })
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

/** Avanza un solo paso del flujo. El backend rechaza destinos históricos y estados especiales. */
export async function advanceRepairStatus(id: string, messages?: { publicMessage?: string; internalNote?: string }) {
  const response = await api.patch<ApiRepair>(`/repairs/${id}/status/advance`, { ...messages })
  return mapRepair(response.data)
}

/** Retrocede un solo paso del flujo. No existe para Entregado, Cancelado ni Garantía. */
export async function rewindRepairStatus(id: string, messages?: { publicMessage?: string; internalNote?: string }) {
  const response = await api.patch<ApiRepair>(`/repairs/${id}/status/rewind`, { ...messages })
  return mapRepair(response.data)
}

/**
 * Corrige el adelanto inicial de una reparación ya creada. El backend actualiza en una sola
 * transacción el pago, el ingreso de caja, el pagado y el saldo.
 */
export async function updateRepairAdvance(id: string, input: { amount: number; method?: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER' }) {
  const response = await api.patch<ApiRepair>(`/repairs/${id}/advance`, input)
  return mapRepair(response.data)
}

/** Acción administrativa para una entrega cargada por error. Sólo OWNER; nunca es navegación. */
export async function correctRepairDelivery(id: string, reason: string) {
  const response = await api.post<ApiRepair>(`/repairs/${id}/delivery/correction`, { reason })
  return mapRepair(response.data)
}

export type CancelRepairInput = { reviewFee: number; refundMethod?: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER' }

export async function cancelRepair(id: string, input: CancelRepairInput) {
  const response = await api.post<ApiRepair>(`/repairs/${id}/cancel`, input)
  return mapRepair(response.data)
}

/** Cobra parte del saldo de revisión de una reparación ya cancelada. */
export async function registerCancellationPayment(id: string, input: { amount: number; method: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER' }) {
  const response = await api.post<ApiRepair>(`/repairs/${id}/cancellation-payment`, input)
  return mapRepair(response.data)
}

export async function deleteRepair(id: string) {
  await api.delete(`/repairs/${id}`)
}

export async function generateTrackingLink(id: string) {
  return (await api.post<{ trackingToken: string; trackingEnabled: boolean }>(`/repairs/${id}/tracking-link`)).data
}

export async function disableTrackingLink(id: string) {
  return (await api.patch<{ trackingToken: string; trackingEnabled: boolean }>(`/repairs/${id}/tracking-link`)).data
}

export type UpdateRepairInput = Pick<CreateRepairInput, 'deviceBrand' | 'deviceModel' | 'imei' | 'color' | 'issue' | 'diagnosis' | 'notes' | 'total'> & { clientId?: string }

export async function updateRepair(id: string, input: UpdateRepairInput) {
  const response = await api.patch<ApiRepair>(`/repairs/${id}`, input)
  return mapRepair(response.data)
}

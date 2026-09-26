export type RepairStatus =
  | 'received'
  | 'review'
  | 'budget'
  | 'approved'
  | 'waiting_part'
  | 'repairing'
  | 'testing'
  | 'ready'
  | 'delivered'
  | 'cancelled'
  | 'warranty'

export interface RepairHistory {
  id?: string
  newStatus: RepairStatus
  publicMessage?: string | null
  internalNote?: string | null
  createdAt: string
}

export interface RepairPayment {
  id: string
  amount: number
  method: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'
  note?: string | null
  cancellationReview?: boolean
  createdAt: string
}

export interface Repair {
  id: string
  number: number
  clientId: string
  clientName: string
  phone: string
  device: string
  deviceBrand: string
  deviceModel: string
  imei?: string
  color?: string
  issue: string
  diagnosis?: string
  notes?: string
  status: RepairStatus
  total: number
  paid: number
  cancelledAt?: string
  cancellationPaidAmount?: number
  cancellationReviewFee?: number
  cancellationReviewPaid?: number
  cancellationRefundAmount?: number
  cancellationRefundMethod?: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'
  cancellationRefundMovementId?: string
  createdAt: string
  updatedAt: string
  trackingToken?: string
  trackingEnabled?: boolean
  estimatedDeliveryDate?: string
  warrantyEnabled?: boolean
  warrantyDurationDays?: number
  warrantyStartedAt?: string
  warrantyExpiresAt?: string
  history?: RepairHistory[]
  payments?: RepairPayment[]
  business?: { name: string | null; logoUrl: string | null }
}

/** Saldo de revisión que falta cobrar. Refleja la misma fórmula que usa el backend. */
export const cancellationReviewBalance = (repair: Pick<Repair, 'cancellationReviewFee' | 'cancellationReviewPaid' | 'cancellationPaidAmount'>) =>
  Math.max(0, (repair.cancellationReviewFee ?? 0) - (repair.cancellationReviewPaid ?? 0) - (repair.cancellationPaidAmount ?? 0))

/** Resultado económico final de una reparación cancelada: sólo el costo de revisión. */
export const cancellationNetAmount = (repair: Pick<Repair, 'cancellationReviewFee'>) => repair.cancellationReviewFee ?? 0

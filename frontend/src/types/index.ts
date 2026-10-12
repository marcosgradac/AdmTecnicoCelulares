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
  | 'warranty'

export interface RepairHistory {
  id?: string
  previousStatus?: RepairStatus | null
  newStatus: RepairStatus
  publicMessage?: string | null
  internalNote?: string | null
  createdAt: string
}

/** Entrada de historial que no cambia el estado (por ejemplo, una corrección del adelanto). */
export const isStatusNote = (item: RepairHistory) => Boolean(item.internalNote) && item.previousStatus === item.newStatus

export interface RepairPayment {
  id: string
  amount: number
  method: 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'
  note?: string | null
  isAdvance?: boolean
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
  partsCost?: number
  laborCost?: number
  laborCharge?: number
  createdAt: string
  updatedAt: string
  trackingToken?: string
  trackingEnabled?: boolean
  /**
   * Vencimiento del enlace público, o `null` mientras la reparación no está
   * entregada. Lo devuelve el backend ya calculado: la interfaz no lo recalcula.
   */
  trackingExpiresAt?: string | null
  estimatedDeliveryDate?: string
  warrantyEnabled?: boolean
  warrantyDurationDays?: number
  warrantyStartedAt?: string
  warrantyExpiresAt?: string
  history?: RepairHistory[]
  payments?: RepairPayment[]
  business?: { name: string | null; logoUrl: string | null }
}

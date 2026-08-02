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
  createdAt: string
  updatedAt: string
  trackingToken?: string
  trackingEnabled?: boolean
  estimatedDeliveryDate?: string
  history?: RepairHistory[]
}

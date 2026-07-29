export type RepairStatus =
  | 'received'
  | 'review'
  | 'budget'
  | 'approved'
  | 'repairing'
  | 'testing'
  | 'ready'
  | 'delivered'

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
  trackingToken: string
}

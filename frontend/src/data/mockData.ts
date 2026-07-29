import type { Repair, RepairStatus } from '../types'
import { repairStatusConfig } from '../config/repairStatus'

export const statusLabels = Object.fromEntries(
  Object.entries(repairStatusConfig).map(([key, value]) => [key, value.label])
) as Record<RepairStatus, string>

export const mockRepairs: Repair[] = [
  { id: '1024', number: 1024, clientId: 'client-1', clientName: 'Juan Pérez', phone: '351 555 1024', device: 'Apple iPhone 13 Pro', deviceBrand: 'Apple', deviceModel: 'iPhone 13 Pro', issue: 'Cambio de módulo', status: 'repairing', total: 180000, paid: 80000, createdAt: '2026-07-24', updatedAt: '2026-07-24', trackingToken: '8FJ29K' },
  { id: '1023', number: 1023, clientId: 'client-2', clientName: 'María López', phone: '351 555 2045', device: 'Samsung A54', deviceBrand: 'Samsung', deviceModel: 'A54', issue: 'Pin de carga', status: 'review', total: 0, paid: 0, createdAt: '2026-07-24', updatedAt: '2026-07-24', trackingToken: '3LQ91M' },
  { id: '1022', number: 1022, clientId: 'client-3', clientName: 'Lucas Díaz', phone: '351 555 3344', device: 'Motorola Moto G84', deviceBrand: 'Motorola', deviceModel: 'Moto G84', issue: 'Cambio de batería', status: 'ready', total: 65000, paid: 65000, createdAt: '2026-07-23', updatedAt: '2026-07-23', trackingToken: '7PK20R' },
]

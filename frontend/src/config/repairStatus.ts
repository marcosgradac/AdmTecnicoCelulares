import type { SvgIconComponent } from '@mui/icons-material'
import { AssignmentTurnedInRounded, BiotechRounded, CheckCircleRounded, FactCheckRounded, HandymanRounded, InventoryRounded, LocalOfferRounded, TaskAltRounded } from '@mui/icons-material'
import type { RepairStatus } from '../types'

export interface RepairStatusConfig {
  label: string
  color: string
  background: string
  order: number
  progress: number
  icon: SvgIconComponent
}

export const repairStatusConfig: Record<RepairStatus, RepairStatusConfig> = {
  received: { label: 'Recibido', color: '#5B3FD6', background: '#EEE9FF', order: 0, progress: 12, icon: InventoryRounded },
  review: { label: 'En revisión', color: '#2F9BFF', background: '#EAF5FF', order: 1, progress: 25, icon: BiotechRounded },
  budget: { label: 'Presupuesto', color: '#D48700', background: '#FFF5DF', order: 2, progress: 38, icon: LocalOfferRounded },
  approved: { label: 'Aprobado', color: '#2879C2', background: '#EAF5FF', order: 3, progress: 50, icon: AssignmentTurnedInRounded },
  repairing: { label: 'En reparación', color: '#C87800', background: '#FFF4DD', order: 4, progress: 63, icon: HandymanRounded },
  testing: { label: 'Pruebas', color: '#7A57D1', background: '#F2EEFF', order: 5, progress: 75, icon: FactCheckRounded },
  ready: { label: 'Listo para retirar', color: '#1F9A59', background: '#E9F8F0', order: 6, progress: 88, icon: TaskAltRounded },
  delivered: { label: 'Entregado', color: '#687083', background: '#F0F2F5', order: 7, progress: 100, icon: CheckCircleRounded },
}

export const repairStatuses = (Object.keys(repairStatusConfig) as RepairStatus[])
  .sort((a, b) => repairStatusConfig[a].order - repairStatusConfig[b].order)


import type { SvgIconComponent } from '@mui/icons-material'
import { AssignmentTurnedInRounded, BiotechRounded, CancelRounded, CheckCircleRounded, FactCheckRounded, HandymanRounded, InventoryRounded, LocalOfferRounded, PendingActionsRounded, ReplayRounded, TaskAltRounded } from '@mui/icons-material'
import type { RepairStatus } from '../types'

export interface RepairStatusConfig {
  label: string; color: string; background: string; order: number; progress: number; icon: SvgIconComponent
}

export const repairStatusConfig: Record<RepairStatus, RepairStatusConfig> = {
  received: { label: 'Recibido', color: '#2879C2', background: '#EAF5FF', order: 0, progress: 10, icon: InventoryRounded },
  review: { label: 'En revisión', color: '#A66B00', background: '#FFF5DF', order: 1, progress: 22, icon: BiotechRounded },
  budget: { label: 'Presupuesto informado', color: '#6849DB', background: '#EEE9FF', order: 2, progress: 34, icon: LocalOfferRounded },
  approved: { label: 'Presupuesto aceptado', color: '#2879C2', background: '#EAF5FF', order: 3, progress: 46, icon: AssignmentTurnedInRounded },
  waiting_part: { label: 'Esperando repuesto', color: '#C76800', background: '#FFF0DF', order: 4, progress: 55, icon: PendingActionsRounded },
  repairing: { label: 'En reparación', color: '#5B3FD6', background: '#EEE9FF', order: 5, progress: 66, icon: HandymanRounded },
  testing: { label: 'Control de calidad', color: '#1686B7', background: '#E5F7FF', order: 6, progress: 78, icon: FactCheckRounded },
  ready: { label: 'Listo para retirar', color: '#1F9254', background: '#E9F8F0', order: 7, progress: 90, icon: TaskAltRounded },
  delivered: { label: 'Entregado', color: '#687083', background: '#F0F2F5', order: 8, progress: 100, icon: CheckCircleRounded },
  cancelled: { label: 'Cancelado', color: '#C83E3E', background: '#FFF0F0', order: 9, progress: 0, icon: CancelRounded },
  warranty: { label: 'Garantía', color: '#7650C7', background: '#F2EEFF', order: 10, progress: 20, icon: ReplayRounded },
}

export const repairStatuses = (Object.keys(repairStatusConfig) as RepairStatus[]).sort((a, b) => repairStatusConfig[a].order - repairStatusConfig[b].order)

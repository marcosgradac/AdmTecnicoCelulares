import type { SvgIconComponent } from '@mui/icons-material'
import {
  AssignmentTurnedInRounded, BiotechRounded, CancelRounded, CheckCircleRounded,
  FactCheckRounded, HandymanRounded, InventoryRounded, LocalOfferRounded,
  PendingActionsRounded, ReplayRounded, TaskAltRounded,
} from '@mui/icons-material'
import type { WorkflowRepairStatus } from '../types/repair.types'

export interface WorkflowStatusConfig {
  label: string
  color: string
  background: string
  icon: SvgIconComponent
}

export const workflowRepairStatus: Record<WorkflowRepairStatus, WorkflowStatusConfig> = {
  recibido: { label: 'Recibido', color: '#2879c2', background: '#eaf5ff', icon: InventoryRounded },
  en_revision: { label: 'En revisión', color: '#a66b00', background: '#fff5df', icon: BiotechRounded },
  presupuesto_informado: { label: 'Presupuesto informado', color: '#6849db', background: '#eee9ff', icon: LocalOfferRounded },
  presupuesto_aceptado: { label: 'Presupuesto aceptado', color: '#2879c2', background: '#eaf5ff', icon: AssignmentTurnedInRounded },
  esperando_repuesto: { label: 'Esperando repuesto', color: '#c76800', background: '#fff0df', icon: PendingActionsRounded },
  en_reparacion: { label: 'En reparación', color: '#5b3fd6', background: '#eee9ff', icon: HandymanRounded },
  control_calidad: { label: 'Control de calidad', color: '#1686b7', background: '#e5f7ff', icon: FactCheckRounded },
  listo_retirar: { label: 'Listo para retirar', color: '#1f9254', background: '#e9f8f0', icon: TaskAltRounded },
  entregado: { label: 'Entregado', color: '#687083', background: '#f0f2f5', icon: CheckCircleRounded },
  cancelado: { label: 'Cancelado', color: '#c83e3e', background: '#fff0f0', icon: CancelRounded },
  garantia: { label: 'Garantía', color: '#7650c7', background: '#f2eeff', icon: ReplayRounded },
}

import type { SvgIconComponent } from '@mui/icons-material'
import {
  AssignmentTurnedInRounded, BiotechRounded, CheckCircleRounded,
  FactCheckRounded, HandymanRounded, LocalOfferRounded,
  PendingActionsRounded, ReplayRounded, TaskAltRounded,
} from '@mui/icons-material'
import type { WorkflowRepairStatus } from '../types/repair.types'

export interface WorkflowStatusConfig {
  label: string
  color: string
  background: string
  border: string
  icon: SvgIconComponent
}

export const workflowRepairStatus: Record<WorkflowRepairStatus, WorkflowStatusConfig> = {
  recibido: { label: 'Recibido', color: 'var(--td-accent, #2879c2)', background: 'var(--td-info-soft, #eaf5ff)', border: 'var(--td-border, #2879c222)', icon: AssignmentTurnedInRounded },
  en_revision: { label: 'En revisión', color: 'var(--td-warning, #a66b00)', background: 'var(--td-warning-soft, #fff5df)', border: 'var(--td-border, #a66b0022)', icon: BiotechRounded },
  presupuesto_informado: { label: 'Presupuesto informado', color: 'var(--td-primary, #6849db)', background: 'var(--td-primary-soft, #eee9ff)', border: 'var(--td-border, #6849db22)', icon: LocalOfferRounded },
  presupuesto_aceptado: { label: 'Presupuesto aceptado', color: 'var(--td-accent, #2879c2)', background: 'var(--td-info-soft, #eaf5ff)', border: 'var(--td-border, #2879c222)', icon: AssignmentTurnedInRounded },
  esperando_repuesto: { label: 'Esperando repuesto', color: 'var(--td-warning, #c76800)', background: 'var(--td-warning-soft, #fff0df)', border: 'var(--td-border, #c7680022)', icon: PendingActionsRounded },
  en_reparacion: { label: 'En reparación', color: 'var(--td-primary, #5b3fd6)', background: 'var(--td-primary-soft, #eee9ff)', border: 'var(--td-border, #5b3fd622)', icon: HandymanRounded },
  control_calidad: { label: 'Control de calidad', color: 'var(--td-accent, #1686b7)', background: 'var(--td-info-soft, #e5f7ff)', border: 'var(--td-border, #1686b722)', icon: FactCheckRounded },
  listo_retirar: { label: 'Listo para retirar', color: 'var(--td-success, #1f9254)', background: 'var(--td-success-soft, #e9f8f0)', border: 'var(--td-border, #1f925422)', icon: TaskAltRounded },
  entregado: { label: 'Entregado', color: 'var(--td-muted, #687083)', background: 'var(--td-elevated, #f0f2f5)', border: 'var(--td-border, #68708322)', icon: CheckCircleRounded },
  garantia: { label: 'Garantía', color: 'var(--td-primary, #7650c7)', background: 'var(--td-primary-soft, #f2eeff)', border: 'var(--td-border, #7650c722)', icon: ReplayRounded },
}

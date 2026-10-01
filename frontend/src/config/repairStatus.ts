import type { SvgIconComponent } from '@mui/icons-material'
import { AssignmentTurnedInRounded, BiotechRounded, CancelRounded, CheckCircleRounded, FactCheckRounded, HandymanRounded, LocalOfferRounded, PendingActionsRounded, ReplayRounded, TaskAltRounded } from '@mui/icons-material'
import type { RepairStatus } from '../types'

export interface RepairStatusConfig {
  label: string; color: string; background: string; order: number; progress: number; icon: SvgIconComponent
}

/**
 * Flujo visible de una reparación.
 *
 * BUDGET, APPROVED y TESTING siguen existiendo en el tipo porque hay reparaciones históricas
 * guardadas con esos valores, pero dejaron de ser pasos del flujo: se muestran y avanzan como
 * su equivalente actual (ver `legacyStatusMap`) y nunca se ofrecen como paso siguiente.
 */
export const repairFlow: RepairStatus[] = ['received', 'review', 'waiting_part', 'repairing', 'ready', 'delivered']

/** Estados especiales: quedan fuera del flujo y no admiten avance ni retroceso normal. */
export const specialRepairStatuses: RepairStatus[] = ['cancelled', 'warranty']

/** Estados históricos: se leen, se muestran y avanzan como su equivalente del flujo actual. */
export const legacyStatusMap: Partial<Record<RepairStatus, RepairStatus>> = {
  budget: 'review',
  approved: 'review',
  testing: 'repairing',
}

export const isLegacyStatus = (status: RepairStatus) => Object.prototype.hasOwnProperty.call(legacyStatusMap, status)
export const isSpecialStatus = (status: RepairStatus) => specialRepairStatuses.includes(status)
export const canonicalStatus = (status: RepairStatus) => legacyStatusMap[status] ?? status

/** Siguiente paso del flujo, o `null` si ya está en Entregado o en un estado especial. */
export const nextStatus = (status: RepairStatus): RepairStatus | null => {
  const index = repairFlow.indexOf(canonicalStatus(status))
  return index >= 0 && index < repairFlow.length - 1 ? repairFlow[index + 1] : null
}

/**
 * Paso anterior del flujo, o `null` en Recibido, en Entregado y en estados especiales.
 * Desde Entregado nunca hay un paso anterior en el flujo normal: la única vuelta atrás es
 * la corrección administrativa de entrega, que es una acción aparte.
 */
export const previousStatus = (status: RepairStatus): RepairStatus | null => {
  if (status === 'delivered') return null
  const index = repairFlow.indexOf(canonicalStatus(status))
  return index > 0 ? repairFlow[index - 1] : null
}

const step = (label: string, color: string, background: string, order: number, progress: number, icon: SvgIconComponent): RepairStatusConfig =>
  ({ label, color, background, order, progress, icon })

export const repairStatusConfig: Record<RepairStatus, RepairStatusConfig> = {
  received: step('Recibido', '#2879C2', '#EAF5FF', 0, 10, AssignmentTurnedInRounded),
  review: step('En revisión', '#A66B00', '#FFF5DF', 1, 30, BiotechRounded),
  // Estados históricos: conservan su orden, color e icono de siempre. El flujo los lee como
  // su equivalente actual (ver `legacyStatusMap`), nunca como un paso propio.
  budget: step('Presupuesto informado', '#6849DB', '#EEE9FF', 2, 34, LocalOfferRounded),
  approved: step('Presupuesto aceptado', '#2879C2', '#EAF5FF', 3, 46, AssignmentTurnedInRounded),
  waiting_part: step('Esperando repuesto', '#C76800', '#FFF0DF', 4, 50, PendingActionsRounded),
  repairing: step('En reparación', '#5B3FD6', '#EEE9FF', 5, 70, HandymanRounded),
  testing: step('Control de calidad', '#1686B7', '#E5F7FF', 6, 78, FactCheckRounded),
  ready: step('Listo para retirar', '#1F9254', '#E9F8F0', 7, 90, TaskAltRounded),
  delivered: step('Entregado', '#687083', '#F0F2F5', 8, 100, CheckCircleRounded),
  cancelled: step('Cancelado', '#C83E3E', '#FFF0F0', 9, 0, CancelRounded),
  warranty: step('Garantía', '#7650C7', '#F2EEFF', 10, 20, ReplayRounded),
}

/** Configuración del paso que un estado representa realmente, aunque sea histórico. */
export const canonicalStatusConfig = (status: RepairStatus) => repairStatusConfig[canonicalStatus(status)]

/** Etiqueta del paso real que representa un estado: BUDGET y APPROVED muestran «En revisión». */
export const repairStatusLabel = (status: RepairStatus) => canonicalStatusConfig(status).label

/** Los estados que el usuario puede elegir: el flujo más los especiales, nunca los históricos. */
export const repairStatuses: RepairStatus[] = [...repairFlow, ...specialRepairStatuses]

/** Todos los estados, incluidos los históricos: sólo para filtrar y mostrar datos existentes. */
export const allRepairStatuses: RepairStatus[] = (Object.keys(repairStatusConfig) as RepairStatus[])
  .sort((a, b) => repairStatusConfig[a].order - repairStatusConfig[b].order)

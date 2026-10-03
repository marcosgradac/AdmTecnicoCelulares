import { RepairStatus } from '@prisma/client'
import { trackingExpiryFrom } from '../tracking/tracking-expiry'

/**
 * Flujo visible de una reparación.
 *
 * BUDGET, APPROVED y TESTING siguen existiendo en el enum porque hay datos históricos
 * que los usan, pero dejaron de ser pasos del flujo: se leen, se muestran y avanzan
 * como su equivalente actual (ver `legacyRepairStatus`). No se borra ni se migra nada.
 */
export const repairFlow: RepairStatus[] = [
  RepairStatus.RECEIVED,
  RepairStatus.REVIEW,
  RepairStatus.WAITING_PART,
  RepairStatus.REPAIRING,
  RepairStatus.READY,
  RepairStatus.DELIVERED,
]

/** Estados especiales: quedan fuera del flujo y no admiten avance ni retroceso normal. */
export const specialRepairStatuses: RepairStatus[] = [RepairStatus.CANCELLED, RepairStatus.WARRANTY]

/** Estados históricos que se muestran y avanzan como su equivalente del flujo actual. */
export const legacyRepairStatus: Partial<Record<RepairStatus, RepairStatus>> = {
  [RepairStatus.BUDGET]: RepairStatus.REVIEW,
  [RepairStatus.APPROVED]: RepairStatus.REVIEW,
  [RepairStatus.TESTING]: RepairStatus.REPAIRING,
}

export const isSpecialRepairStatus = (status: RepairStatus) => specialRepairStatuses.includes(status)
export const isLegacyRepairStatus = (status: RepairStatus) =>
  Object.prototype.hasOwnProperty.call(legacyRepairStatus, status)
export const canonicalRepairStatus = (status: RepairStatus) => legacyRepairStatus[status] ?? status

/** Siguiente paso del flujo. `null` cuando ya está en Entregado o en un estado especial. */
export const nextRepairStatus = (status: RepairStatus): RepairStatus | null => {
  const index = repairFlow.indexOf(canonicalRepairStatus(status))
  return index >= 0 && index < repairFlow.length - 1 ? repairFlow[index + 1] : null
}

/**
 * Paso anterior del flujo, o `null` en Recibido, en Entregado y en estados especiales.
 * Desde Entregado el flujo normal no tiene vuelta atrás: la única forma de deshacer una
 * entrega es la corrección administrativa, que es una operación aparte y explícita.
 */
export const previousRepairStatus = (status: RepairStatus): RepairStatus | null => {
  if (status === RepairStatus.DELIVERED) return null
  const index = repairFlow.indexOf(canonicalRepairStatus(status))
  return index > 0 ? repairFlow[index - 1] : null
}

export const statusError = (statusCode: number, message: string, code?: string) =>
  Object.assign(new Error(message), { statusCode, code })

export const deliveredLockedMessage =
  'La reparación ya fue entregada y no puede volver a un estado anterior. Si la entrega fue un error, usá la corrección de entrega.'

/**
 * Reglas comunes a cualquier cambio de estado por el flujo normal.
 * Entregado es el estado final: sólo sale de ahí con la corrección administrativa de entrega.
 */
export const assertStatusChange = (current: RepairStatus, target: RepairStatus) => {
  if (current === target) return
  if (isLegacyRepairStatus(target)) {
    throw statusError(409, 'Ese estado ya no se usa. Elegí Recibido, En revisión, Esperando repuesto, En reparación, Listo o Entregado.', 'LEGACY_STATUS')
  }
  if (current === RepairStatus.CANCELLED) {
    throw statusError(409, 'Una reparación cancelada no cambia de estado.', 'STATUS_LOCKED')
  }
  if (isSpecialRepairStatus(current)) {
    throw statusError(409, 'Esta reparación está en un estado especial y se administra desde su propio módulo.', 'STATUS_LOCKED')
  }
  if (current === RepairStatus.DELIVERED && !isSpecialRepairStatus(target)) {
    throw statusError(409, deliveredLockedMessage, 'DELIVERED_LOCKED')
  }
}

const DAY_MS = 86_400_000

export interface WarrantyDates {
  deliveredAt: Date | null
  warrantyStartedAt: Date | null
  warrantyExpiresAt: Date | null
  /** Vencimiento del enlace público de seguimiento. Ver `tracking-expiry`. */
  trackingExpiresAt: Date | null
}

/**
 * Entregar sella la fecha de entrega e inicia la garantía una sola vez: volver a entregar
 * la misma reparación no reinicia un período ya calculado. Corregir la entrega borra las
 * fechas, así que la entrega siguiente sí arranca un período nuevo.
 *
 * El vencimiento del enlace de seguimiento va en el mismo lugar y por la misma razón que
 * el resto de las fechas: se calcula una vez y se persiste. Volver a entregar no renueva
 * un enlace que ya estaba por vencer, ni cambia el plazo si después se edita la garantía.
 */
export const deliveryDates = (
  current: {
    deliveredAt: Date | null
    warrantyEnabled: boolean
    warrantyDurationDays: number | null
    warrantyStartedAt: Date | null
    warrantyExpiresAt: Date | null
    trackingExpiresAt: Date | null
  },
  target: RepairStatus,
  now = new Date(),
): WarrantyDates => {
  if (target !== RepairStatus.DELIVERED) {
    return {
      deliveredAt: current.deliveredAt,
      warrantyStartedAt: current.warrantyStartedAt,
      warrantyExpiresAt: current.warrantyExpiresAt,
      trackingExpiresAt: current.trackingExpiresAt,
    }
  }
  const deliveredAt = current.deliveredAt ?? now
  const warrantyStartedAt = current.warrantyEnabled ? current.warrantyStartedAt ?? deliveredAt : current.warrantyStartedAt
  const warrantyExpiresAt = warrantyStartedAt && current.warrantyDurationDays
    ? current.warrantyExpiresAt ?? new Date(warrantyStartedAt.getTime() + current.warrantyDurationDays * DAY_MS)
    : current.warrantyExpiresAt
  // Igual que las warranties: `??` para no recalcular un vencimiento ya fijado.
  const trackingExpiresAt = current.trackingExpiresAt ?? trackingExpiryFrom(deliveredAt, current.warrantyEnabled)
  return { deliveredAt, warrantyStartedAt, warrantyExpiresAt, trackingExpiresAt }
}

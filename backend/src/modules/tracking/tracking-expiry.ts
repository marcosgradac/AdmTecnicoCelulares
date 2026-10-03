/**
 * Vencimiento del enlace público de seguimiento.
 *
 * REGLA DE PRODUCTO (definida por el usuario, no por nosotros):
 *
 *   - reparación SIN garantía: el seguimiento vence 3 días después de entregarse
 *   - reparación CON garantía: el seguimiento vence 7 días después de entregarse
 *
 * Deliberadamente NO depende de la duración de la garantía. Una garantía de 90
 * días no extiende el seguimiento a 90 días: los dos plazos son valores
 * cerrados y distintos. Confundir ambos sería el error fácil de cometer.
 *
 * El plazo se CALCULA UNA VEZ y se guarda en `trackingExpiresAt`. No se
 * recalcula en cada request, y eso importa por dos razones:
 *
 *   1. Si se calculara al vuelo, editar la garantía después cambiaría
 *      retroactivamente cuándo vence un enlace ya entregado.
 *   2. Si se calculara al vuelo, cambiar la regla en el futuro afectaría a
 *      enlaces ya entregados sin que nadie lo decidiera para esos casos.
 *
 * Mientras la reparación no está entregada, `trackingExpiresAt` queda en `null`
 * y el enlace no vence: el cliente tiene que poder consultar el avance.
 */

import { RepairStatus } from '@prisma/client'

const DAY_MS = 86_400_000

/** Días que sigue activo el seguimiento de una reparación entregada SIN garantía. */
export const TRACKING_EXPIRY_DAYS_WITHOUT_WARRANTY = 3

/** Días que sigue activo el seguimiento de una reparación entregada CON garantía. */
export const TRACKING_EXPIRY_DAYS_WITH_WARRANTY = 7

/**
 * Fecha de vencimiento del enlace, o `null` si todavía no corresponde.
 *
 * @param deliveredAt fecha de entrega, o `null` si la reparación no está entregada.
 * @param warrantyEnabled si la reparación tiene garantía.
 * @returns `deliveredAt + 3 o 7 días`, o `null`.
 */
export const trackingExpiryFrom = (deliveredAt: Date | null, warrantyEnabled: boolean): Date | null => {
  if (!deliveredAt) return null
  const days = warrantyEnabled
    ? TRACKING_EXPIRY_DAYS_WITH_WARRANTY
    : TRACKING_EXPIRY_DAYS_WITHOUT_WARRANTY
  return new Date(deliveredAt.getTime() + days * DAY_MS)
}

/**
 * `true` cuando el enlace venció.
 *
 * Un `trackingExpiresAt` nulo significa "todavía no corresponde", NO "vencido":
 * una reparación activa sin entregar nunca vence.
 */
export const isTrackingExpired = (trackingExpiresAt: Date | null, now: Date = new Date()): boolean =>
  trackingExpiresAt !== null && trackingExpiresAt.getTime() <= now.getTime()

/** Código público de la respuesta de vencimiento. */
export const TRACKING_EXPIRED_CODE = 'TRACKING_EXPIRED'

/**
 * Mensaje para un enlace vencido.
 *
 * Es genérico a propósito. Un enlace vencido confirma que ese token fue real,
 * así que no se devuelve ningún dato de la reparación ni del cliente: ni equipo,
 * ni IMEI, ni teléfono, ni importes. Sólo se dice que el seguimiento terminó y
 * a quién acudir.
 */
export const TRACKING_EXPIRED_MESSAGE =
  'El dispositivo fue entregado y este enlace de seguimiento ya venció. Si necesitás asistencia, comunicate con el servicio técnico.'

/** Error de dominio para "el período de seguimiento ya terminó". */
export const trackingExpiredError = () =>
  Object.assign(new Error('El período de seguimiento de esta reparación ya finalizó.'), {
    statusCode: 409,
    code: TRACKING_EXPIRED_CODE,
  })

/**
 * Un enlace vencido no es un intento fallido.
 *
 * El riesgo anti-abuso cuenta los tokens que no existen, porque adivinar uno sí
 * es un ataque. Un token válido y vencido es una consulta legítima de un enlace
 * viejo: contarlo como fallo dejaría penalizado a un cliente que abre su propio
 * enlace meses después.
 */
export type TrackingExpiryState = 'valid' | 'expired' | 'not-found' | 'disabled'

/**
 * Clasifica una reparación para la respuesta de seguimiento.
 *
 * El orden importa: primero se busca, después se mira si está habilitado, y sólo
 * al final se evalúa el vencimiento. Un token existente pero deshabilitado es un
 * 404, no un 410: no debe revelar que el enlace "existió".
 */
export const classifyTracking = (repair: {
  trackingEnabled: boolean
  trackingExpiresAt: Date | null
} | null | undefined, now: Date = new Date()): TrackingExpiryState => {
  if (!repair) return 'not-found'
  if (!repair.trackingEnabled) return 'disabled'
  if (isTrackingExpired(repair.trackingExpiresAt, now)) return 'expired'
  return 'valid'
}

/** `true` si el estado no debe contar como intento de enumeración. */
export const isLegitimateTrackingLookup = (state: TrackingExpiryState): boolean =>
  state === 'valid' || state === 'expired'

/** Reexportado por comodidad para quien ya importa `RepairStatus` desde acá. */
export { RepairStatus }
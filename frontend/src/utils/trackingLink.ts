/**
 * Enlaces públicos de seguimiento.
 *
 * TODO el link que TecnoDesk muestra, copia o envía por WhatsApp se construye acá.
 * No se escribe la URL a mano en ninguna pantalla: si la forma del enlace cambia,
 * tiene que cambiar en un solo lugar.
 *
 * EL SLUG DEL CLIENTE ES DECORATIVO Y NO ES NINGÚN SECRETO
 *
 * El enlace tiene dos partes:
 *
 *   /s/juan-perez/K8p4Lm2Qx7Rt9QaB
 *       └─ visual  └─ el token: el único secreto
 *
 * El token es lo único que autoriza a ver la reparación. El slug se ignora por
 * completo al consultar: el backend busca exclusivamente por token. Eso permite
 * que un cliente que cambió su URL, o que recibió el link recortado, siga viendo
 * su seguimiento mientras tenga el token correcto.
 *
 * Consecuencia deliberada: escribir cualquier texto en el slug no da acceso a nada,
 * y poner el slug correcto tampoco. No se usan jamás números de reparación, ids,
 * teléfonos, DNI o IMEI como parte del enlace: todos son predecibles.
 */

/** Prefijo de los enlaces nuevos. Los viejos `/seguimiento/:token` siguen vivos. */
export const TRACKING_LINK_PREFIX = '/s'

/** Prefijo histórico. Se mantiene para los enlaces ya compartidos con clientes. */
export const TRACKING_LEGACY_PREFIX = '/seguimiento'

/** Slug de reserva cuando el nombre no deja nada usable. */
export const FALLBACK_CLIENT_SLUG = 'cliente'

/** Tope del slug: alcanza para un nombre y deja la URL legible. */
export const MAX_CLIENT_SLUG_LENGTH = 40

/**
 * Convierte un nombre de cliente en un slug usable en una URL.
 *
 * Pasos: minúsculas, se quitan los diacríticos (NFD deja la letra base y descarta
 * el acento), todo lo que no sea alfanumérico pasa a "-", y los guiones sobrantes de
 * los bordes se recortan.
 *
 *   "José Gómez"      -> "jose-gomez"
 *   "María del Valle" -> "maria-del-valle"
 *   "Juan Pérez"      -> "juan-perez"
 *   "  ¿Ñoqui?!!  "   -> "noqui"
 *   "***"             -> "cliente"
 */
export const clientSlug = (name: string | null | undefined): string => {
  const slug = (name ?? '')
    .normalize('NFD')
    // Quita los diacríticos: tras NFD la "é" quedó como "e" + acento combinante.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Cualquier grupo no alfanumérico se convierte en un único guion.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_CLIENT_SLUG_LENGTH)
    // El corte por longitud puede dejar un guion colgando al final.
    .replace(/-+$/g, '')

  return slug || FALLBACK_CLIENT_SLUG
}

/**
 * Link público de seguimiento con el slug del cliente.
 *
 * @param token token de seguimiento. Si falta, devuelve `null`: una reparación sin
 *   enlace no tiene URL que compartir, y fabricar una con `undefined` colaría un
 *   link roto en un mensaje de WhatsApp.
 * @param clientName nombre del cliente, sólo para el slug visual.
 * @param origin origen absoluto. Por defecto el de la página actual.
 */
export const buildTrackingLink = (
  token: string | null | undefined,
  clientName?: string | null,
  origin?: string,
): string | null => {
  if (!token) return null
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}${TRACKING_LINK_PREFIX}/${clientSlug(clientName)}/${token}`
}

/**
 * Link con el formato histórico, sin slug.
 *
 * Se conserva para poder mostrar o comparar un enlace viejo, pero el link que se
 * comparte con el cliente es siempre el nuevo.
 */
export const buildLegacyTrackingLink = (token: string | null | undefined, origin?: string): string | null => {
  if (!token) return null
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}${TRACKING_LEGACY_PREFIX}/${token}`
}
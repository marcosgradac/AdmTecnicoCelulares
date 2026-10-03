/**
 * Generación del token público de seguimiento.
 *
 * El token ES el secreto. Es lo único que autoriza a ver una reparación desde
 * la página pública, así que tiene que ser aleatorio y no adivinable: 12 bytes
 * de `randomBytes` dan 96 bits de entropía, unos 16 caracteres en base64url.
 *
 * NUNCA se usa un dato de la reparación como token: ni el número, ni el id, ni
 * el teléfono, el DNI o el IMEI. Todos esos son predecibles y permitirían
 * enumerar seguimientos ajenos.
 *
 * Los tokens que ya existen no se tocan: son tokens más largos (hex de 32
 * bytes) y siguen funcionando. Este generador sólo aplica a los links nuevos.
 */

import { randomBytes } from 'node:crypto'

/** Bytes de entropía por token: 12 bytes = 96 bits = 16 caracteres en base64url. */
export const TRACKING_TOKEN_BYTES = 12

/**
 * Expresión regular del formato nuevo.
 *
 * Se usa para validar un token recibido antes de tocar la base de datos, y en
 * los tests. Deliberadamente NO acepta los tokens viejos en hex de 64
 * caracteres: el endpoint tiene que seguir aceptándolos, y la validación de
 * formato se aplica sólo donde se genera un token nuevo.
 */
export const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16}$/

/**
 * Token nuevo de seguimiento.
 *
 * `base64url` produce un resultado URL-safe (sin `+`, `/` ni `=`), que es
 * justamente lo que hace falta para poder ponerlo en un enlace sin escaparlo.
 */
export const generateTrackingToken = (): string =>
  randomBytes(TRACKING_TOKEN_BYTES).toString('base64url')

/** `true` si el token tiene el formato nuevo. */
export const isShortTrackingToken = (token: string): boolean =>
  TRACKING_TOKEN_PATTERN.test(token)
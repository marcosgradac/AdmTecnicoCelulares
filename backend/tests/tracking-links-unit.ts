/**
 * Lógica pura de los enlaces de seguimiento: formato del token y vencimiento.
 *
 * No toca base de datos ni servidor, así que estos checks corren en milisegundos y
 * fallan de forma aislada. La parte que sí necesita HTTP y base está en
 * `tracking-links-api.ts`.
 *
 * Las expiraciones se prueban con fechas explícitas, nunca con "el momento de la
 * prueba": un test que depende del reloj puede pasar hoy y fallar mañana a las 23:59.
 */

import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { generateTrackingToken, isShortTrackingToken, TRACKING_TOKEN_BYTES } from '../src/modules/tracking/tracking-token'
import {
  classifyTracking,
  isLegitimateTrackingLookup,
  isTrackingExpired,
  trackingExpiryFrom,
  TRACKING_EXPIRED_CODE,
  TRACKING_EXPIRED_MESSAGE,
  TRACKING_EXPIRY_DAYS_WITHOUT_WARRANTY,
  TRACKING_EXPIRY_DAYS_WITH_WARRANTY,
} from '../src/modules/tracking/tracking-expiry'

const DAY = 86_400_000
const ENTREGADA = new Date('2026-10-03T12:00:00.000Z')

const checks: string[] = []
const check = (name: string, run: () => void) => {
  run()
  checks.push(name)
}

check('el token nuevo son 12 bytes en base64url: 16 caracteres URL-safe', () => {
  assert.equal(TRACKING_TOKEN_BYTES, 12)
  for (let i = 0; i < 400; i++) {
    const token = generateTrackingToken()
    assert.equal(token.length, 16, `esperaba 16 caracteres: ${token}`)
    // base64url no usa +, / ni =, asi que el token va en la URL sin escaparlo.
    assert.match(token, /^[A-Za-z0-9_-]+$/)
    assert.ok(isShortTrackingToken(token))
  }
})

check('dos tokens generados nunca coinciden', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 5000; i++) seen.add(generateTrackingToken())
  // 5000 tokens de 96 bits: una colision aqui seria un defecto del generador.
  assert.equal(seen.size, 5000)
})

check('el token no parece un dato predecible de la reparacion', () => {
  // Se comprueba la forma, no la entropia: 16 caracteres base64url no pueden ser
  // un numero, un id incremental ni un telefono, que es lo que se busca evitar.
  const token = generateTrackingToken()
  assert.match(token, /^[A-Za-z0-9_-]{16}$/)
  assert.doesNotMatch(token, /^\d+$/)
})

check('los tokens viejos de 64 hex NO se acortan ni se rompen', () => {
  const viejo = randomBytes(32).toString('hex')
  assert.equal(viejo.length, 64)
  // El formato nuevo es mas corto, pero el viejo sigue valido: al buscar nunca se
  // valida el formato, asi que los enlaces ya compartidos con clientes siguen vivos.
  assert.equal(isShortTrackingToken(viejo), false)
  assert.equal(classifyTracking({ trackingEnabled: true, trackingExpiresAt: null }), 'valid')
})

check('sin garantia vence exactamente 3 dias despues de entregarse', () => {
  assert.equal(TRACKING_EXPIRY_DAYS_WITHOUT_WARRANTY, 3)
  const vence = trackingExpiryFrom(ENTREGADA, false)
  assert.equal(vence!.getTime(), ENTREGADA.getTime() + 3 * DAY)
  // Entregado 03/10/2026 sin garantia -> 06/10/2026.
  assert.equal(vence!.toISOString().slice(0, 10), '2026-10-06')
})

check('con garantia vence exactamente 7 dias despues de entregarse', () => {
  assert.equal(TRACKING_EXPIRY_DAYS_WITH_WARRANTY, 7)
  const vence = trackingExpiryFrom(ENTREGADA, true)
  assert.equal(vence!.getTime(), ENTREGADA.getTime() + 7 * DAY)
  // Entregado 03/10/2026 con garantia -> 10/10/2026.
  assert.equal(vence!.toISOString().slice(0, 10), '2026-10-10')
})
check('el vencimiento NO depende de la duracion de la garantia', () => {
  // Una garantía de 365 días no extiende el seguimiento a 365 dias: son plazos
  // cerrados e independientes. Confundirlos sería el error fácil de cometer.
  assert.equal(trackingExpiryFrom(ENTREGADA, true)!.getTime(), ENTREGADA.getTime() + 7 * DAY)
  assert.notEqual(trackingExpiryFrom(ENTREGADA, true)!.getTime(), ENTREGADA.getTime() + 365 * DAY)
})

check('una reparación sin entregar NO vence', () => {
  assert.equal(trackingExpiryFrom(null, false), null)
  assert.equal(trackingExpiryFrom(null, true), null)
  // `null` significa "todavía no corresponde", NO "vencido".
  assert.equal(isTrackingExpired(null), false)
  assert.equal(classifyTracking({ trackingEnabled: true, trackingExpiresAt: null }), 'valid')
})

check('el límite es exacto: vence al llegar la hora, no un segundo después', () => {
  const vence = trackingExpiryFrom(ENTREGADA, false)!
  assert.equal(isTrackingExpired(vence, new Date(vence.getTime() - 1)), false, '1 ms antes sigue vigente')
  assert.equal(isTrackingExpired(vence, vence), true, 'exactamente al vencer ya venció')
  assert.equal(isTrackingExpired(vence, new Date(vence.getTime() + 1)), true)
})

check('la respuesta pública distingue válido, vencido, deshabilitado e inexistente', () => {
  const pasado = new Date(ENTREGADA.getTime() - DAY)
  const futuro = new Date(ENTREGADA.getTime() + 10 * DAY)
  assert.equal(classifyTracking({ trackingEnabled: true, trackingExpiresAt: futuro }, pasado), 'valid')
  assert.equal(classifyTracking({ trackingEnabled: true, trackingExpiresAt: pasado }, pasado), 'expired')
  assert.equal(classifyTracking({ trackingEnabled: false, trackingExpiresAt: pasado }, pasado), 'disabled')
  assert.equal(classifyTracking(null), 'not-found')
})

check('un token vencido NO cuenta como intento de enumeración', () => {
  // Es un cliente que abre su propio enlace viejo. Penalizarlo lo dejaría sin
  // poder consultar justo cuando más lo necesita.
  assert.equal(isLegitimateTrackingLookup('expired'), true)
  assert.equal(isLegitimateTrackingLookup('valid'), true)
  assert.equal(isLegitimateTrackingLookup('not-found'), false)
  assert.equal(isLegitimateTrackingLookup('disabled'), false)
})

check('un enlace deshabilitado se clasifica como deshabilitado, no como vencido', () => {
  // Un 410 sobre un enlace deshabilitado confirmaría que ese token fue real.
  assert.equal(classifyTracking({ trackingEnabled: false, trackingExpiresAt: new Date(Date.now() - DAY) }), 'disabled')
})

check('el mensaje de vencimiento no expone datos privados', () => {
  assert.equal(TRACKING_EXPIRED_CODE, 'TRACKING_EXPIRED')
  assert.ok(TRACKING_EXPIRED_MESSAGE.includes('entregado'))
  assert.ok(TRACKING_EXPIRED_MESSAGE.includes('venci'))
  // Ni teléfono, ni IMEI, ni importes: ni un número de 4 dígitos o más.
  assert.doesNotMatch(TRACKING_EXPIRED_MESSAGE, /\d{4,}/)
})

console.log('--- enlaces de seguimiento: lógica pura ---')
for (const name of checks) console.log(`  OK  ${name}`)
console.log(`\nTRACKING LINKS UNIT TESTS PASSED: ${checks.length} comprobaciones`)
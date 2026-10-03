/**
 * Enlaces de seguimiento: integracion contra el servidor HTTP y la base real.
 *
 * La lógica pura está en `tracking-links-unit.ts` y la migración en
 * `tracking-links-migration.ts`. Aca se prueba lo que solo se puede ver de punta a
 * punta: que el token se genere al crear una reparación, que la API publica responda
 * 200/404/409/410, y que cancelar, corregir la entrega y un reclamo de garantia se
 * comporten como corresponde.
 *
 * El Turnstile se intercepta para que el camino de captcha no dependa de la red.
 */

import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { validRegistrationPayload } from './helpers/registration'

process.env.NODE_ENV = 'test'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

const DAY = 86_400_000

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0)
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

  const request = async (method: string, path: string, body?: object, token?: string) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, data: await response.json().catch(() => null) as Record<string, unknown> }
  }

  const password = `Qa-${randomBytes(12).toString('base64url')}9!`
  const registro = await request('POST', '/api/auth/register', validRegistrationPayload({
    businessName: 'Tracking QA',
    firstName: 'QA', lastName: 'Tracking',
    email: `tracking-${randomBytes(6).toString('hex')}@qa.test`,
    password,
  }))
  assert.equal(registro.status, 201, `registro: ${JSON.stringify(registro.data)}`)
  const authToken = registro.data.token as string
  const businessId = (registro.data.user as { business: { id: string } }).business.id

  const creado = await request('POST', '/api/clients', { name: 'Jose Gomez', phone: '1144445555' }, authToken)
  assert.equal(creado.status, 201, `cliente: ${JSON.stringify(creado.data)}`)
  const clientId = (creado.data as { id: string }).id

  const crear = async (extra: Record<string, unknown> = {}) =>
    request('POST', '/api/repairs', {
      clientId, deviceBrand: 'Samsung', deviceModel: 'A14', issue: 'No enciende', total: 25000, ...extra,
    }, authToken)

  const checks: string[] = []
  const ok = (name: string) => { checks.push(name); console.log(`  OK  ${name}`) }
  // --- el token nuevo se genera al crear la reparación -------------------
  const nueva = await crear()
  assert.equal(nueva.status, 201, `crear: ${JSON.stringify(nueva.data)}`)
  const tokenNuevo = nueva.data.trackingToken as string
  assert.equal(tokenNuevo.length, 16, `token de reparacion nueva: ${tokenNuevo}`)
  assert.match(tokenNuevo, /^[A-Za-z0-9_-]{16}$/)
  assert.equal(nueva.data.trackingExpiresAt, null, 'sin entregar no hay vencimiento')
  const repairId = nueva.data.id as string
  ok('crear una reparación genera un token corto de 16 caracteres y sin vencimiento')

  // --- el token es el unico secreto: el slug no participa ----------------
  // Se consulta por token. Un token inexistente da 404 sin importar el slug,
  // y uno existente da 200: el backend nunca recibe el slug, no puede usarlo.
  const inexistente = await request('GET', `/api/tracking/${randomBytes(12).toString('base64url')}`)
  assert.equal(inexistente.status, 404)
  assert.equal(inexistente.data.message, 'Seguimiento no encontrado')
  ok('un token inexistente responde 404 y el slug no se usa para buscar')

  const porToken = await request('GET', `/api/tracking/${tokenNuevo}`)
  assert.equal(porToken.status, 200, 'el token solo debe bastar')
  ok('el token por si solo alcanza: el mismo token sirve con cualquier slug')

  // --- vigente responde 200; vencido responde 410 ------------------------
  await prisma.repair.update({ where: { id: repairId }, data: {
    status: 'DELIVERED', deliveredAt: new Date(Date.now() - DAY), trackingExpiresAt: new Date(Date.now() + 2 * DAY),
  } })
  assert.equal((await request('GET', `/api/tracking/${tokenNuevo}`)).status, 200)
  ok('un enlace vigente devuelve el seguimiento')

  await prisma.repair.update({ where: { id: repairId }, data: { trackingExpiresAt: new Date(Date.now() - 1) } })
  const vencido = await request('GET', `/api/tracking/${tokenNuevo}`)
  assert.equal(vencido.status, 410, `vencido: ${JSON.stringify(vencido.data)}`)
  assert.equal(vencido.data.code, 'TRACKING_EXPIRED')
  const cuerpo = JSON.stringify(vencido.data)
  assert.doesNotMatch(cuerpo, /imei/i, 'el 410 no debe mencionar IMEI')
  assert.doesNotMatch(cuerpo, /phone/i, 'el 410 no debe mencionar telefono')
  assert.doesNotMatch(cuerpo, /Gomez|Jose/, 'el 410 no debe mencionar al cliente')
  ok('un enlace vencido responde 410 TRACKING_EXPIRED sin filtrar datos del cliente')

  // --- regenerar un enlace vencido devuelve 409 --------------------------
  const intento = await request('POST', `/api/repairs/${repairId}/tracking-link`, {}, authToken)
  assert.equal(intento.status, 409, `regenerar vencido: ${JSON.stringify(intento.data)}`)
  assert.equal(intento.data.message, 'El per\u00EDodo de seguimiento de esta reparaci\u00F3n ya finaliz\u00F3.')
  const tras409 = await prisma.repair.findUnique({ where: { id: repairId }, select: { trackingToken: true } })
  assert.equal(tras409!.trackingToken, tokenNuevo, 'un 409 no debe cambiar el token')
  ok('regenerar un enlace vencido devuelve 409 y conserva el token')

  // --- regenerar uno vigente conserva EXACTAMENTE el mismo vencimiento ----
  const venceEnTresDias = new Date(Date.now() + 3 * DAY)
  await prisma.repair.update({ where: { id: repairId }, data: { trackingExpiresAt: venceEnTresDias } })
  const regenerado = await request('POST', `/api/repairs/${repairId}/tracking-link`, {}, authToken)
  assert.equal(regenerado.status, 200, `regenerar: ${JSON.stringify(regenerado.data)}`)
  const tokenRegenerado = regenerado.data.trackingToken as string
  assert.equal(tokenRegenerado.length, 16)
  assert.notEqual(tokenRegenerado, tokenNuevo)
  assert.equal(new Date(regenerado.data.trackingExpiresAt as string).getTime(), venceEnTresDias.getTime(),
    'regenerar no puede extender el periodo')
  assert.equal((await request('GET', `/api/tracking/${tokenNuevo}`)).status, 404,
    'el token viejo deja de servir al regenerar')
  ok('regenerar uno vigente genera token corto y conserva el mismo vencimiento')
  // --- regenerar antes de entregar: token corto y sin vencimiento -------
  const pendiente = await crear()
  const pendienteId = pendiente.data.id as string
  assert.equal(pendiente.data.trackingExpiresAt, null, 'sin entregar no hay vencimiento')
  const enlacePendiente = await request('POST', `/api/repairs/${pendienteId}/tracking-link`, {}, authToken)
  assert.equal(enlacePendiente.status, 200)
  assert.equal((enlacePendiente.data.trackingToken as string).length, 16)
  assert.equal(enlacePendiente.data.trackingExpiresAt, null, 'sin entregar, el vencimiento sigue en null')
  ok('regenerar antes de entregar genera token corto y deja el vencimiento en null')

  // --- cancelar deshabilita el enlace -----------------------------------
  await prisma.repair.update({ where: { id: pendienteId }, data: { trackingToken: enlacePendiente.data.trackingToken as string, trackingEnabled: true } })
  assert.equal((await request('GET', `/api/tracking/${enlacePendiente.data.trackingToken}`)).status, 200)
  const cancelacion = await request('POST', `/api/repairs/${pendienteId}/cancel`, { reviewFee: 0 }, authToken)
  assert.equal(cancelacion.status, 200, `cancelar: ${JSON.stringify(cancelacion.data)}`)
  const cancelada = await prisma.repair.findUnique({ where: { id: pendienteId }, select: { trackingEnabled: true, status: true } })
  assert.equal(cancelada!.trackingEnabled, false, 'cancelar deja el enlace deshabilitado')
  assert.equal((await request('GET', `/api/tracking/${enlacePendiente.data.trackingToken}`)).status, 404,
    'el enlace de una reparación cancelada responde 404')
  ok('cancelar deja trackingEnabled=false y el enlace responde 404')

  // --- entregar sella el vencimiento: 7 dias con garantia de 90 ---------
  const conGarantia = await crear({ warrantyEnabled: true, warrantyDurationDays: 90 })
  const conGarantiaId = conGarantia.data.id as string
  const entregado = await request('PATCH', `/api/repairs/${conGarantiaId}/status`, { status: 'DELIVERED' }, authToken)
  assert.equal(entregado.status, 200, `entregar: ${JSON.stringify(entregado.data)}`)
  const sellada = await prisma.repair.findUnique({ where: { id: conGarantiaId } })
  assert.ok(sellada!.deliveredAt, 'entregar sella deliveredAt')
  assert.ok(sellada!.trackingExpiresAt, 'entregar sella el vencimiento del seguimiento')
  assert.equal(sellada!.warrantyExpiresAt!.getTime() - sellada!.warrantyStartedAt!.getTime(), 90 * DAY,
    'la garantía conserva su duración propia')
  assert.equal(sellada!.trackingExpiresAt!.getTime() - sellada!.deliveredAt!.getTime(), 7 * DAY,
    'pero el seguimiento vence a los 7 días, no a los 90')
  ok('entregar con garantía de 90 días vence el seguimiento a los 7 días')

  // --- corregir la entrega limpia el vencimiento y revive el enlace ------
  const correccion = await request('POST', `/api/repairs/${conGarantiaId}/delivery/correction`, { reason: 'QA entrega cargada por error' }, authToken)
  assert.equal(correccion.status, 200, `correccion: ${JSON.stringify(correccion.data)}`)
  const corregida = await prisma.repair.findUnique({ where: { id: conGarantiaId } })
  assert.equal(corregida!.deliveredAt, null)
  assert.equal(corregida!.warrantyStartedAt, null)
  assert.equal(corregida!.warrantyExpiresAt, null)
  assert.equal(corregida!.trackingExpiresAt, null, 'corregir la entrega limpia el vencimiento')
  assert.equal((await request('GET', `/api/tracking/${conGarantia.data.trackingToken}`)).status, 200,
    'el enlace vuelve a estar activo y sin vencimiento')
  ok('corregir la entrega limpia deliveredAt, garantía y trackingExpiresAt, y revive el enlace')

  // --- un reclamo de garantia NO toca el token ni el vencimiento ---------
  const tokenPrevio = conGarantia.data.trackingToken as string
  await prisma.repair.update({ where: { id: conGarantiaId }, data: { status: 'DELIVERED', deliveredAt: new Date(), warrantyEnabled: true, warrantyStartedAt: new Date(), warrantyExpiresAt: new Date(Date.now() + 90 * DAY) } })
  const expiracionPrevia = trackingExpiryDesde(new Date(), true)
  await prisma.repair.update({ where: { id: conGarantiaId }, data: { trackingExpiresAt: expiracionPrevia } })

  const reclamo = await request('POST', `/api/warranties/${conGarantiaId}/claims`, { description: 'QA falla de pantalla' }, authToken)
  assert.equal(reclamo.status, 201, `reclamo: ${JSON.stringify(reclamo.data)}`)
  const trasReclamo = await prisma.repair.findUnique({ where: { id: conGarantiaId } })
  assert.equal(trasReclamo!.trackingToken, tokenPrevio, 'un reclamo no genera un link nuevo')
  assert.equal(trasReclamo!.trackingExpiresAt!.getTime(), expiracionPrevia!.getTime(),
    'un reclamo no resetea ni extiende el vencimiento')
  ok('un reclamo de garantía no cambia el token ni el vencimiento')

  // --- limpieza y cierre -------------------------------------------------
  // En orden inverso al de las dependencias: el reclamo referencia a la reparación
  // con ON DELETE RESTRICT, así que hay que borrarlo primero.
  await prisma.warrantyClaim.deleteMany({ where: { businessId } })
  await prisma.repair.deleteMany({ where: { businessId } })
  await prisma.business.delete({ where: { id: businessId } }).catch(() => undefined)
  server.close()
  await prisma.$disconnect()

  console.log(`\nTRACKING LINKS API TESTS PASSED: ${checks.length} comprobaciones de punta a punta`)
}

/** Mismo cálculo que usa el backend, para fijar el vencimiento en el test. */
const trackingExpiryDesde = (deliveredAt: Date, warrantyEnabled: boolean): Date =>
  new Date(deliveredAt.getTime() + (warrantyEnabled ? 7 : 3) * DAY)

main().catch(error => {
  console.error('\nTRACKING LINKS API TESTS FAILED')
  console.error(error)
  process.exit(1)
})
import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { validRegistrationPayload } from './helpers/registration'

process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '300'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

const DAY = 86_400_000
const days = (from: string, to: string) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY)
const paymentsOf = (repair: any) => (repair.payments ?? []) as Array<{ id: string; amount: number; method: string; isAdvance?: boolean; cancellationReview?: boolean }>
const advancesOf = (repair: any) => paymentsOf(repair).filter(payment => payment.isAdvance)
const incomeOf = async (prisma: any, repairId: string) =>
  (await prisma.cashMovement.findMany({ where: { repairId, type: 'INCOME', origin: 'REPAIR' }, orderBy: { createdAt: 'asc' } })) as Array<{ id: string; amount: number; description: string }>

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`, suffix = Date.now(), businesses: string[] = []
  const clean = async () => {
    const stale = await prisma.business.findMany({ where: { users: { some: { email: { contains: 'advance-' } } } }, select: { id: true } })
    for (const business of stale) {
      await prisma.$transaction([
        prisma.warrantyClaimExpense.deleteMany({ where: { businessId: business.id } }),
        prisma.warrantyClaim.deleteMany({ where: { businessId: business.id } }),
        prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId: business.id } } }),
        prisma.repairPhoto.deleteMany({ where: { repair: { businessId: business.id } } }),
        prisma.payment.deleteMany({ where: { businessId: business.id } }),
        // El costo inicial se referencia con RESTRICT: se suelta antes de borrar los movimientos.
        prisma.repair.updateMany({ where: { businessId: business.id }, data: { initialCostMovementId: null } }),
        prisma.cashMovement.deleteMany({ where: { businessId: business.id } }),
        prisma.repair.deleteMany({ where: { businessId: business.id } }),
        prisma.device.deleteMany({ where: { businessId: business.id } }),
        prisma.client.deleteMany({ where: { businessId: business.id } }),
        prisma.passwordResetToken.deleteMany({ where: { user: { businessId: business.id } } }),
        prisma.subscription.deleteMany({ where: { businessId: business.id } }),
        prisma.user.deleteMany({ where: { businessId: business.id } }),
        prisma.business.delete({ where: { id: business.id } }),
      ])
    }
    return stale.length
  }
  const request = async (method: string, path: string, body?: object, token?: string) => {
    if (method === 'POST' && path.endsWith('/payments') && body) body = { requestId: randomUUID(), confirmed: true, ...body }
    if (method === 'POST' && path.endsWith('/cancel') && body) body = { requestId: randomUUID(), expenses: [], ...body }
    const response = await fetch(`${base}${path}`, {
      method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) as any : null }
  }
  const register = async (label: string, businessName: string) => {
    const password = `Qa-${randomBytes(12).toString('base64url')}9!`
    const result = await request('POST', '/auth/register', validRegistrationPayload({ firstName: 'QA', lastName: label, email: `advance-${label}-${suffix}@example.com`, password, businessName }))
    assert.equal(result.status, 201); businesses.push(result.body.user.business.id)
    return { token: result.body.token as string, businessId: result.body.user.business.id as string }
  }
  try {
    const ownerA = await register('A', 'Servicio Técnico Marcos')
    const ownerB = await register('B', 'Celulares Juan')
    const clientA = (await request('POST', '/clients', { name: 'Cliente A', phone: '1111111111' }, ownerA.token)).body
    const clientB = (await request('POST', '/clients', { name: 'Cliente B', phone: '2222222222' }, ownerB.token)).body
    const baseInput = { deviceBrand: 'Samsung', deviceModel: 'A14', issue: 'Pantalla rota' }
    const createRepair = async (input: object, token = ownerA.token, clientId = clientA.id) => {
      const result = await request('POST', '/repairs', { ...baseInput, clientId, ...input }, token)
      assert.equal(result.status, 201, JSON.stringify(result.body))
      return result.body
    }
    const reload = async (id: string, token = ownerA.token) => (await request('GET', `/repairs/${id}`, undefined, token)).body
    const correct = async (id: string, body: object, token = ownerA.token) => request('PATCH', `/repairs/${id}/advance`, body, token)


    // Collected advances and later payments are immutable; corrections cannot erase real money.
    const simple = await createRepair({ total: 60000, advanceAmount: 20000, advanceMethod: 'TRANSFER' })
    const original = await incomeOf(prisma, simple.id)
    for (const input of [{ amount: 30000, method: 'CARD' }, { amount: 0 }, { amount: 20000, method: 'TRANSFER' }]) assert.equal((await correct(simple.id, input)).status, 409)
    assert.deepEqual(await incomeOf(prisma, simple.id), original)
    assert.equal((await reload(simple.id)).paid, 20000)
    assert.equal((await request('POST', '/repairs/' + simple.id + '/payments', { amount: 10000, method: 'CARD' }, ownerA.token)).status, 201)
    assert.equal((await correct(simple.id, { amount: 0 })).status, 409)
    assert.equal((await reload(simple.id)).paid, 30000)
    const linked = await prisma.payment.findFirstOrThrow({ where: { repairId: simple.id, isAdvance: true } })
    const linkedMovement = await prisma.cashMovement.findUniqueOrThrow({ where: { id: linked.cashMovementId! } })
    assert.equal(linkedMovement.amount, 20000)
    await assert.rejects(prisma.cashMovement.delete({ where: { id: linkedMovement.id } }), /foreign key|P2003/i)
    await assert.rejects(prisma.payment.create({ data: { businessId: ownerA.businessId, clientId: clientA.id, repairId: simple.id, amount: 100, method: 'CASH', cashMovementId: linkedMovement.id } }), /unique|P2002/i)
    const none = await createRepair({ total: 40000 })
    assert.equal((await correct(none.id, { amount: 12000, method: 'TRANSFER' })).status, 200)
    assert.equal((await correct(none.id, { amount: 12000, method: 'TRANSFER' })).status, 409)
    assert.equal((await incomeOf(prisma, none.id)).length, 1)
    assert.equal((await correct(none.id, { amount: -1, method: 'CASH' })).status, 400)
    const invalidAdvance = await createRepair({ total: 40000 })
    assert.equal((await correct(invalidAdvance.id, { amount: 70000, method: 'CASH' })).status, 400)
    assert.equal((await correct(none.id, { amount: 1 })).status, 400)
    const legacy = await createRepair({ total: 60000, advanceAmount: 20000, advanceMethod: 'CASH' })
    const legacyPayment = await prisma.payment.findFirstOrThrow({ where: { repairId: legacy.id, isAdvance: true } })
    await prisma.payment.update({ where: { id: legacyPayment.id }, data: { cashMovementId: null } })
    assert.equal((await correct(legacy.id, { amount: 30000, method: 'CARD' })).status, 409)
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: legacyPayment.id } })).cashMovementId, null, 'Missing historical links are not guessed')
    const foreign = await createRepair({ total: 60000, advanceAmount: 20000, advanceMethod: 'CASH' }, ownerB.token, clientB.id)
    assert.equal((await correct(foreign.id, { amount: 30000, method: 'CARD' }, ownerA.token)).status, 404)
    assert.equal((await reload(foreign.id, ownerB.token)).paid, 20000)
    // 8/9. Avanzar y retroceder de a un paso.
    const flow = await createRepair({ total: 50000 })
    const step = async (direction: 'advance' | 'rewind', token = ownerA.token, id = flow.id) =>
      (await request('PATCH', `/repairs/${id}/status/${direction}`, {}, token))
    assert.equal((await step('advance')).body.status, 'REVIEW', 'avanzar un paso')
    assert.equal((await step('advance')).body.status, 'WAITING_PART')
    assert.equal((await step('advance')).body.status, 'REPAIRING')
    assert.equal((await step('advance')).body.status, 'READY')
    assert.equal((await step('rewind')).body.status, 'REPAIRING', 'retroceder un paso')
    assert.equal((await step('rewind')).body.status, 'WAITING_PART')
    assert.equal(await prisma.repairStatusHistory.count({ where: { repairId: flow.id } }), 6, 'cada avance y retroceso queda registrado en el historial')
    assert.equal((await step('rewind', ownerA.token, foreign.id)).status, 404, 'otro negocio no mueve estados ajenos')
    // 16. Estados históricos BUDGET / APPROVED / TESTING: siguen siendo compatibles.
    for (const [legacy, follows] of [['BUDGET', 'WAITING_PART'], ['APPROVED', 'WAITING_PART'], ['TESTING', 'READY']] as const) {
      const historic = await createRepair({ total: 50000 })
      await prisma.repair.update({ where: { id: historic.id }, data: { status: legacy as any } })
      assert.equal((await reload(historic.id)).status, legacy, `${legacy} sigue siendo un estado válido y legible`)
      assert.equal((await step('advance', ownerA.token, historic.id)).body.status, follows, `${legacy} avanza como su paso equivalente`)
      assert.equal((await request('PATCH', `/repairs/${historic.id}/status`, { status: legacy }, ownerA.token)).status, 409, `${legacy} no se puede elegir como destino`)
    }

    // 11. LISTO -> ENTREGADO: transición válida que sella la entrega e inicia la garantía.
    const delivery = await createRepair({ total: 50000, warrantyEnabled: true, warrantyDurationDays: 30 })
    for (const expected of ['REVIEW', 'WAITING_PART', 'REPAIRING', 'READY']) assert.equal((await step('advance', ownerA.token, delivery.id)).body.status, expected)
    assert.equal((await reload(delivery.id)).warrantyStartedAt, null, 'la garantía no arranca antes de entregar')
    const delivered = await step('advance', ownerA.token, delivery.id)
    assert.equal(delivered.status, 200, 'el backend acepta la transición válida LISTO -> ENTREGADO')
    assert.equal(delivered.body.status, 'DELIVERED')
    assert.ok(delivered.body.deliveredAt, 'se registra deliveredAt')
    assert.ok(delivered.body.warrantyStartedAt, 'se inicia la garantía')
    assert.equal(days(delivered.body.warrantyStartedAt, delivered.body.warrantyExpiresAt), 30, 'warrantyExpiresAt se calcula desde warrantyStartedAt')
    assert.equal(delivered.body.warrantyDurationDays, 30, 'warrantyDurationDays se mantiene')

    // 4/12. Entregado es el estado final del flujo normal.
    assert.equal((await step('rewind', ownerA.token, delivery.id)).status, 409, 'el endpoint normal no retrocede desde Entregado')
    assert.equal((await step('advance', ownerA.token, delivery.id)).status, 409, 'no se puede avanzar más allá de Entregado')
    for (const target of ['READY', 'REPAIRING', 'RECEIVED', 'BUDGET', 'TESTING']) {
      assert.equal((await request('PATCH', `/repairs/${delivery.id}/status`, { status: target }, ownerA.token)).status, 409, `el endpoint de estado rechaza ${target} desde Entregado`)
    }
    const stillDelivered = await reload(delivery.id)
    assert.equal(stillDelivered.status, 'DELIVERED')
    assert.deepEqual(
      { d: stillDelivered.deliveredAt, s: stillDelivered.warrantyStartedAt, e: stillDelivered.warrantyExpiresAt },
      { d: delivered.body.deliveredAt, s: delivered.body.warrantyStartedAt, e: delivered.body.warrantyExpiresAt },
      'un rechazo no altera las fechas',
    )
    // Estados especiales: no se mueven con el flujo normal.
    const cancelled = await createRepair({ total: 50000 })
    await request('POST', `/repairs/${cancelled.id}/cancel`, { reviewFee: 0 }, ownerA.token)
    assert.equal((await step('rewind', ownerA.token, cancelled.id)).status, 409, 'Cancelado no retrocede')
    assert.equal((await step('advance', ownerA.token, cancelled.id)).status, 409, 'Cancelado no avanza')
    assert.equal((await request('PATCH', `/repairs/${cancelled.id}/status`, { status: 'REVIEW' }, ownerA.token)).status, 409, 'Cancelado no cambia de estado')
    // 13/15. «Corregir entrega»: sólo OWNER, atómica y bloqueada si hay reclamos de garantía.
    const technician = await prisma.user.create({ data: { businessId: ownerA.businessId, name: 'Técnico QA', email: `advance-tech-${suffix}@example.com`, passwordHash: 'unused', role: 'TECHNICIAN', permissions: ['repairs.view', 'repairs.changeStatus'] } })
    const technicianToken = jwt.sign({ userId: technician.id, businessId: technician.businessId, role: technician.role, platformRole: technician.platformRole, tokenVersion: technician.tokenVersion }, process.env.JWT_SECRET!, { expiresIn: '8h' })
    assert.equal((await request('POST', `/repairs/${delivery.id}/delivery/correction`, { reason: 'Entrega cargada por error' }, technicianToken)).status, 403, 'un técnico no puede corregir la entrega')
    assert.equal((await request('POST', `/repairs/${delivery.id}/delivery/correction`, { reason: 'x' }, ownerA.token)).status, 400, 'el motivo es obligatorio')
    const undone = await request('POST', `/repairs/${delivery.id}/delivery/correction`, { reason: 'Se entregó el equipo equivocado' }, ownerA.token)
    assert.equal(undone.status, 200, JSON.stringify(undone.body))
    assert.equal(undone.body.status, 'READY', 'Corregir entrega vuelve a Listo')
    assert.equal(undone.body.deliveredAt, null, 'se limpia deliveredAt')
    assert.equal(undone.body.warrantyStartedAt, null, 'se limpia warrantyStartedAt')
    assert.equal(undone.body.warrantyExpiresAt, null, 'se limpia warrantyExpiresAt')
    assert.equal(undone.body.warrantyEnabled, true, 'warrantyEnabled se mantiene')
    assert.equal(undone.body.warrantyDurationDays, 30, 'warrantyDurationDays se mantiene')
    const undoneHistory = await prisma.repairStatusHistory.findFirst({ where: { repairId: delivery.id, previousStatus: 'DELIVERED' }, orderBy: { createdAt: 'desc' } })
    assert.ok(undoneHistory, 'la corrección queda registrada en el historial')
    assert.match(undoneHistory?.internalNote ?? '', /^Corrección de entrega: /)

    // 14. Volver a ENTREGAR arranca un período de garantía nuevo.
    const redelivered = await step('advance', ownerA.token, delivery.id)
    assert.equal(redelivered.body.status, 'DELIVERED')
    assert.ok(redelivered.body.deliveredAt, 'la nueva entrega sella una fecha nueva')
    assert.notEqual(redelivered.body.deliveredAt, delivered.body.deliveredAt, 'la fecha de entrega es la nueva')
    assert.equal(redelivered.body.warrantyStartedAt, redelivered.body.deliveredAt, 'la garantía arranca con la nueva entrega')
    assert.equal(days(redelivered.body.warrantyStartedAt, redelivered.body.warrantyExpiresAt), 30, 'las nuevas fechas son correctas')

    // 15. Dependencias de garantía incompatibles bloquean la corrección.
    const claimed = await createRepair({ total: 50000, warrantyEnabled: true, warrantyDurationDays: 30 })
    for (const expected of ['REVIEW', 'WAITING_PART', 'REPAIRING', 'READY', 'DELIVERED']) await step('advance', ownerA.token, claimed.id)
    assert.equal((await request('POST', `/warranties/${claimed.id}/claims`, { description: 'La pantalla volvió a fallar' }, ownerA.token)).status, 201)
    const blocked = await request('POST', `/repairs/${claimed.id}/delivery/correction`, { reason: 'Intento sobre una entrega con reclamo' }, ownerA.token)
    assert.equal(blocked.status, 409, 'un reclamo de garantía bloquea la corrección de entrega')
    assert.match(blocked.body.message, /garantía/i, 'el mensaje explica el bloqueo')
    const untouched = await reload(claimed.id)
    assert.equal(untouched.status, 'DELIVERED', 'la corrección bloqueada no cambia el estado')
    assert.ok(untouched.deliveredAt && untouched.warrantyStartedAt, 'la corrección bloqueada conserva las fechas')
    assert.equal((await request('POST', `/repairs/${claimed.id}/delivery/correction`, { reason: 'Intento de otro tenant' }, ownerB.token)).status, 404, 'otro negocio no corrige la entrega')
    assert.equal((await correct(claimed.id, { amount: 1000, method: 'CASH' }, ownerB.token)).status, 404, 'ni el adelanto de otro negocio')
    // Mismas sondas que cubre tests/tenant-isolation.ts, sobre el servidor propio de este test:
    // así el aislamiento se verifica sin depender de un proceso en el puerto 3000.
    const crossTenant: Array<[string, string, object?]> = [
      ['GET', `/repairs/${claimed.id}`],
      ['GET', `/repairs/${claimed.id}/payments`],
      ['GET', `/repairs/${claimed.id}/history`],
      ['POST', `/repairs/${claimed.id}/payments`, { amount: 1000, method: 'CASH' }],
      ['PATCH', `/repairs/${claimed.id}`, { deviceBrand: 'Hack', deviceModel: 'Hack', issue: 'Hack', total: 50000 }],
      ['PATCH', `/repairs/${claimed.id}/status/advance`, {}],
      ['PATCH', `/repairs/${claimed.id}/status/rewind`, {}],
      ['POST', `/repairs/${claimed.id}/delivery/correction`, { reason: 'Intento de otro negocio' }],
      ['POST', `/repairs/${claimed.id}/cancel`, { reviewFee: 0 }],
      ['GET', `/clients/${clientA.id}`],
    ]
    for (const [method, path, body] of crossTenant) {
      const result = await request(method, path, body, ownerB.token)
      assert.ok(result.status === 403 || result.status === 404, `${method} ${path} desde otro negocio respondió ${result.status}`)
    }
    const intact = await reload(claimed.id, ownerA.token)
    assert.equal(intact.status, 'DELIVERED', 'ninguna sonda ajena modificó la reparación')
    assert.equal(intact.paid, 0, 'ninguna sonda ajena registró un pago')
    // 17/18/19/20. Tracking público: funciona, no filtra costos y muestra el negocio real.
    const tracked = await createRepair({ total: 60000, advanceAmount: 30000, advanceMethod: 'CASH', partsCost: 20000, partsCostMethod: 'CASH', laborCharge: 40000 })
    await prisma.repair.update({ where: { id: tracked.id }, data: { status: 'REPAIRING' } })
    const publicRead = async (token: string) => {
      const response = await fetch(`${base}/tracking/${token}`)
      return { status: response.status, body: await response.json() as any }
    }
    const publicA = await publicRead(tracked.trackingToken)
    assert.equal(publicA.status, 200, 'el tracking público sigue funcionando')
    assert.equal(publicA.body.business.name, 'Servicio Técnico Marcos', 'el tracking muestra el nombre real del negocio')
    assert.equal(publicA.body.status, 'REPAIRING')
    assert.equal(publicA.body.total, 60000)
    assert.equal(publicA.body.paid, 30000, 'el tracking expone lo que el cliente necesita ver')
    // La respuesta pública incluye algunas claves vacías a propósito: lo que no debe viajar
    // es el dato, así que se comprueba el valor y no la mera presencia de la clave.
    for (const secret of ['partsCost', 'laborCost', 'laborCharge', 'diagnosis', 'notes', 'clientId', 'imei', 'color', 'payments', 'costs', 'profit', 'cancelledAt', 'warrantyExpiresAt', 'cancelled', 'cancellationPaidAmount']) {
      assert.ok(publicA.body[secret] == null || publicA.body[secret] === '', `el tracking no expone ${secret}`)
    }
    assert.ok(!JSON.stringify(publicA.body).includes('Cliente A'), 'el tracking no expone datos del cliente')
    assert.ok(!JSON.stringify(publicA.body).includes('QA'), 'el tracking no expone el nombre del propietario')
    await prisma.business.update({ where: { id: ownerB.businessId }, data: { logoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' } })
    const publicB = await publicRead(foreign.trackingToken)
    assert.equal(publicB.body.business.name, 'Celulares Juan', 'cada reparación muestra el negocio de su propia cuenta')
    assert.equal(publicB.body.business.logoUrl, `/api/business-logo/${ownerB.businessId}`, 'el logo se sirve desde la cuenta real')
    assert.equal((await fetch(`${base.replace(/\/api$/, '')}${publicB.body.business.logoUrl}`)).status, 200, 'el logo del negocio es accesible')
    await prisma.business.update({ where: { id: ownerB.businessId }, data: { logoUrl: null } })
    assert.equal((await publicRead(foreign.trackingToken)).body.business.logoUrl, null, 'sin logo el backend responde null y el frontend usa su fallback')
    assert.equal((await publicRead('token-inexistente')).status, 404, 'un token inválido no expone datos')
    await prisma.repair.update({ where: { id: tracked.id }, data: { status: 'BUDGET' } })
    assert.equal((await publicRead(tracked.trackingToken)).body.status, 'BUDGET', 'los estados históricos siguen funcionando en el tracking')
    // El adelanto corregido se refleja en el tracking público del cliente.
    assert.equal((await correct(tracked.id, { amount: 45000, method: 'CASH' })).status, 409)
    assert.equal((await request('POST', '/repairs/' + tracked.id + '/payments', { amount: 15000, method: 'CASH' }, ownerA.token)).status, 201)
    const afterCorrection = await publicRead(tracked.trackingToken)
    assert.equal(afterCorrection.body.paid, 45000, 'el tracking refleja únicamente los cobros reales')
    assert.equal(afterCorrection.body.total - afterCorrection.body.paid, 15000, 'el saldo público sigue al total cobrado')
    console.log('REPAIR ADVANCE & STATUS PASSED: immutable collected advances, linked payments, no guessed historic links, RESTRICT and unique link, first advance, atomic cash and paid, tenant isolation, single-step advance and rewind, legacy statuses, delivery contract, delivered lock, delivery correction, warranty dependency block, re-delivery and public tracking')
  } finally {
    await clean()
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

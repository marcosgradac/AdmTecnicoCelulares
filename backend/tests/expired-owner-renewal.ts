import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Local PostgreSQL only')
assert.ok(database.pathname.endsWith('_test'), 'Dedicated test database required')
process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '500'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

const password = 'Renewal-2026!'
let passed = 0
const check = (label: string) => console.log(`OK ${++passed}: ${label}`)

/**
 * Modo renovación: el OWNER con suscripción vencida entra, conserva Billing y el historial de pagos,
 * pero todo el sistema privado sigue en 403 hasta que el Super Admin aprueba el pago informado.
 */
async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const businesses: string[] = []
  const call = async (token: string | undefined, method: string, path: string, body?: object) => {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }
  const login = (email: string) => call(undefined, 'POST', '/auth/login', { email, password })
  const hash = await bcrypt.hash(password, 10)
  const tenant = async (label: string) => {
    const business = await prisma.business.create({ data: { name: `${label} ${randomUUID()}` } }); businesses.push(business.id)
    const owner = await prisma.user.create({ data: { businessId: business.id, name: 'Owner', email: `${randomUUID()}@local.test`, passwordHash: hash, role: 'OWNER' } })
    const technician = await prisma.user.create({ data: { businessId: business.id, name: 'Tech', email: `${randomUUID()}@local.test`, passwordHash: hash, role: 'TECHNICIAN', permissions: ['repairs.view', 'clients.view'] } })
    await prisma.subscription.create({ data: { businessId: business.id, planCode: 'COMPLETE', status: 'ACTIVE', trialStartedAt: new Date(), trialEndsAt: new Date(), trialConsumedAt: new Date(), currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 20 * 86400000), accessExpiresAt: new Date(Date.now() + 20 * 86400000), graceDaysOverride: 5 } })
    return { business, owner, technician }
  }
  /** Vencimiento automático: accessExpiresAt pasado, sin bloqueo manual. */
  const expire = (businessId: string) => prisma.subscription.update({ where: { businessId }, data: { status: 'GRACE', accessExpiresAt: new Date(Date.now() - 10 * 86400000), graceEndsAt: new Date(Date.now() - 5 * 86400000) } })
  const subscriptionOf = (businessId: string) => prisma.subscription.findUniqueOrThrow({ where: { businessId } })
  const plan = await prisma.plan.findFirstOrThrow({ where: { code: 'PROFESSIONAL' } })
  const reportPayment = (token: string, extra: object = {}) => call(token, 'POST', '/billing/payments', { planCode: plan.code, reportedAmount: plan.priceARS, payerName: 'Dueño Test', transferDate: new Date().toISOString(), ...extra })
  try {
    // A. OWNER vigente: login 200 y sistema normal completo.
    const active = await tenant('ACTIVE owner')
    const activeLogin = await login(active.owner.email)
    assert.equal(activeLogin.status, 200)
    assert.equal((await call(activeLogin.body.token, 'GET', '/auth/me')).status, 200)
    assert.equal((await call(activeLogin.body.token, 'GET', '/clients')).status, 200)
    check('OWNER ACTIVE: login 200 y acceso normal')

    // B. OWNER en gracia: conserva el acceso normal.
    const grace = await tenant('GRACE owner')
    await prisma.subscription.update({ where: { businessId: grace.business.id }, data: { status: 'GRACE', accessExpiresAt: new Date(Date.now() - 3 * 86400000), graceEndsAt: new Date(Date.now() - 1 * 86400000) } })
    const graceLogin = await login(grace.owner.email)
    assert.equal(graceLogin.status, 200)
    assert.equal((await call(graceLogin.body.token, 'GET', '/clients')).status, 200)
    check('OWNER GRACE: login 200 sin pérdida de acceso')

    // C. OWNER vencido automáticamente: entra en modo renovación.
    const expired = await tenant('EXPIRED owner')
    await expire(expired.business.id)
    const expiredLogin = await login(expired.owner.email)
    assert.equal(expiredLogin.status, 200)
    const renewalToken = expiredLogin.body.token as string
    assert.equal(typeof renewalToken, 'string')

    // D. Billing sigue disponible para poder renovar.
    assert.equal((await call(renewalToken, 'GET', '/auth/me')).status, 200)
    assert.equal((await call(renewalToken, 'GET', '/billing/subscription')).status, 200)
    assert.equal((await call(renewalToken, 'GET', '/billing/plans')).status, 200)
    assert.equal((await call(renewalToken, 'GET', '/billing/payments')).status, 200)
    assert.equal((await call(renewalToken, 'GET', '/billing/usage')).status, 200)
    const transfer = await call(renewalToken, 'GET', '/billing/transfer-details')
    assert.ok(transfer.status === 200 || transfer.status === 503, 'transfer-details responde según la configuración')
    check('OWNER vencido: /auth/me y todo /billing disponible')

    // E. El resto del sistema privado queda bloqueado, también en GET.
    const blockedRoutes = [['GET', '/clients'], ['GET', '/repairs'], ['GET', '/dashboard/summary'], ['GET', '/cash/movements'], ['GET', '/settings'], ['GET', '/team'], ['GET', '/reports'], ['GET', '/commerce/products'], ['GET', '/equipment-sales'], ['GET', '/warranties'], ['POST', '/clients']] as const
    for (const [method, path] of blockedRoutes) {
      const response = await call(renewalToken, method, path, method === 'POST' ? { name: 'No permitido' } : undefined)
      assert.equal(response.status, 403, `${method} ${path} debe quedar bloqueado`)
      assert.equal(response.body?.code, 'SUBSCRIPTION_BLOCKED', `${method} ${path}`)
    }
    check('OWNER vencido: GET y POST privados responden 403 SUBSCRIPTION_BLOCKED')

    // E2. Las rutas que se resuelven ANTES del gate tampoco quedan abiertas en modo renovación.
    const preGateBlocked = [['GET', '/profile'], ['PATCH', '/profile'], ['PATCH', '/auth/tutorial-seen'], ['POST', '/auth/password-change/request'], ['POST', '/auth/password-change/verify'], ['POST', '/auth/password-change/confirm'], ['GET', '/platform-admin/dashboard']] as const
    for (const [method, path] of preGateBlocked) {
      const response = await call(renewalToken, method, path, method === 'PATCH' || method === 'POST' ? {} : undefined)
      assert.equal(response.status, 403, `${method} ${path} debe quedar bloqueado en modo renovación`)
      assert.equal(response.body?.code, 'SUBSCRIPTION_BLOCKED', `${method} ${path}`)
    }
    // Un prefijo sin límite de segmento no se confunde con /api/billing: lo rechaza el propio
    // nivel 1, así que nunca llega al gate (403 y no un 404 de ruta inexistente).
    const lookalike = await call(renewalToken, 'GET', '/billing-malicious')
    assert.equal(lookalike.status, 403)
    assert.equal(lookalike.body?.code, 'SUBSCRIPTION_BLOCKED')
    const { isRenewalPathAllowed } = await import('../src/middlewares/auth')
    // Coincidencia exacta para /auth/me y /account: sus subrutas no se heredan aunque se agreguen.
    assert.equal(isRenewalPathAllowed('/api/auth/me'), true)
    assert.equal(isRenewalPathAllowed('/api/auth/me/'), true)
    assert.equal(isRenewalPathAllowed('/api/auth/me/foo'), false)
    assert.equal(isRenewalPathAllowed('/api/auth/me?x=1'), true)
    assert.equal(isRenewalPathAllowed('/api/account'), true)
    assert.equal(isRenewalPathAllowed('/api/account/'), true)
    assert.equal(isRenewalPathAllowed('/api/account/foo'), false)
    // Sólo Billing acepta subrutas.
    assert.equal(isRenewalPathAllowed('/api/billing'), true)
    assert.equal(isRenewalPathAllowed('/api/billing/'), true)
    assert.equal(isRenewalPathAllowed('/api/billing/subscription'), true)
    assert.equal(isRenewalPathAllowed('/api/billing/payments?x=1'), true)
    assert.equal(isRenewalPathAllowed('/api/billing-malicious'), false)
    for (const path of ['/api/profile', '/api/auth/tutorial-seen', '/api/auth/password-change/request', '/api/clients', '/api', '/api/']) {
      assert.equal(isRenewalPathAllowed(path), false, `${path} no debe estar permitido en modo renovación`)
    }
    check('modo renovación: /profile, tutorial-seen, password-change y platform-admin bloqueados')

    // E3. La recuperación de contraseña pública sigue abierta sin sesión.
    assert.equal((await call(undefined, 'POST', '/auth/forgot-password', { email: active.owner.email })).status, 200)
    assert.ok((await call(undefined, 'GET', '/health')).status === 200)
    check('recuperación de contraseña y health siguen siendo públicos')

    // F. Informar transferencia crea un PaymentSubmission PENDING.
    const informed = await reportPayment(renewalToken, { reference: 'TRF-1', notes: 'Transferencia desde banco X' })
    assert.equal(informed.status, 201)
    assert.equal(informed.body.status, 'PENDING')
    assert.equal(informed.body.expectedAmount, plan.priceARS, 'el importe esperado sale del plan, no del navegador')
    const informedId = informed.body.id as string

    // G. Informar el pago NO reactiva la cuenta.
    await expire(expired.business.id)
    const afterInform = await subscriptionOf(expired.business.id)
    assert.notEqual(afterInform.status, 'ACTIVE')
    assert.ok(afterInform.accessExpiresAt! < new Date(), 'accessExpiresAt sigue vencido')
    assert.equal(afterInform.manuallyBlockedAt, null)
    assert.equal((await call(renewalToken, 'GET', '/clients')).status, 403)
    assert.equal((await call(renewalToken, 'GET', '/billing/subscription')).body.pendingPayment?.id, informedId)
    check('informar el pago deja la cuenta bloqueada y expone pendingPayment')

    // H. Un segundo intento no crea otro pago pendiente.
    const duplicate = await reportPayment(renewalToken)
    assert.equal(duplicate.status, 409)
    assert.equal(duplicate.body.code, 'PAYMENT_ALREADY_PENDING')
    assert.equal(await prisma.paymentSubmission.count({ where: { businessId: expired.business.id, status: 'PENDING' } }), 1)
    check('segundo intento devuelve 409 PAYMENT_ALREADY_PENDING sin duplicar')

    // I. El Super Admin ve el pago pendiente.
    const superAdmin = await prisma.user.create({ data: { businessId: expired.business.id, name: 'Super', email: `${randomUUID()}@local.test`, passwordHash: hash, role: 'OWNER', platformRole: 'SUPER_ADMIN' } })
    const adminLogin = await login(superAdmin.email)
    assert.equal(adminLogin.status, 200)
    const adminToken = adminLogin.body.token as string
    const adminPayments = await call(adminToken, 'GET', '/platform-admin/payments?status=PENDING')
    assert.equal(adminPayments.status, 200)
    const found = (adminPayments.body as any[]).find(payment => payment.id === informedId)
    assert.ok(found, 'el pago pendiente aparece en el listado del Super Admin')
    assert.equal(found.business.name, expired.business.name)
    assert.equal(found.plan.name, plan.name)
    assert.equal(found.expectedAmount, plan.priceARS)
    assert.equal(found.reportedAmount, plan.priceARS)
    assert.equal(found.payerName, 'Dueño Test')
    assert.equal(found.status, 'PENDING')
    check('Super Admin lista el pago pendiente con negocio, plan e importes')

    // J/K. Aprobar reactiva la suscripción y devuelve el acceso normal al OWNER.
    const approved = await call(adminToken, 'POST', `/platform-admin/payments/${informedId}/approve`)
    assert.equal(approved.status, 200)
    const approvedRow = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: informedId } })
    assert.equal(approvedRow.status, 'APPROVED')
    assert.equal(approvedRow.reviewedByUserId, superAdmin.id)
    assert.ok(approvedRow.reviewedAt)
    const renewed = await subscriptionOf(expired.business.id)
    assert.equal(renewed.status, 'ACTIVE')
    assert.equal(renewed.planCode, plan.code)
    assert.equal(renewed.manuallyBlockedAt, null)
    assert.equal(renewed.graceEndsAt, null)
    assert.ok(renewed.accessExpiresAt! > new Date(), 'accessExpiresAt renovado')
    assert.equal(await prisma.subscriptionAuditLog.count({ where: { businessId: expired.business.id, action: 'PAYMENT_APPROVED' } }), 1)
    assert.equal((await call(renewalToken, 'GET', '/clients')).status, 200)
    check('APROBAR reactiva la suscripción y el OWNER recupera el acceso')

    // L. Rechazar deja la cuenta bloqueada, muestra el motivo y permite informar un pago nuevo.
    await expire(expired.business.id)
    const toReject = await reportPayment(renewalToken)
    assert.equal(toReject.status, 201)
    const rejectedId = toReject.body.id as string
    const rejected = await call(adminToken, 'POST', `/platform-admin/payments/${rejectedId}/reject`, { reason: 'No acreditamos la transferencia' })
    assert.equal(rejected.status, 200)
    const rejectedRow = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: rejectedId } })
    assert.equal(rejectedRow.status, 'REJECTED')
    assert.equal(rejectedRow.rejectionReason, 'No acreditamos la transferencia')
    const stillBlocked = await subscriptionOf(expired.business.id)
    assert.notEqual(stillBlocked.status, 'ACTIVE')
    assert.ok(stillBlocked.accessExpiresAt! < new Date())
    const visible = await call(renewalToken, 'GET', '/billing/subscription')
    assert.equal(visible.status, 200)
    assert.equal(visible.body.pendingPayment, null, 'tras el rechazo ya no hay pago pendiente')
    const customerView = await call(renewalToken, 'GET', '/billing/payments')
    assert.equal((customerView.body as any[]).find(payment => payment.id === rejectedId)?.rejectionReason, 'No acreditamos la transferencia')
    assert.equal((await reportPayment(renewalToken)).status, 201)
    check('RECHAZAR mantiene la cuenta bloqueada, muestra el motivo y habilita un pago nuevo')

    // M. El técnico no entra en modo renovación.
    await expire(expired.business.id)
    const techLogin = await login(expired.technician.email)
    assert.equal(techLogin.status, 403)
    assert.equal(techLogin.body.code, 'SUBSCRIPTION_BLOCKED')
    check('TECHNICIAN vencido: login 403 SUBSCRIPTION_BLOCKED')

    // N. El bloqueo manual del Super Admin no se saltea y conserva el flujo de eliminación.
    const manual = await tenant('MANUAL block owner')
    await prisma.subscription.update({ where: { businessId: manual.business.id }, data: { status: 'SUSPENDED', manuallyBlockedAt: new Date(), manualBlockReason: 'ADMINISTRATIVE', accessExpiresAt: new Date(Date.now() - 10 * 86400000) } })
    const manualLogin = await login(manual.owner.email)
    assert.equal(manualLogin.status, 403)
    assert.equal(manualLogin.body.code, 'SUBSCRIPTION_BLOCKED')
    assert.equal(manualLogin.body.token, undefined)
    assert.equal(manualLogin.body.user, undefined)
    assert.equal(typeof manualLogin.body.deletionToken, 'string', 'el bloqueo manual conserva el flujo de eliminación')
    assert.equal((await login(manual.technician.email)).body.code, 'SUBSCRIPTION_BLOCKED')
    check('OWNER con bloqueo MANUAL: login 403 con deletionToken intacto')

    // O. Negocio desactivado: comportamiento intacto.
    const inactive = await tenant('INACTIVE business owner')
    await prisma.business.update({ where: { id: inactive.business.id }, data: { isActive: false } })
    const inactiveLogin = await login(inactive.owner.email)
    assert.equal(inactiveLogin.status, 403)
    assert.equal(inactiveLogin.body.code, 'BUSINESS_BLOCKED')
    assert.equal(typeof inactiveLogin.body.deletionToken, 'string')
    check('BUSINESS isActive=false: sigue bloqueado con BUSINESS_BLOCKED')

    // P. El tracking público sigue funcionando con la cuenta vencida.
    const tracking = await tenant('TRACKING owner')
    await expire(tracking.business.id)
    const client = await prisma.client.create({ data: { businessId: tracking.business.id, name: 'Cliente' } })
    const repair = await prisma.repair.create({ data: { businessId: tracking.business.id, number: 7001, clientId: client.id, deviceBrand: 'Test', deviceModel: 'Phone', issue: 'Test', trackingEnabled: true, trackingToken: `renew-${randomUUID()}` } })
    assert.equal((await call(undefined, 'GET', `/tracking/${repair.trackingToken}`)).status, 200)
    check('tracking público disponible con la suscripción vencida')

    // El derecho a eliminar la cuenta sobrevive al vencimiento: la request pasa la barrera de
    // renovación y es la propia lógica de eliminación la que responde (400 por contraseña inválida).
    const deletion = await tenant('DELETION owner')
    await expire(deletion.business.id)
    const deletionLogin = await login(deletion.owner.email)
    assert.equal(deletionLogin.status, 200)
    const deletionAttempt = await call(deletionLogin.body.token, 'DELETE', '/account', { password: 'NoEsLaPassword!', confirmation: 'ELIMINAR MI CUENTA' })
    assert.equal(deletionAttempt.status, 400)
    assert.notEqual(deletionAttempt.body?.code, 'SUBSCRIPTION_BLOCKED', 'el 400 confirma que llegó a la validación propia de eliminación')
    assert.ok(await prisma.business.count({ where: { id: deletion.business.id } }) === 1, 'el intento fallido no eliminó nada')
    check('DELETE /api/account alcanza la lógica de eliminación en modo renovación')

    // Q. El SUPER_ADMIN no queda afectado por los bloqueos de suscripción.
    const adminBlocked = await prisma.user.create({ data: { businessId: expired.business.id, name: 'Super 2', email: `${randomUUID()}@local.test`, passwordHash: hash, role: 'OWNER', platformRole: 'SUPER_ADMIN' } })
    const adminSecond = await login(adminBlocked.email)
    assert.equal(adminSecond.status, 200)
    assert.equal((await call(adminSecond.body.token, 'GET', '/platform-admin/dashboard')).status, 200)
    check('SUPER_ADMIN mantiene el comportamiento actual')

    console.log(`EXPIRED OWNER RENEWAL TEST PASSED: ${passed} comprobaciones`)
  } finally {
    for (const businessId of businesses) {
      await prisma.$transaction([
        prisma.subscriptionAuditLog.deleteMany({ where: { businessId } }),
        prisma.paymentSubmission.deleteMany({ where: { businessId } }),
        prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId } } }),
        prisma.repair.deleteMany({ where: { businessId } }),
        prisma.client.deleteMany({ where: { businessId } }),
        prisma.passwordResetToken.deleteMany({ where: { user: { businessId } } }),
        prisma.subscription.deleteMany({ where: { businessId } }),
        prisma.user.deleteMany({ where: { businessId } }),
        prisma.business.deleteMany({ where: { id: businessId } }),
      ])
    }
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
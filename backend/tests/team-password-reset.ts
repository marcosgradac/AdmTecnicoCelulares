import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'

// Refuse shared or remote databases before importing the app or opening Prisma.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Use a local test database')
assert.ok(database.pathname.endsWith('_test'), 'Use an isolated database ending in _test')
assert.notEqual(database.pathname, '/tecnodesk_visual_test', 'Do not use the existing visual test database')
process.env.NODE_ENV = 'test'
process.env.MAIL_MODE = 'fake'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const suffix = randomBytes(6).toString('hex')
  const businessIds: string[] = []
  const oldPassword = 'AnteriorTemporal123'
  const newPassword = 'NuevaTemporal456'
  const replayPassword = 'ReplayTemporal789'
  let passed = 0
  const check = (condition: unknown, label: string) => {
    assert.ok(condition, label)
    console.log(`OK ${++passed}: ${label}`)
  }
  const request = async (method: string, path: string, body?: object, token?: string) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, body: await response.json() as Record<string, any> }
  }
  const login = (email: string, password: string) => request('POST', '/auth/login', { email, password, turnstileToken: 'test-token' })
  const reset = (id: string, token: string, password = newPassword) => request('POST', `/team/${id}/reset-password`, { password }, token)
  const registerOwner = async (label: string) => {
    const response = await request('POST', '/auth/register', {
      firstName: label, lastName: 'Owner', phone: '+54 11 5555-1111',
      email: `${label.toLowerCase()}-${suffix}@example.com`, password: oldPassword,
      businessName: `${label} ${suffix}`, businessPhone: '+54 11 4444-2222',
      termsAccepted: true, termsVersion: '1.0', privacyAccepted: true, privacyVersion: '1.0', turnstileToken: 'test-token',
    })
    assert.equal(response.status, 201)
    const businessId = String(response.body.user.business.id)
    businessIds.push(businessId)
    const now = new Date(), end = new Date(now.getTime() + 30 * 86400_000)
    await prisma.subscription.update({ where: { businessId }, data: { status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: end, accessExpiresAt: end } })
    return { businessId, id: String(response.body.user.id), email: String(response.body.user.email), token: String(response.body.token) }
  }
  const pendingToken = async (userId: string, purpose = 'PASSWORD_RESET', expiresAt = new Date(Date.now() + 600_000)) => {
    const raw = randomBytes(32).toString('hex')
    const row = await prisma.passwordResetToken.create({ data: { userId, purpose, tokenHash: createHash('sha256').update(raw).digest('hex'), expiresAt } })
    return { raw, row }
  }
  const snapshot = async (id: string) => ({
    user: await prisma.user.findUniqueOrThrow({ where: { id } }),
    tokens: await prisma.passwordResetToken.findMany({ where: { userId: id }, orderBy: { id: 'asc' } }),
  })
  try {
    const ownerA = await registerOwner('TeamA'), ownerB = await registerOwner('TeamB')
    const passwordHash = await bcrypt.hash(oldPassword, 12)
    const technician = await prisma.user.create({ data: {
      businessId: ownerA.businessId, name: 'Technician A', email: `tech-${suffix}@example.com`,
      passwordHash, role: 'TECHNICIAN', permissions: ['repairs.view', 'team.update'], tokenVersion: 7,
    } })
    const oldLogin = await login(technician.email, oldPassword)
    check(oldLogin.status === 200, 'técnico inicia sesión con contraseña anterior')
    const oldSessionToken = String(oldLogin.body.token)
    check((await request('GET', '/repairs?page=1&pageSize=5', undefined, oldSessionToken)).status === 200, 'sesión inicial tiene acceso protegido')
    const recovery = await pendingToken(technician.id)
    const changeCode = await pendingToken(technician.id, 'PASSWORD_CHANGE')
    const expired = await pendingToken(technician.id, 'PASSWORD_RESET', new Date(Date.now() - 1000))
    const historical = await pendingToken(technician.id)
    const historicalUsedAt = new Date(Date.now() - 60_000)
    await prisma.passwordResetToken.update({ where: { id: historical.row.id }, data: { usedAt: historicalUsedAt } })
    const foreignToken = await pendingToken(ownerB.id)
    check(recovery.row.usedAt === null && recovery.row.expiresAt > new Date(), 'recovery token activo antes del reset')

    const before = await snapshot(technician.id)
    check((await reset(technician.id, ownerB.token)).status === 404, 'OWNER de otro tenant recibe 404')
    assert.deepEqual(await snapshot(technician.id), before, 'tenant ajeno no modifica usuario ni tokens')
    check((await reset(technician.id, oldSessionToken)).status === 403, 'TECHNICIAN con team.update recibe 403 por rol')
    assert.deepEqual(await snapshot(technician.id), before, 'rechazo por rol no modifica usuario ni tokens')
    check((await reset(technician.id, ownerA.token, 'weak')).status === 400, 'se conserva validación de contraseña')
    assert.deepEqual(await snapshot(technician.id), before, 'contraseña inválida no modifica usuario ni tokens')

    const result = await reset(technician.id, ownerA.token)
    check(result.status === 200, 'OWNER resetea contraseña por HTTP')
    assert.deepEqual(result.body, { success: true }, 'contrato exitoso sin cambios')
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: technician.id } })
    check(await bcrypt.compare(newPassword, updated.passwordHash), 'hash corresponde a nueva contraseña')
    check(updated.tokenVersion === before.user.tokenVersion + 1, 'tokenVersion incrementa exactamente uno')
    console.log(`tokenVersion: ${before.user.tokenVersion} -> ${updated.tokenVersion}`)
    const consumed = await prisma.passwordResetToken.findMany({ where: { id: { in: [recovery.row.id, changeCode.row.id, expired.row.id] } } })
    check(consumed.length === 3 && consumed.every(token => token.usedAt !== null), 'invalida recovery, cambio y token vencido no usados')
    assert.equal((await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: historical.row.id } })).usedAt?.getTime(), historicalUsedAt.getTime(), 'conserva timestamp del historial usado')
    assert.deepEqual(await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: foreignToken.row.id } }), foreignToken.row, 'tokens de otro usuario intactos')
    check((await request('GET', '/repairs?page=1&pageSize=5', undefined, oldSessionToken)).status === 401, 'Bearer anterior invalidado')
    check((await login(technician.email, oldPassword)).status === 401, 'contraseña anterior rechazada')
    const newLogin = await login(technician.email, newPassword)
    check(newLogin.status === 200, 'contraseña nueva permite login')
    check((await request('GET', '/repairs?page=1&pageSize=5', undefined, String(newLogin.body.token))).status === 200, 'nueva sesión funciona en ruta protegida')
    check((await request('POST', '/auth/reset-password', { token: recovery.raw, password: replayPassword })).status === 400, 'recovery token previo no puede reutilizarse')
    assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: technician.id } }), updated, 'replay no cambia contraseña ni tokenVersion')
    check((await login(technician.email, replayPassword)).status === 401, 'contraseña del replay no queda activa')
    check((await login(technician.email, newPassword)).status === 200, 'contraseña administrativa sigue funcionando')

    const deleted = await prisma.user.create({ data: { businessId: ownerA.businessId, name: 'Deleted', email: `deleted-${suffix}@example.com`, passwordHash, role: 'TECHNICIAN', deletedAt: new Date(), isActive: false } })
    await pendingToken(deleted.id)
    const deletedBefore = await snapshot(deleted.id)
    check((await reset(deleted.id, ownerA.token)).status === 404, 'usuario eliminado recibe 404')
    assert.deepEqual(await snapshot(deleted.id), deletedBefore, 'usuario eliminado y tokens intactos')
    const inactive = await prisma.user.create({ data: { businessId: ownerA.businessId, name: 'Inactive', email: `inactive-${suffix}@example.com`, passwordHash, role: 'TECHNICIAN', isActive: false } })
    const inactiveToken = await pendingToken(inactive.id)
    check((await reset(inactive.id, ownerA.token)).status === 200, 'usuario inactivo no eliminado sigue aceptando reset')
    const inactiveAfter = await prisma.user.findUniqueOrThrow({ where: { id: inactive.id } })
    check(!inactiveAfter.isActive && inactiveAfter.deletedAt === null && inactiveAfter.tokenVersion === inactive.tokenVersion + 1 && await bcrypt.compare(newPassword, inactiveAfter.passwordHash), 'inactivo conserva estado y actualiza contraseña y versión')
    check(Boolean((await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: inactiveToken.row.id } })).usedAt), 'inactivo invalida token pendiente')

    const selfBefore = await prisma.user.findUniqueOrThrow({ where: { id: ownerA.id } })
    await pendingToken(ownerA.id, 'PASSWORD_CHANGE')
    check((await reset(ownerA.id, ownerA.token)).status === 200, 'OWNER conserva self-reset')
    check((await prisma.user.findUniqueOrThrow({ where: { id: ownerA.id } })).tokenVersion === selfBefore.tokenVersion + 1, 'self-reset incrementa exactamente uno')
    check((await request('GET', '/auth/me', undefined, ownerA.token)).status === 401, 'self-reset invalida Bearer después de responder')
    check((await login(ownerA.email, newPassword)).status === 200, 'OWNER inicia sesión con nueva contraseña')
    console.log(`TEAM PASSWORD RESET TESTS PASSED: ${passed}`)
  } finally {
    try {
      for (const businessId of businessIds) await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({ where: { user: { businessId } } }),
        prisma.subscription.deleteMany({ where: { businessId } }),
        prisma.user.deleteMany({ where: { businessId } }),
        prisma.business.deleteMany({ where: { id: businessId } }),
      ])
    } finally {
      await prisma.$disconnect()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })

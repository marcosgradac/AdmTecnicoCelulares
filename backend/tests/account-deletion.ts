import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Prisma } from '@prisma/client'
import { validRegistrationPayload } from './helpers/registration'

process.env.NODE_ENV = 'test'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
process.env.RATE_LIMIT_SIGNUP_MAX = '20'
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1'].includes(database.hostname) && database.port === '55439' && database.pathname === '/account_deletion_test', 'Only isolated account_deletion_test PostgreSQL')
const password = 'CuentaSegura123!'
const body = { password, confirmation: 'ELIMINAR MI CUENTA' }
const tenantModels = ['Business', 'User', 'PasswordResetToken', 'Client', 'Device', 'Repair', 'RepairStatusHistory', 'RepairPhoto', 'RepairPart', 'Payment', 'StockItem', 'InventoryMovement', 'CashMovement', 'WarrantyClaim', 'WarrantyClaimExpense', 'CommerceProduct', 'CommerceCategory', 'CommerceSale', 'CommerceSaleLine', 'ResaleDevice', 'Subscription', 'PaymentSubmission', 'SubscriptionAuditLog', 'PlatformInternalNote']
assert.deepEqual(Prisma.dmmf.datamodel.models.map(m => m.name).sort(), [...tenantModels, 'Plan', 'BillingSettings'].sort(), 'Every schema model is covered; new models require reviewing purge')

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const root = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  let passed = 0
  const check = (label: string) => console.log(`OK ${++passed}: ${label}`)
  const sign = (u: any) => jwt.sign({ userId: u.id, businessId: u.businessId, tokenVersion: u.tokenVersion }, process.env.JWT_SECRET!)
  const request = async (method: string, path: string, token?: string, data?: object, ip = '127.0.0.1') => {
    const response = await fetch(root + path, { method, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: data ? JSON.stringify(data) : undefined })
    return { status: response.status, data: await response.json().catch(() => null) }
  }
  const snapshot = async () => {
    const result: Record<string, unknown> = {}
    for (const model of Prisma.dmmf.datamodel.models) {
      const delegate = (prisma as any)[model.name[0].toLowerCase() + model.name.slice(1)]
      result[model.name] = await delegate.findMany({ orderBy: model.name === 'Plan' ? { code: 'asc' } : { id: 'asc' } })
    }
    return result
  }
  const ownedRows = (data: Record<string, unknown>, model: string, businessId: string): any[] => {
    const rows = data[model] as any[]
    if (model === 'Business') return rows.filter(row => row.id === businessId)
    if (model === 'PasswordResetToken') return rows.filter(row => (data.User as any[]).some(u => u.businessId === businessId && u.id === row.userId))
    if (['RepairStatusHistory', 'RepairPhoto', 'RepairPart'].includes(model)) return rows.filter(row => (data.Repair as any[]).some(r => r.businessId === businessId && r.id === row.repairId))
    if (model === 'CommerceSaleLine') return rows.filter(row => (data.CommerceSale as any[]).some(s => s.businessId === businessId && s.id === row.saleId))
    return rows.filter(row => row.businessId === businessId)
  }
  const assertFullPurge = async (beforePurge: Record<string, unknown>, businessId: string) => {
    const afterPurge = await snapshot()
    for (const model of tenantModels) {
      const deleted = ownedRows(beforePurge, model, businessId)
      assert.ok(deleted.length > 0, model + ' blocked owner fixture exists')
      assert.deepEqual(afterPurge[model], (beforePurge[model] as any[]).filter(row => !deleted.some(d => d.id === row.id)), model + ' physically removed, all other tenants unchanged')
    }
    assert.deepEqual(afterPurge.Plan, beforePurge.Plan); assert.deepEqual(afterPurge.BillingSettings, beforePurge.BillingSettings)
  }
  const tenant = async (name: string) => {
    const business = await prisma.business.create({ data: { name, slug: randomUUID() } })
    const businessId = business.id, now = new Date()
    const owner = await prisma.user.create({ data: { businessId, name: 'Owner', role: 'OWNER', email: randomUUID() + '@example.com', passwordHash: await bcrypt.hash(password, 4) } })
    const tech = await prisma.user.create({ data: { businessId, name: 'Tech', email: randomUUID() + '@example.com', passwordHash: owner.passwordHash } })
    await prisma.passwordResetToken.create({ data: { userId: tech.id, tokenHash: randomUUID(), expiresAt: now } })
    await prisma.passwordResetToken.create({ data: { userId: owner.id, tokenHash: randomUUID(), expiresAt: now } })
    const client = await prisma.client.create({ data: { businessId, name: 'Client' } })
    const device = await prisma.device.create({ data: { businessId, clientId: client.id, brand: 'Samsung', model: 'A14' } })
    const cash = await prisma.cashMovement.create({ data: { businessId, type: 'EXPENSE', description: 'Initial cost', amount: 10 } })
    const repair = await prisma.repair.create({ data: { businessId, clientId: client.id, deviceId: device.id, number: 1001, deviceBrand: 'Samsung', deviceModel: 'A14', issue: 'Display', initialCostMovementId: cash.id, trackingToken: randomUUID(), trackingEnabled: true } })
    await prisma.repairStatusHistory.create({ data: { repairId: repair.id, newStatus: 'RECEIVED', changedByUserId: tech.id } })
    await prisma.repairPhoto.create({ data: { repairId: repair.id, url: '/test-photo', type: 'BEFORE' } })
    const stock = await prisma.stockItem.create({ data: { businessId, name: 'Display', category: 'Parts' } })
    await prisma.repairPart.create({ data: { repairId: repair.id, stockItemId: stock.id, quantity: 1, unitCost: 10, unitPrice: 20, itemNameSnapshot: 'Display' } })
    await prisma.inventoryMovement.create({ data: { businessId, stockItemId: stock.id, repairId: repair.id, createdByUserId: tech.id, type: 'REPAIR_USAGE', quantity: 1, unitCost: 10, totalCost: 10, previousStock: 2, newStock: 1 } })
    const paymentCash = await prisma.cashMovement.create({ data: { businessId, type: 'INCOME', description: 'Payment', amount: 20, repairId: repair.id } })
    await prisma.payment.create({ data: { businessId, clientId: client.id, repairId: repair.id, cashMovementId: paymentCash.id, amount: 20, method: 'CASH' } })
    const claim = await prisma.warrantyClaim.create({ data: { businessId, repairId: repair.id, description: 'Warranty' } })
    const expenseCash = await prisma.cashMovement.create({ data: { businessId, type: 'EXPENSE', description: 'Warranty', amount: 5 } })
    await prisma.warrantyClaimExpense.create({ data: { businessId, claimId: claim.id, cashMovementId: expenseCash.id, idempotencyKey: randomUUID(), concept: 'Replacement' } })
    await prisma.commerceCategory.create({ data: { businessId, name: 'Accessories' } })
    const product = await prisma.commerceProduct.create({ data: { businessId, name: 'Case', category: 'Accessories', purchaseCost: 1, salePrice: 2 } })
    const sale = await prisma.commerceSale.create({ data: { businessId, total: 2, costOfGoodsSold: 1, profit: 1, paymentMethod: 'CASH' } })
    await prisma.commerceSaleLine.create({ data: { saleId: sale.id, productId: product.id, productName: 'Case', quantity: 1, unitCost: 1, unitPrice: 2, lineTotal: 2, lineCost: 1, lineProfit: 1 } })
    await prisma.cashMovement.create({ data: { businessId, type: 'INCOME', description: 'Sale', amount: 2, commerceSaleId: sale.id } })
    await prisma.cashMovement.create({ data: { businessId, type: 'EXPENSE', description: 'Sale reversal', amount: 2, relatedCommerceSaleId: sale.id } })
    const resale = await prisma.resaleDevice.create({ data: { businessId, brand: 'Samsung', model: 'A14', purchasePrice: 10, estimatedSalePrice: 20 } })
    await prisma.cashMovement.create({ data: { businessId, type: 'EXPENSE', description: 'Equipment', amount: 10, resaleDeviceId: resale.id, resaleKind: 'PURCHASE', resaleVersion: 0 } })
    const subscription = await prisma.subscription.create({ data: { businessId, planCode: 'COMPLETE', trialStartedAt: now, trialEndsAt: new Date(now.getTime() + 86400000), trialConsumedAt: now } })
    const submission = await prisma.paymentSubmission.create({ data: { businessId, subscriptionId: subscription.id, planCode: 'COMPLETE', expectedAmount: 1, reportedAmount: 1, payerName: 'Owner', transferDate: now, reviewedByUserId: owner.id } })
    await prisma.subscriptionAuditLog.create({ data: { businessId, actorUserId: owner.id, action: 'TEST' } })
    await prisma.platformInternalNote.create({ data: { businessId, authorUserId: owner.id, content: 'Note' } })
    return { business, owner, tech, repair, submission, token: sign(owner), techToken: sign(tech) }
  }
  try {
    await prisma.plan.upsert({ where: { code: 'COMPLETE' }, create: { code: 'COMPLETE', name: 'Complete', priceARS: 1, displayOrder: 1 }, update: {} })
    await prisma.billingSettings.upsert({ where: { id: 'default' }, create: {}, update: {} })
    const a = await tenant('Security fixture'), b = await tenant('Account B')
    const before = await snapshot()
    for (const [data, label] of [[{ ...body, confirmation: ' ELIMINAR MI CUENTA' }, 'exact confirmation'], [{ ...body, password: 'Wrong123!' }, 'current password'], [{ confirmation: body.confirmation }, 'password required']] as const) {
      assert.equal((await request('DELETE', '/api/account', a.token, data)).status, 400, label)
      assert.deepEqual(await snapshot(), before); check(label + ' rejects without changes')
    }
    assert.equal((await request('DELETE', '/api/account', undefined, body)).status, 401); check('authentication required')
    const technician = await request('DELETE', '/api/account', a.techToken, body)
    assert.equal(technician.status, 403); assert.equal(technician.data.message, 'Solo el propietario puede eliminar permanentemente la cuenta y el negocio.')
    assert.deepEqual(await snapshot(), before); check('TECHNICIAN forbidden, all records intact')
    await prisma.user.update({ where: { id: a.owner.id }, data: { platformRole: 'SUPER_ADMIN' } })
    const adminBefore = await snapshot()
    const admin = await request('DELETE', '/api/account', a.token, body)
    assert.equal(admin.status, 403); assert.equal(admin.data.message, 'La cuenta de administración de plataforma no puede eliminarse desde este flujo.')
    assert.deepEqual(await snapshot(), adminBefore); check('SUPER_ADMIN blocked in backend')
    await prisma.user.update({ where: { id: a.owner.id }, data: { platformRole: 'USER' } })
    await prisma.user.update({ where: { id: a.tech.id }, data: { role: 'OWNER' } })
    const multiBefore = await snapshot()
    const multi = await request('DELETE', '/api/account', a.token, body, '10.0.0.2')
    assert.equal(multi.status, 409); assert.equal(multi.data.message, 'Hay más de un propietario activo. No se puede eliminar el negocio mientras existan otros propietarios.')
    assert.deepEqual(await snapshot(), multiBefore); check('multiple active owners block purge')
    await prisma.user.update({ where: { id: a.tech.id }, data: { role: 'TECHNICIAN' } })
    assert.equal((await request('DELETE', '/api/account', a.token, { ...body, password: 'Wrong again' })).status, 400)
    // A has exhausted five attempts; prove user budget cannot be bypassed with a new IP.
    const limited = await request('DELETE', '/api/account', a.token, body, '10.0.0.3')
    assert.equal(limited.status, 429); check('five attempts/user/15min across IPs')

    const c = await tenant('Account A')
    const inactiveOwner = await prisma.user.create({ data: { businessId: c.business.id, name: 'Inactive owner', email: randomUUID() + '@example.com', passwordHash: c.owner.passwordHash, role: 'OWNER', isActive: false } })
    await prisma.passwordResetToken.create({ data: { userId: inactiveOwner.id, tokenHash: randomUUID(), expiresAt: new Date() } })
    const intact = await snapshot()
    const results = await Promise.all([request('DELETE', '/api/account', c.token, body), request('DELETE', '/api/account', c.token, body)])
    assert.equal(results.filter(r => r.status === 200).length, 1, JSON.stringify(results))
    assert.ok(results.every(r => [200, 401, 404, 409].includes(r.status))); check('simultaneous deletes: exactly one succeeds')
    const after = await snapshot()
    const removedCounts: Record<string, number> = {}
    for (const model of tenantModels) {
      const oldRows = intact[model] as any[]
      const cRows = ownedRows(intact, model, c.business.id)
      assert.ok(cRows.length > 0, model + ' fixture exists')
      assert.deepEqual(after[model], oldRows.filter(row => !cRows.some(deleted => deleted.id === row.id)), model + ' only C physically removed')
      removedCounts[model] = (after[model] as any[]).filter(row => cRows.some(deleted => deleted.id === row.id)).length
      check(model + ' physically deleted; A/B byte-for-byte intact')
    }
    assert.deepEqual(after.Plan, intact.Plan); assert.deepEqual(after.BillingSettings, intact.BillingSettings); check('Plan and BillingSettings unchanged')
    assert.equal(await prisma.user.findUnique({ where: { id: inactiveOwner.id } }), null); check('inactive owner does not block and is physically deleted')
    for (const token of [c.token, c.techToken]) assert.equal((await request('GET', '/api/auth/me', token)).status, 401)
    check('all old tenant JWTs rejected')
    assert.equal((await request('GET', `/api/tracking/${c.repair.trackingToken}`)).status, 404); check('deleted public tracking 404')
    const nativeFetch = globalThis.fetch
    globalThis.fetch = ((input: any, init: any) => String(input).includes('challenges.cloudflare.com/turnstile') ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 })) : nativeFetch(input, init)) as typeof fetch
    const registered = await request('POST', '/api/auth/register', undefined, validRegistrationPayload({ email: c.owner.email, password, firstName: 'Nuevo', lastName: 'Owner', businessName: 'Reused email' }))
    assert.equal(registered.status, 201, JSON.stringify(registered.data)); check('same email registers again after physical deletion')
    globalThis.fetch = nativeFetch

    const d = await tenant('Rollback D'), rollbackBefore = await snapshot()
    await prisma.$executeRawUnsafe(`CREATE FUNCTION account_deletion_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."businessId" = '${d.business.id}' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN OLD; END $$`)
    await prisma.$executeRawUnsafe('CREATE TRIGGER account_deletion_test_failure BEFORE DELETE ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION account_deletion_test_failure()')
    try {
      assert.equal((await request('DELETE', '/api/account', d.token, body)).status, 409)
      assert.deepEqual(await snapshot(), rollbackBefore); check('intermediate DB failure rolls back every deleted row')
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER account_deletion_test_failure ON "CashMovement"')
      await prisma.$executeRawUnsafe('DROP FUNCTION account_deletion_test_failure()')
    }
    await prisma.paymentSubmission.update({ where: { id: b.submission.id }, data: { reviewedByUserId: d.owner.id } })
    const crossBefore = await snapshot()
    assert.equal((await request('DELETE', '/api/account', d.token, body)).status, 409)
    assert.deepEqual(await snapshot(), crossBefore); check('cross-tenant SetNull reference blocks without touching B')
    await prisma.paymentSubmission.update({ where: { id: b.submission.id }, data: { reviewedByUserId: b.owner.id } })
    assert.equal((await request('DELETE', '/api/account', d.token, body)).status, 200); check('retry after rollback succeeds')

    const e = await tenant('Security revalidation E')
    const { deleteOwnerAccount } = await import('../src/modules/account/account-deletion.service')
    const staleAuth = { userId: e.owner.id, businessId: e.business.id, tokenVersion: e.owner.tokenVersion, role: 'OWNER' as const, platformRole: 'USER' as const }
    await prisma.user.update({ where: { id: e.owner.id }, data: { tokenVersion: { increment: 1 } } })
    const staleBefore = await snapshot()
    await assert.rejects(deleteOwnerAccount(staleAuth, password), (error: any) => error.status === 401)
    assert.deepEqual(await snapshot(), staleBefore); check('transaction revalidates tokenVersion after authenticate')
    const currentOwner = await prisma.user.update({ where: { id: e.owner.id }, data: { passwordHash: await bcrypt.hash('NewPassword123!', 4) } })
    const passwordBefore = await snapshot()
    assert.equal((await request('DELETE', '/api/account', sign(currentOwner), body)).status, 400)
    assert.deepEqual(await snapshot(), passwordBefore); check('bcrypt compares current DB password, never JWT/body metadata')
    assert.equal((await request('DELETE', '/api/account', sign(currentOwner), { ...body, businessId: b.business.id })).status, 400)
    assert.deepEqual(await snapshot(), passwordBefore); check('body cannot choose a different tenant')

    // Four owners each make five invalid attempts from the same IP; the fifth owner is limited by IP.
    const rateUsers = [currentOwner]
    for (let i = 0; i < 4; i++) rateUsers.push(await prisma.user.create({ data: { businessId: e.business.id, name: 'Rate test owner', email: randomUUID() + '@example.com', role: 'OWNER', passwordHash: e.owner.passwordHash } }))
    const rateBefore = await snapshot()
    // currentOwner already used two attempts above; use the four new owners for the IP budget.
    for (const u of rateUsers.slice(1)) for (let i = 0; i < 5; i++) assert.equal((await request('DELETE', '/api/account', sign(u), { ...body, confirmation: 'WRONG' }, '192.0.2.20')).status, 400)
    const ipLimited = await request('DELETE', '/api/account', sign(currentOwner), body, '192.0.2.20')
    assert.equal(ipLimited.status, 429); assert.ok(ipLimited.data.message)
    assert.deepEqual(await snapshot(), rateBefore); check('twenty attempts/IP/15min across users, no data changed')

    const blocked = await tenant('Blocked subscription owner')
    await prisma.subscription.update({ where: { businessId: blocked.business.id }, data: { status: 'SUSPENDED', manuallyBlockedAt: new Date(), manualBlockReason: 'TEST', accessExpiresAt: new Date(Date.now() - 10 * 86400000) } })
    const login = (email: string, currentPassword = password) => request('POST', '/api/auth/login', undefined, { email, password: currentPassword }, '192.0.2.60')
    const blockedLogin = await login(blocked.owner.email)
    assert.equal(blockedLogin.status, 403); assert.equal(blockedLogin.data.code, 'SUBSCRIPTION_BLOCKED')
    assert.equal(blockedLogin.data.token, undefined); assert.equal(blockedLogin.data.user, undefined)
    assert.equal(typeof blockedLogin.data.deletionToken, 'string', 'blocked OWNER needs deletion-only capability')
    const deletionToken = blockedLogin.data.deletionToken as string
    const claims = jwt.verify(deletionToken, process.env.JWT_SECRET!) as jwt.JwtPayload
    assert.equal(claims.purpose, 'account-deletion'); assert.equal(claims.userId, blocked.owner.id); assert.equal(claims.businessId, blocked.business.id)
    assert.equal(claims.tokenVersion, blocked.owner.tokenVersion); assert.equal(claims.exp! - claims.iat!, 600)
    assert.equal(claims.role, undefined); check('blocked OWNER login issues only purpose-bound 10-minute token, no normal session')
    const blockedBefore = await snapshot()
    for (const path of ['/api/auth/me', '/api/settings', '/api/profile', '/api/repairs', '/api/clients', '/api/billing/subscription', '/api/platform-admin/businesses']) {
      assert.equal((await request('GET', path, deletionToken)).status, 401, 'purpose token cannot authenticate ' + path)
    }
    assert.equal((await request('POST', '/api/settings/logout-other-sessions', deletionToken, {})).status, 401)
    assert.equal((await request('GET', '/api/account', deletionToken)).status, 401)
    assert.equal((await request('POST', '/api/account', deletionToken, body)).status, 401)
    assert.equal((await request('DELETE', '/api/account/other', deletionToken, body)).status, 401)
    assert.deepEqual(await snapshot(), blockedBefore); check('purpose token rejected by all tested normal reads/writes')
    assert.equal((await request('GET', '/api/auth/me', blocked.token)).status, 403); check('normal JWT still respects subscription block')
    const pieces = deletionToken.split('.'); pieces[2] = (pieces[2][0] === 'a' ? 'b' : 'a') + pieces[2].slice(1)
    assert.equal((await request('DELETE', '/api/account', pieces.join('.'), body)).status, 401); check('tampered purpose token rejected')
    const restrictedClaims = { purpose: 'account-deletion', userId: blocked.owner.id, businessId: blocked.business.id, tokenVersion: blocked.owner.tokenVersion }
    const signRestricted = (changes: Record<string, unknown> = {}, expiresIn = 600) => jwt.sign({ ...restrictedClaims, ...changes }, process.env.JWT_SECRET!, { expiresIn })
    assert.equal((await request('DELETE', '/api/account', signRestricted({}, -1), body)).status, 401); check('expired purpose token rejected')
    for (const changes of [{ businessId: b.business.id }, { userId: b.owner.id }, { tokenVersion: blocked.owner.tokenVersion + 1 }, { purpose: 'password-change' }]) {
      assert.equal((await request('DELETE', '/api/account', signRestricted(changes), body)).status, 401)
    }
    assert.deepEqual(await snapshot(), blockedBefore); check('purpose, user/business binding and tokenVersion revalidated')
    assert.equal((await request('DELETE', '/api/account', jwt.sign(restrictedClaims, process.env.JWT_SECRET!), body)).status, 401)
    assert.equal((await request('DELETE', '/api/account', signRestricted({}, 3600), body)).status, 401); check('purpose capability requires expiration and cannot exceed ten minutes')
    for (const [data, label] of [[{ ...body, password: 'Wrong current password' }, 'password'], [{ ...body, confirmation: 'eliminar mi cuenta' }, 'phrase']] as const) {
      assert.equal((await request('DELETE', '/api/account', deletionToken, data)).status, 400)
      assert.deepEqual(await snapshot(), blockedBefore); check('purpose token still requires exact ' + label + ', nothing deleted')
    }
    const blockedTechnicianLogin = await login(blocked.tech.email)
    assert.equal(blockedTechnicianLogin.status, 403); assert.equal(blockedTechnicianLogin.data.audience, 'TECHNICIAN')
    assert.equal(blockedTechnicianLogin.data.deletionToken, undefined); assert.equal(blockedTechnicianLogin.data.token, undefined)
    assert.equal((await request('DELETE', '/api/account', signRestricted({ userId: blocked.tech.id }), body)).status, 403); check('blocked TECHNICIAN receives no deletion capability; forged role cannot authorize')
    await prisma.user.update({ where: { id: blocked.tech.id }, data: { role: 'OWNER' } })
    const blockedMultiBefore = await snapshot()
    assert.equal((await request('DELETE', '/api/account', deletionToken, body)).status, 409)
    assert.deepEqual(await snapshot(), blockedMultiBefore); check('multiple owners also block purpose-token purge')
    await prisma.user.update({ where: { id: blocked.tech.id }, data: { role: 'TECHNICIAN' } })
    const beforeBlockedPurge = await snapshot()
    assert.equal((await request('DELETE', '/api/account', deletionToken, body)).status, 200)
    await assertFullPurge(beforeBlockedPurge, blocked.business.id); check('blocked subscription owner: full physical purge, other tenants and globals intact')
    assert.equal((await request('GET', `/api/tracking/${blocked.repair.trackingToken}`)).status, 404)
    assert.equal((await request('DELETE', '/api/account', deletionToken, body)).status, 401); check('purged restricted token invalid and tracking 404')

    const businessBlocked = await tenant('Business blocked owner')
    await prisma.business.update({ where: { id: businessBlocked.business.id }, data: { isActive: false } })
    const businessLogin = await login(businessBlocked.owner.email)
    assert.equal(businessLogin.status, 403); assert.equal(businessLogin.data.code, 'BUSINESS_BLOCKED')
    assert.equal(businessLogin.data.token, undefined); assert.equal(typeof businessLogin.data.deletionToken, 'string')
    assert.equal((await request('GET', '/api/settings', businessLogin.data.deletionToken)).status, 401)
    assert.equal((await request('GET', '/api/settings', businessBlocked.token)).status, 403)
    const beforeBusinessPurge = await snapshot()
    assert.equal((await request('DELETE', '/api/account', businessLogin.data.deletionToken, body)).status, 200)
    await assertFullPurge(beforeBusinessPurge, businessBlocked.business.id); check('BUSINESS_BLOCKED owner deletes entire tenant without normal access')

    const expiredOwner = await tenant('Trial expired owner')
    await prisma.subscription.update({ where: { businessId: expiredOwner.business.id }, data: { trialEndsAt: new Date(Date.now() - 20 * 86400000), accessExpiresAt: new Date(Date.now() - 20 * 86400000) } })
    const expiredLogin = await login(expiredOwner.owner.email)
    // Vencimiento por sí solo = bloqueo AUTOMÁTICO: el OWNER entra en modo renovación con sesión
    // normal y conserva el derecho a eliminar su cuenta, sin acceso al resto del sistema.
    assert.equal(expiredLogin.status, 200); assert.equal(expiredLogin.data.deletionToken, undefined)
    assert.equal((await request('GET', '/api/auth/me', expiredLogin.data.token)).status, 200)
    assert.equal((await request('GET', '/api/billing/subscription', expiredLogin.data.token)).status, 200)
    assert.equal((await request('GET', '/api/clients', expiredLogin.data.token)).status, 403)
    const expiredDeletionBefore = await snapshot()
    assert.equal((await request('DELETE', '/api/account', expiredLogin.data.token, body)).status, 200)
    await assertFullPurge(expiredDeletionBefore, expiredOwner.business.id); check('expired trial: renewal session limited to billing, still deletes the whole tenant')

    const expiredAdmin = await tenant('Trial expired super admin')
    await prisma.subscription.update({ where: { businessId: expiredAdmin.business.id }, data: { trialEndsAt: new Date(Date.now() - 20 * 86400000), accessExpiresAt: new Date(Date.now() - 20 * 86400000) } })
    const adminDeletionToken = jwt.sign({ purpose: 'account-deletion', userId: expiredAdmin.owner.id, businessId: expiredAdmin.business.id, tokenVersion: expiredAdmin.owner.tokenVersion }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: 600 })
    await prisma.user.update({ where: { id: expiredAdmin.owner.id }, data: { platformRole: 'SUPER_ADMIN' } })
    const specialAdminBefore = await snapshot()
    assert.equal((await request('DELETE', '/api/account', adminDeletionToken, body)).status, 403)
    assert.deepEqual(await snapshot(), specialAdminBefore); check('purpose middleware rereads platformRole, SUPER_ADMIN cannot delete')
    const superLogin = await login(expiredAdmin.owner.email)
    assert.equal(superLogin.status, 200); assert.equal(superLogin.data.deletionToken, undefined)
    assert.equal((await request('DELETE', '/api/account', superLogin.data.token, body)).status, 403); check('SUPER_ADMIN never receives deletion token and normal token remains forbidden')
    const activeLogin = await login(b.owner.email)
    assert.equal(activeLogin.status, 200); assert.equal(activeLogin.data.deletionToken, undefined)
    assert.equal((await request('GET', '/api/auth/me', activeLogin.data.token)).status, 200); check('active OWNER login still creates ordinary working session')
    const evidenceDirectory = resolve(__dirname, '../../artifacts/account-deletion')
    mkdirSync(evidenceDirectory, { recursive: true })
    writeFileSync(resolve(evidenceDirectory, 'db-evidence.json'), JSON.stringify({ database: '127.0.0.1:55439/account_deletion_test', deletedBusinessId: c.business.id, preservedBusinessId: b.business.id, remainingRowsForDeletedIds: removedCounts, preservedSnapshotsIdentical: true, globalsIdentical: true, totalRollbackVerified: true, concurrentStatuses: results.map(r => r.status), reusedEmailRegistrationStatus: registered.status, checksPassed: passed }, null, 2) + '\n')
    console.log(`ACCOUNT DELETION TESTS PASSED: ${passed}`)
  } finally {
    // Deliberately retain fixtures in this dedicated local DB for inspection; no global deletes.
    await prisma.$disconnect()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

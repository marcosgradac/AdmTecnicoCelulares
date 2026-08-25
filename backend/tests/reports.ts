import 'dotenv/config'
import assert from 'node:assert/strict'
import { app } from '../src/server'
import { prisma } from '../src/lib/prisma'
import { validRegistrationPayload } from './helpers/registration'

async function main() {
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const businesses: string[] = []
  const request = async (method: string, path: string, body?: object, token?: string) => {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }
  const register = async (label: string) => {
    const result = await request('POST', '/auth/register', validRegistrationPayload({ firstName: 'Reporte', lastName: label, email: `reports-${label}-${suffix}@example.com`, password: 'Reportes123', businessName: `Reports ${label} ${suffix}` }))
    assert.equal(result.status, 201); businesses.push(result.body.user.business.id)
    return { token: result.body.token as string, businessId: result.body.user.business.id as string, userId: result.body.user.id as string }
  }
  const clean = async () => {
    for (const businessId of businesses) await prisma.$transaction([
      prisma.inventoryMovement.deleteMany({ where: { businessId } }), prisma.repairPart.deleteMany({ where: { repair: { businessId } } }),
      prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId } } }), prisma.repairPhoto.deleteMany({ where: { repair: { businessId } } }),
      prisma.payment.deleteMany({ where: { businessId } }), prisma.cashMovement.deleteMany({ where: { businessId } }), prisma.repair.deleteMany({ where: { businessId } }),
      prisma.device.deleteMany({ where: { businessId } }), prisma.client.deleteMany({ where: { businessId } }), prisma.stockItem.deleteMany({ where: { businessId } }),
      prisma.passwordResetToken.deleteMany({ where: { user: { businessId } } }), prisma.subscription.deleteMany({ where: { businessId } }), prisma.user.deleteMany({ where: { businessId } }), prisma.business.deleteMany({ where: { id: businessId } }),
    ])
  }
  try {
    const ownerA = await register('A'), ownerB = await register('B')
    const now = new Date()
    const client = await prisma.client.create({ data: { businessId: ownerA.businessId, name: 'Cliente métricas', createdAt: now } })
    const repair = await prisma.repair.create({ data: { businessId: ownerA.businessId, clientId: client.id, number: 9001, deviceBrand: 'Apple', deviceModel: 'iPhone 13', issue: 'Pantalla rota', status: 'REPAIRING', total: 100_000, paid: 40_000, partsCost: 20_000, laborCost: 10_000, estimatedDeliveryDate: new Date(now.getTime() - 86_400_000), createdAt: now } })
    await prisma.payment.create({ data: { businessId: ownerA.businessId, clientId: client.id, repairId: repair.id, amount: 40_000, method: 'TRANSFER', createdAt: now } })
    await prisma.cashMovement.createMany({ data: [
      { businessId: ownerA.businessId, type: 'INCOME', description: 'Pago reparación', amount: 40_000, method: 'TRANSFER', repairId: repair.id, createdAt: now },
      { businessId: ownerA.businessId, type: 'EXPENSE', description: 'Servicio externo', amount: 5_000, createdAt: now },
    ] })
    const report = await request('GET', '/reports/overview?period=this_month', undefined, ownerA.token)
    assert.equal(report.status, 200)
    assert.equal(report.body.summary.collected, 40_000)
    assert.equal(report.body.finance.billed, 100_000)
    assert.equal(report.body.summary.receivable, 60_000)
    assert.equal(report.body.summary.estimatedProfit, 65_000)
    assert.equal(report.body.repairs.overdue, 1)

    const isolated = await request('GET', '/reports/overview?period=this_month', undefined, ownerB.token)
    assert.equal(isolated.status, 200)
    assert.equal(isolated.body.summary.collected, 0)
    assert.equal(isolated.body.summary.repairsIncoming, 0)

    const member = await request('POST', '/team', { firstName: 'Técnico', lastName: 'QA', email: `tech-reports-${suffix}@example.com`, password: 'Tecnico123', role: 'TECHNICIAN' }, ownerA.token)
    assert.equal(member.status, 201)
    const techLogin = await request('POST', '/auth/login', { email: `tech-reports-${suffix}@example.com`, password: 'Tecnico123' })
    assert.equal(techLogin.status, 200)
    assert.equal((await request('GET', '/reports/overview?period=this_month', undefined, techLogin.body.token)).status, 403)
    assert.equal((await request('GET', '/reports/overview?period=custom&from=2026-01-10&to=2026-01-01', undefined, ownerA.token)).status, 400)
    assert.equal((await request('GET', '/reports/overview?period=custom&from=2026-01-01', undefined, ownerA.token)).status, 400)
    assert.equal((await request('GET', '/reports/overview?period=custom&from=2025-01-01&to=2026-01-02', undefined, ownerA.token)).status, 400)
    console.log('REPORTS TESTS PASSED: formulas, UTC period validation, owner permission and tenant isolation')
  } finally {
    await clean()
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })

import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Local PostgreSQL only')
assert.ok(database.pathname.endsWith('_test'), 'Dedicated test database required')
process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '500'

const restricted = ['partsCost', 'laborCost', 'laborCharge', 'initialCostMovementId', 'payments', 'cancellationRefundMethod', 'cancellationRefundMovementId']
const safe = (repair: any) => {
  for (const key of restricted) assert.equal(key in repair, false, `Leaked ${key}`)
  assert.equal(typeof repair.total, 'number')
  assert.equal(typeof repair.paid, 'number')
  assert.ok(!JSON.stringify(repair).includes('Adelanto corregido de'))
}

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const businesses: string[] = []
  const call = async (token: string, method: string, path: string, body?: object) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, body: await response.json() as any }
  }
  const tokenFor = (user: any) => jwt.sign({ userId: user.id, businessId: user.businessId, role: user.role, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET!)
  try {
    const business = await prisma.business.create({ data: { name: `Visibility ${randomUUID()}` } }); businesses.push(business.id)
    const other = await prisma.business.create({ data: { name: `Other ${randomUUID()}` } }); businesses.push(other.id)
    const permissions = ['repairs.view', 'repairs.create', 'repairs.update', 'repairs.changeStatus', 'clients.view']
    const user = (role: 'OWNER' | 'TECHNICIAN', financial: boolean, businessId = business.id) => prisma.user.create({ data: {
      businessId, name: 'Test', email: `${randomUUID()}@local.test`, passwordHash: 'unused', role,
      permissions: [...permissions, ...(financial ? ['repairs.viewFinancials'] : [])],
    } })
    const owner = tokenFor(await user('OWNER', false)), authorized = tokenFor(await user('TECHNICIAN', true))
    const technician = tokenFor(await user('TECHNICIAN', false)), outsider = tokenFor(await user('OWNER', true, other.id))
    const noViewUser = await user('TECHNICIAN', false)
    await prisma.user.update({ where: { id: noViewUser.id }, data: { permissions: [] } })
    const noView = tokenFor(noViewUser)
    const client = await prisma.client.create({ data: { businessId: business.id, name: 'Client' } })
    const input = { clientId: client.id, deviceBrand: 'Test', deviceModel: 'Phone', issue: 'Broken screen', total: 10000, warrantyEnabled: true, warrantyDurationDays: 30 }
    const created = await call(owner, 'POST', '/repairs', { ...input, partsCost: 2000, partsCostMethod: 'CASH', laborCharge: 5000, advanceAmount: 1000, advanceMethod: 'TRANSFER' })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const id = created.body.id
    await prisma.repair.update({ where: { id }, data: { laborCost: 500 } })
    assert.equal((await call(owner, 'PATCH', `/repairs/${id}/advance`, { amount: 1500, method: 'TRANSFER' })).status, 200)
    await prisma.repairStatusHistory.create({ data: { repairId: id, previousStatus: 'RECEIVED', newStatus: 'REVIEW', internalNote: 'Diagnóstico operativo', changedByUserId: (await prisma.user.findFirstOrThrow({ where: { businessId: business.id, role: 'OWNER' } })).id } })
    for (const token of [owner, authorized]) {
      const detail = await call(token, 'GET', `/repairs/${id}`)
      assert.equal(detail.status, 200)
      assert.equal(detail.body.partsCost, 2000); assert.equal(detail.body.laborCost, 500); assert.equal(detail.body.laborCharge, 5000)
      assert.ok(detail.body.initialCostMovementId)
      assert.equal(detail.body.payments[0].amount, 1500); assert.ok(detail.body.payments[0].cashMovementId)
      assert.ok(JSON.stringify(detail.body.statusHistory).includes('Adelanto corregido de'))
      assert.equal((await call(token, 'GET', `/repairs/${id}/payments`)).body.length, 1)
      const history = await call(token, 'GET', `/repairs/${id}/history`)
      assert.equal(history.status, 200)
      assert.ok(JSON.stringify(history.body).includes('Adelanto corregido de'))
    }
    console.log('A/B/H PASS: owner and authorized technician retain detail and payments')
    const detail = await call(technician, 'GET', `/repairs/${id}`)
    assert.equal(detail.status, 200); safe(detail.body)
    assert.equal(detail.body.total, 10000); assert.equal(detail.body.paid, 1500)
    assert.ok(detail.body.statusHistory.some((item: any) => item.internalNote === 'Diagnóstico operativo'))
    const history = await call(technician, 'GET', `/repairs/${id}/history`)
    assert.equal(history.status, 200); assert.ok(!JSON.stringify(history.body).includes('Adelanto corregido de'))
    assert.ok(history.body.some((item: any) => item.internalNote === 'Diagnóstico operativo'))
    for (const path of ['/repairs', `/repairs/${id}`, `/repairs/${id}/payments`, `/repairs/${id}/history`]) {
      assert.equal((await call(noView, 'GET', path)).status, 403, `Technician without permissions: ${path}`)
    }
    console.log('History permission PASS: owner/view allowed, no view denied, financial notes redacted and operational notes retained')
    const list = await call(technician, 'GET', '/repairs'); assert.equal(list.status, 200); list.body.items.forEach(safe)
    console.log('C PASS: operational detail/list/history without protected fields')
    assert.equal((await call(technician, 'GET', `/repairs/${id}/payments`)).status, 403)
    for (const [method, path, body] of [
      ['POST', `/repairs/${id}/payments`, { amount: 1, method: 'CASH' }],
      ['PATCH', `/repairs/${id}/advance`, { amount: 1 }],
      ['POST', `/repairs/${id}/cancellation-payment`, { amount: 1, method: 'CASH' }],
      ['POST', `/repairs/${id}/cancel`, { reviewFee: 0, refundMethod: 'CASH' }],
    ] as const) assert.equal((await call(technician, method, path, body)).status, 403)
    console.log('D PASS: financial reads and writes denied')
    for (const token of [technician, owner, authorized]) {
      const result = await call(token, 'GET', `/clients/${client.id}`)
      assert.equal(result.status, 200); result.body.repairs.forEach(safe)
      assert.deepEqual(Object.keys(result.body.repairs[0]).sort(), ['id','number','total','paid','createdAt','updatedAt','deviceBrand','deviceModel','issue','status'].sort())
    }
    console.log('E PASS: client uses explicit operational projection')
    const own = await call(technician, 'POST', '/repairs', input); assert.equal(own.status, 201); safe(own.body)
    for (const extra of [{ partsCost: 1, partsCostMethod: 'CASH' }, { laborCharge: 1 }, { advanceAmount: 1, advanceMethod: 'CASH' }]) {
      assert.equal((await call(technician, 'POST', '/repairs', { ...input, ...extra })).status, 403)
    }
    const updated = await call(technician, 'PATCH', `/repairs/${id}`, { ...input, total: 11000, partsCost: 999, laborCost: 999, laborCharge: 999, paid: 999 })
    assert.equal(updated.status, 200); safe(updated.body); assert.equal(updated.body.total, 11000)
    const unchanged = await prisma.repair.findUniqueOrThrow({ where: { id } })
    assert.equal(unchanged.partsCost, 2000); assert.equal(unchanged.laborCost, 500); assert.equal(unchanged.laborCharge, 5000); assert.equal(unchanged.paid, 1500)
    for (const [path, body] of [['status/advance', {}], ['status/rewind', {}], ['status', { status: 'REVIEW' }], ['approve', {}], ['start', {}]] as const) {
      const result = await call(technician, 'PATCH', `/repairs/${id}/${path}`, body)
      assert.equal(result.status, 200, path); safe(result.body)
    }
    assert.equal((await call(technician, 'POST', `/repairs/${own.body.id}/cancel`, { reviewFee: 100 })).status, 403)
    const cancelled = await call(technician, 'POST', `/repairs/${own.body.id}/cancel`, { reviewFee: 0 })
    assert.equal(cancelled.status, 200); safe(cancelled.body); assert.equal(cancelled.body.cancellationReviewFee, 0)
    const warranties = await call(technician, 'GET', '/warranties'); assert.equal(warranties.status, 200); warranties.body.forEach(safe)
    const warrantyEdit = await call(technician, 'PATCH', `/warranties/${id}`, { durationDays: 45 })
    assert.equal(warrantyEdit.status, 200); safe(warrantyEdit.body)
    const ownerCancel = await call(owner, 'POST', `/repairs/${id}/cancel`, { reviewFee: 500, refundMethod: 'CASH' })
    assert.equal(ownerCancel.status, 200); assert.ok(ownerCancel.body.cancellationRefundMovementId)
    const cancelledView = await call(technician, 'GET', `/repairs/${id}`); safe(cancelledView.body)
    assert.equal(cancelledView.body.cancellationReviewFee, 500); assert.equal(cancelledView.body.cancellationRefundAmount, 1000)
    console.log('F PASS: create/update/status/cancel/warranties protected; total editable, costs immutable')
    for (const path of [`/repairs/${id}`, `/repairs/${id}/payments`, `/repairs/${id}/history`, `/clients/${client.id}`]) {
      assert.equal((await call(outsider, 'GET', path)).status, 404, path)
    }
    assert.equal((await call(outsider, 'GET', '/repairs')).body.items.length, 0)
    console.log('G PASS: cross-business detail/payments/history/client isolated')
  } finally {
    for (const businessId of businesses) {
      await prisma.payment.deleteMany({ where: { businessId } })
      await prisma.repair.deleteMany({ where: { businessId } })
      await prisma.cashMovement.deleteMany({ where: { businessId } })
      await prisma.client.deleteMany({ where: { businessId } })
      await prisma.subscription.deleteMany({ where: { businessId } })
      await prisma.user.deleteMany({ where: { businessId } })
      await prisma.business.deleteMany({ where: { id: businessId } })
    }
    await prisma.$disconnect()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

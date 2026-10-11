// Dashboard balances follow the cancellation settlement, including delivered debt.
import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import type { Server } from 'node:http'

// Refuse remote databases before importing the app/Prisma.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['postgres:', 'postgresql:'].includes(database.protocol))
assert.ok(database.pathname.endsWith('_test') && database.pathname !== '/tecnodesk_visual_test')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Use only a local test database')

process.env.NODE_ENV = 'test'

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { app } = await import('../src/server')
  let server: Server | undefined
  const suffix = randomBytes(6).toString('hex')
  const jwt = (await import('jsonwebtoken')).default
  // Declared up front so the finally block can clean a partial setup, including the
  // second tenant used to prove the figures are not contaminated.
  let businessId: string | undefined
  let ownerId: string | undefined
  let clientId: string | undefined
  let otherBusinessId: string | undefined
  let otherOwnerId: string | undefined
  let otherClientId: string | undefined
  try {
    server = app.listen(0)
    await new Promise<void>(resolve => server!.once('listening', resolve))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const BASE = `http://127.0.0.1:${address.port}/api`
    const owner = await prisma.user.create({ data: { business: { create: { name: `Dashboard ${suffix}` } }, name: 'Owner', email: `dashboard-${suffix}@local.test`, passwordHash: 'unused', role: 'OWNER' } })
    businessId = owner.businessId
    ownerId = owner.id
    const client = await prisma.client.create({ data: { businessId, name: 'Cliente Dashboard' } })
    clientId = client.id
    const token = jwt.sign({ userId: owner.id, businessId, role: 'OWNER', platformRole: 'USER', tokenVersion: owner.tokenVersion }, process.env.JWT_SECRET!, { expiresIn: '8h' })

    // Dates and IDs deliberately interleave statuses; settled repairs are older.
    const ids = { received: `dash-${suffix}-b-received`, delivered: `dash-${suffix}-a-delivered`, review: `dash-${suffix}-z-review` }
    const cases = [
      { id: ids.received, status: 'RECEIVED' as const, total: 10000, paid: 0, createdAt: new Date('2026-01-02T12:00:00Z') }, // A: 10000
      { id: ids.delivered, status: 'DELIVERED' as const, total: 30000, paid: 10000, createdAt: new Date('2026-01-02T12:00:00Z') }, // B: 20000
      { status: 'CANCELLED' as const, total: 70000, paid: 0, cancellationReviewFee: 0, cancellationPaidAmount: 0 }, // C: 0
      { status: 'CANCELLED' as const, total: 70000, paid: 50000, cancellationReviewFee: 0, cancellationPaidAmount: 50000, cancellationRefundAmount: 50000 }, // D: 0 despite original debt/refund
      { status: 'CANCELLED' as const, total: 70000, paid: 50000, cancellationReviewFee: 20000, cancellationPaidAmount: 50000 }, // E: 0
      { id: ids.review, status: 'CANCELLED' as const, total: 70000, paid: 10000, cancellationReviewFee: 20000, cancellationPaidAmount: 10000, createdAt: new Date('2026-01-01T12:00:00Z') }, // F: 10000
      { status: 'CANCELLED' as const, total: 70000, paid: 0, cancellationReviewFee: null, cancellationPaidAmount: null }, // Legacy: 0
      { status: 'WARRANTY' as const, total: 20000, paid: 20000 }, // Fully paid, still active
      { status: 'DELIVERED' as const, total: 100, paid: 120 }, // Overpayment: 0
    ]
    for (const [index, item] of cases.entries()) {
      await prisma.repair.create({ data: {
        businessId, number: 1001 + index, clientId: client.id, deviceBrand: 'Audit', deviceModel: 'Dash',
        issue: 'Dashboard', createdAt: new Date('2025-01-01T12:00:00Z'), ...item,
        trackingToken: `dash-${suffix}-${index}`, trackingEnabled: false, updatedAt: new Date(),
      } })
    }
    type Overview = { current: { activeRepairs: number; readyRepairs: number; pending: number }; attention: Array<{ key: string; count: number; items: Array<{ id: string }> }> }
    const overview = async (period = 'today') => {
      const result = await fetch(`${BASE}/dashboard/overview?period=${period}`, { headers: { authorization: `Bearer ${token}` } })
      assert.equal(result.status, 200)
      return result.json() as Promise<Overview>
    }
    const pendingGroup = (value: Overview) => value.attention.find(group => group.key === 'pending')!
    const expectedIds = [ids.review, ids.delivered, ids.received]
    const f = await overview()
    assert.equal(f.current.pending, 40000, 'A+B+F: 10k+20k+10k; C/D/E/legacy/paid/overpaid contribute zero')
    assert.equal(pendingGroup(f).count, 3)
    assert.deepEqual(pendingGroup(f).items.map(item => item.id), expectedIds, 'global createdAt/id order includes cancelled and delivered')
    await prisma.repair.update({ where: { id: ids.review }, data: { cancellationReviewPaid: 4000 } }) // G: 6000
    const response = await fetch(`${BASE}/dashboard/overview`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(response.status, 200)
    // This literal is deliberately retained solely to prove the removed endpoint is 404.
    assert.equal((await fetch(`${BASE}/dashboard/summary`, { headers: { authorization: `Bearer ${token}` } })).status, 404)
    const tech = await prisma.user.create({ data: { businessId, name: 'Technician', email: `tech-${suffix}@local.test`, passwordHash: 'unused', role: 'TECHNICIAN' } })
    const techToken = jwt.sign({ userId: tech.id, businessId, tokenVersion: tech.tokenVersion }, process.env.JWT_SECRET!, { expiresIn: '8h' })
    assert.equal((await fetch(`${BASE}/dashboard/overview`, { headers: { authorization: `Bearer ${techToken}` } })).status, 403)
    const body = await response.json() as Overview

    // WARRANTY is an active repair: only DELIVERED and CANCELLED are excluded.
    assert.equal(body.current.activeRepairs, 2, 'RECEIVED + WARRANTY must be active; DELIVERED must not')
    assert.equal(body.current.readyRepairs, 0)
    assert.equal(body.current.pending, 36000, 'A+B+G: 10k+20k+6k')
    assert.equal(pendingGroup(body).count, 3)
    assert.deepEqual(pendingGroup(body).items.map(item => item.id), expectedIds)
    await prisma.repair.update({ where: { id: ids.review }, data: { cancellationReviewPaid: 10000 } }) // H: 0
    const h = await overview()
    assert.equal(h.current.pending, 30000, 'H: review fully collected contributes zero')
    assert.equal(pendingGroup(h).count, 2)
    assert.deepEqual(pendingGroup(h).items.map(item => item.id), [ids.delivered, ids.received])
    await prisma.repair.update({ where: { id: ids.review }, data: { cancellationReviewPaid: 4000 } })
    for (const period of ['7d', '30d', 'month']) {
      const result = await overview(period)
      assert.deepEqual(result.current, body.current, 'pending does not depend on period')
      assert.deepEqual(pendingGroup(result), pendingGroup(body))
    }
    const fourth = await prisma.repair.create({ data: { businessId, clientId: client.id, number: 1100, deviceBrand: 'Audit', deviceModel: 'Fourth', issue: 'Dashboard', total: 1000, paid: 0, status: 'DELIVERED', createdAt: new Date('2026-01-03T12:00:00Z') } })
    const bounded = await overview()
    assert.equal(bounded.current.pending, 37000)
    assert.equal(pendingGroup(bounded).count, 4)
    assert.equal(pendingGroup(bounded).items.length, 3)
    assert.deepEqual(pendingGroup(bounded).items.map(item => item.id), expectedIds)
    await prisma.repair.delete({ where: { id: fourth.id } })

    // A second tenant must not contribute to either figure.
    const other = await prisma.user.create({ data: { business: { create: { name: `Otro ${suffix}` } }, name: 'Otro', email: `otro-${suffix}@local.test`, passwordHash: 'unused', role: 'OWNER' } })
    otherBusinessId = other.businessId
    otherOwnerId = other.id
    const otherClient = await prisma.client.create({ data: { businessId: other.businessId, name: 'Cliente ajeno' } })
    otherClientId = otherClient.id
    await prisma.repair.create({ data: {
      businessId: other.businessId, number: 1001, clientId: otherClient.id, deviceBrand: 'Otro', deviceModel: 'Ajeno',
      issue: 'Ajeno', total: 999000, paid: 0, status: 'RECEIVED', trackingToken: `otro-${suffix}`, trackingEnabled: false, updatedAt: new Date(),
    } })
    await prisma.repair.create({ data: { businessId: other.businessId, number: 1002, clientId: otherClient.id, deviceBrand: 'Otro', deviceModel: 'Cancelado', issue: 'Ajeno', total: 999000, paid: 0, status: 'CANCELLED', cancellationReviewFee: 888000, cancellationPaidAmount: 0, createdAt: new Date('2020-01-01') } })
    const after = await fetch(`${BASE}/dashboard/overview`, { headers: { authorization: `Bearer ${token}` } }).then(r => r.json()) as typeof body
    assert.equal(after.current.activeRepairs, 2, 'another business must not inflate activeRepairs')
    assert.equal(after.current.pending, 36000, 'other normal/cancelled debts must not inflate pending')
    assert.deepEqual(pendingGroup(after), pendingGroup(body), 'other business must not affect count/items')
    console.log(JSON.stringify({ pending: after.current.pending, count: pendingGroup(after).count, ids: pendingGroup(after).items.map(item => item.id) }))
    console.log('  ok  A-H, legacy, overpayment, delivered, WARRANTY, global order, limit, periods and tenant isolation')
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
    // Both tenants are removed here, never inside the happy path: an assertion that throws
    // after the second business was created would otherwise leave it behind.
    for (const tenant of [businessId, otherBusinessId]) {
      if (!tenant) continue
      await prisma.cashMovement.deleteMany({ where: { businessId: tenant } })
      await prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId: tenant } } })
      await prisma.repair.deleteMany({ where: { businessId: tenant } })
      // Registration also creates a Subscription, which RESTRICTs the business deletion.
      await prisma.user.deleteMany({ where: { businessId: tenant } })
      await prisma.subscription.deleteMany({ where: { businessId: tenant } })
    }
    if (clientId) await prisma.client.deleteMany({ where: { id: clientId } })
    if (otherClientId) await prisma.client.deleteMany({ where: { id: otherClientId } })
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } })
    if (otherOwnerId) await prisma.user.deleteMany({ where: { id: otherOwnerId } })
    if (businessId) await prisma.business.deleteMany({ where: { id: businessId } })
    if (otherBusinessId) await prisma.business.deleteMany({ where: { id: otherBusinessId } })
    await prisma.$disconnect()
  }
  console.log('PASS: dashboard overview preserves active/pending contract; OWNER 200, TECHNICIAN 403, removed endpoint 404')
}
main().catch(error => { console.error(error); process.exitCode = 1 })

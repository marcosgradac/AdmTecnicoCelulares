// Concurrency probe: double submissions and racing payments must never duplicate money.
import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { allocateRepairNumber } from '../src/lib/repair-number'

// Refuse remote databases before importing the app/Prisma.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Use only a local test database')

const prisma = new PrismaClient()
const BASE = 'http://127.0.0.1:3000/api'

async function main() {
  const suffix = randomBytes(6).toString('hex')
  const jwt = (await import('jsonwebtoken')).default
  // Declared up front so the finally block can clean a partial setup.
  let businessId: string | undefined
  let ownerId: string | undefined
  let clientId: string | undefined
  try {
    const owner = await prisma.user.create({ data: { business: { create: { name: `Concurrencia ${suffix}` } }, name: 'Owner', email: `concurrencia-${suffix}@local.test`, passwordHash: 'unused', role: 'OWNER' } })
    businessId = owner.businessId
    ownerId = owner.id
    const client = await prisma.client.create({ data: { businessId, name: 'Cliente Concurrencia' } })
    clientId = client.id
    const token = jwt.sign({ userId: owner.id, businessId, role: 'OWNER', platformRole: 'USER', tokenVersion: owner.tokenVersion }, process.env.JWT_SECRET!)
    const call = async (method: string, path: string, body?: object) => {
      const res = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined })
      return { status: res.status, text: await res.text() }
    }
    const newRepair = async (total: number) => prisma.$transaction(async tx => {
      const number = await allocateRepairNumber(tx, businessId)
      return tx.repair.create({ data: { businessId, number, clientId: client.id, deviceBrand: 'Audit', deviceModel: 'Race', issue: 'Concurrencia', total, status: 'RECEIVED', trackingToken: `audit-${suffix}-${number}`, trackingEnabled: false, updatedAt: new Date() } })
    })
    const cleanup = async (repairId: string) => {
      // Los pagos van primero: Payment.cashMovementId usa ON DELETE RESTRICT sobre CashMovement.
      await prisma.payment.deleteMany({ where: { repairId } })
      await prisma.cashMovement.deleteMany({ where: { repairId } })
      await prisma.repairStatusHistory.deleteMany({ where: { repairId } })
      await prisma.repair.deleteMany({ where: { id: repairId } })
    }

    // 1. Concurrent creations must not reuse a repair number.
    const concurrent = await Promise.all([1, 2, 3, 4, 5].map(() => newRepair(10000)))
    const numbers = concurrent.map(repair => repair.number)
    assert.equal(new Set(numbers).size, numbers.length, `duplicate repair numbers: ${numbers.join(',')}`)
    console.log(`  ok  5 concurrent repairs -> unique numbers ${numbers.join(',')}`)
    for (const repair of concurrent) await cleanup(repair.id)

    // 2. A double-clicked payment must charge once.
    const repair = await newRepair(10000)
    const body = { amount: 5000, method: 'CASH' }
    const both = await Promise.all([call('POST', `/repairs/${repair.id}/payments`, body), call('POST', `/repairs/${repair.id}/payments`, body)])
    const created = both.filter(r => r.status === 201).length
    const rejected = both.filter(r => r.status === 409).length
    assert.equal(created + rejected, 2, `unexpected statuses ${both.map(r => r.status).join(',')}`)
    const payments = await prisma.payment.count({ where: { repairId: repair.id } })
    const movements = await prisma.cashMovement.count({ where: { repairId: repair.id } })
    assert.equal(payments, created, `payments(${payments}) != created(${created})`)
    assert.equal(movements, created, `cash movements(${movements}) != created(${created})`)
    const stored = await prisma.repair.findUniqueOrThrow({ where: { id: repair.id } })
    assert.equal(stored.paid, created * 5000, `paid=${stored.paid} does not match ${created} payments`)
    console.log(`  ok  double payment -> ${created} accepted, ${rejected} rejected; paid=$${stored.paid}, movements=${movements}`)
    await cleanup(repair.id)

    // 3. Payments that would exceed the total must be refused atomically.
    const small = await newRepair(10000)
    const over = await Promise.all([call('POST', `/repairs/${small.id}/payments`, { amount: 8000, method: 'CASH' }), call('POST', `/repairs/${small.id}/payments`, { amount: 8000, method: 'CASH' })])
    const after = await prisma.repair.findUniqueOrThrow({ where: { id: small.id } })
    assert.ok(after.paid <= 10000, `paid exceeded the total: ${after.paid}`)
    assert.equal(await prisma.payment.count({ where: { repairId: small.id } }), after.paid / 8000, 'payments and paid diverged')
    assert.equal(await prisma.cashMovement.count({ where: { repairId: small.id } }), after.paid / 8000, 'orphan cash movement')
    console.log(`  ok  overshoot -> paid=$${after.paid} of $10000, statuses ${over.map(r => r.status).join(',')}`)
    await cleanup(small.id)
    console.log('PASS: no duplicated money, no overshoot, no orphan cash movements')
  } finally {
    // Scoped to this test's own records; each step is skipped when its id was never assigned.
    if (businessId) {
      // Pagos antes que caja: Payment.cashMovementId usa ON DELETE RESTRICT sobre CashMovement.
      await prisma.payment.deleteMany({ where: { businessId } })
      await prisma.cashMovement.deleteMany({ where: { businessId } })
      await prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId } } })
      await prisma.repair.deleteMany({ where: { businessId } })
    }
    if (clientId) await prisma.client.deleteMany({ where: { id: clientId } })
    if (businessId) {
      // Registration also creates a Subscription, which RESTRICTs the business deletion.
      await prisma.subscription.deleteMany({ where: { businessId } })
    }
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } })
    if (businessId) await prisma.business.deleteMany({ where: { id: businessId } })
  }
}
main().finally(() => prisma.$disconnect())

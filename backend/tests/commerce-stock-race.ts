// Stock race: with a single unit, two simultaneous sales must never both succeed.
import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

// Refuse remote databases before importing the app/Prisma.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname), 'Use only a local test database')

const prisma = new PrismaClient()
const BASE = 'http://127.0.0.1:3000/api'

async function main() {
  const suffix = randomBytes(6).toString('hex')
  const jwt = (await import('jsonwebtoken')).default
  // Ids are declared up front and filled as records are created, so the finally block can
  // clean a partial setup: if a creation throws half way, the ids created so far are known.
  let businessId: string | undefined
  let ownerId: string | undefined
  let productId: string | undefined
  try {
    const owner = await prisma.user.create({ data: { business: { create: { name: `Stock ${suffix}` } }, name: 'Owner', email: `stock-${suffix}@local.test`, passwordHash: 'unused', role: 'OWNER' } })
    businessId = owner.businessId
    ownerId = owner.id
    const token = jwt.sign({ userId: owner.id, businessId, role: 'OWNER', platformRole: 'USER', tokenVersion: owner.tokenVersion }, process.env.JWT_SECRET!)
    const call = async (method: string, path: string, body?: object) => {
      const res = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined })
      return { status: res.status, text: await res.text() }
    }
    const product = await prisma.commerceProduct.create({ data: { businessId, name: `Audit stock ${suffix}`, category: 'Audit', purchaseCost: 100, salePrice: 300, currentStock: 1 } })
    productId = product.id

    const sell = () => call('POST', '/commerce/sales', { lines: [{ productId: product.id, quantity: 1, expectedUnitPrice: 300 }], paymentMethod: 'CASH', expectedTotal: 300, idempotencyKey: crypto.randomUUID() })
    const [a, b] = await Promise.all([sell(), sell()])
    const ok = [a, b].filter(r => r.status === 201).length
    const after = await prisma.commerceProduct.findUniqueOrThrow({ where: { id: product.id } })
    assert.equal(ok, 1, `both sales succeeded (${a.status}/${b.status}) with stock 1`)
    assert.equal(after.currentStock, 0, `stock ended at ${after.currentStock}, expected 0`)
    const saleRow = await prisma.commerceSale.findFirstOrThrow({ where: { businessId, cancelledAt: null }, orderBy: { createdAt: 'desc' } })
    const income = await prisma.cashMovement.findFirst({ where: { commerceSaleId: saleRow.id } })
    assert.ok(income, 'the accepted sale produced no cash movement')
    assert.equal(income.type, 'INCOME')
    assert.equal(income.amount, 300)
    console.log(`  ok  stock=1 + 2 sales -> 1 accepted (${a.status}/${b.status}), stock=${after.currentStock}, income=$${income.amount}`)

    // Cancelling twice must restore the stock only once.
    const [c1, c2] = await Promise.all([call('POST', `/commerce/sales/${saleRow.id}/cancel`, {}), call('POST', `/commerce/sales/${saleRow.id}/cancel`, {})])
    const restored = await prisma.commerceProduct.findUniqueOrThrow({ where: { id: product.id } })
    const reversals = await prisma.cashMovement.count({ where: { relatedCommerceSaleId: saleRow.id } })
    assert.equal(restored.currentStock, 1, `stock after double cancel is ${restored.currentStock}, expected 1`)
    assert.equal(reversals, 1, `double cancel created ${reversals} reversal movements`)
    console.log(`  ok  double cancel -> stock=${restored.currentStock}, reversals=${reversals} (statuses ${c1.status}/${c2.status})`)
    console.log('PASS: stock never goes negative and cancellation restores exactly once')
  } finally {
    // Only this test's own records. Each step is skipped when its id was never assigned.
    if (businessId) {
      await prisma.cashMovement.deleteMany({ where: { businessId } })
      await prisma.commerceSaleLine.deleteMany({ where: { sale: { businessId } } })
      await prisma.commerceSale.deleteMany({ where: { businessId } })
    }
    if (productId) await prisma.commerceProduct.deleteMany({ where: { id: productId } })
    if (businessId) {
      // Registration also creates a Subscription, which RESTRICTs the business deletion.
      await prisma.subscription.deleteMany({ where: { businessId } })
    }
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } })
    if (businessId) await prisma.business.deleteMany({ where: { id: businessId } })
  }
}
main().finally(() => prisma.$disconnect())

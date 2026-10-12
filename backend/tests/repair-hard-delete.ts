import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import jwt from 'jsonwebtoken'
import { validRegistrationPayload } from './helpers/registration'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.equal(database.hostname, '127.0.0.1')
assert.ok(['/repair_finance_test', '/tecnodesk_role_permissions_test'].includes(database.pathname))
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => String(input).includes('challenges.cloudflare.com/turnstile')
  ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 })) : nativeFetch(input, init)) as typeof fetch

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/app'), import('../src/lib/prisma')])
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  let token = ''
  const request = async (path: string, body?: object, method = body ? 'POST' : 'GET', selectedToken = token) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, { method, headers: { 'content-type': 'application/json', 'X-Turnstile-Token': 'synthetic-test', authorization: `Bearer ${selectedToken}` }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, body: await response.json() as any }
  }
  try {
    assert.equal(await prisma.$queryRawUnsafe<any[]>("SELECT migration_name FROM _prisma_migrations WHERE migration_name = '20261011190000_repair_financial_ledger'").then(rows => rows.length), 0, 'No PR17 financial migration')
    const register = () => request('/auth/register', validRegistrationPayload({ firstName: 'Delete', lastName: 'Synthetic', email: `delete-${randomUUID()}@example.com`, password: 'SyntheticDelete123!', businessName: 'Synthetic deletion' }))
    const owner = await register()
    assert.equal(owner.status, 201, JSON.stringify(owner.body))
    token = owner.body.token
    const businessId = owner.body.user.business.id, userId = owner.body.user.id
    await prisma.subscription.update({ where: { businessId }, data: { planCode: 'COMPLETE', status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 30 * 86400000) } })
    const client = await request('/clients', { name: 'Synthetic client', phone: '1111111111' })
    assert.equal(client.status, 201)
    const create = async (income = 0, expense = 0) => {
      const result = await request('/repairs', { clientId: client.body.id, deviceBrand: 'Samsung', deviceModel: 'Synthetic', issue: 'Synthetic failure', total: 100000, advanceAmount: income, ...(income ? { advanceMethod: 'CASH' } : {}), ...(expense ? { partsCost: expense, partsCostMethod: 'CASH' } : {}) })
      assert.equal(result.status, 201, JSON.stringify(result.body))
      assert.equal('photos' in result.body, false, 'Photos no longer exist in the repair API')
      return result.body
    }
    const balance = async () => (await prisma.cashMovement.findMany({ where: { businessId } })).reduce((sum, row) => sum + (row.type === 'INCOME' ? row.amount : -row.amount), 0)
    const absent = async (id: string) => {
      assert.equal(await prisma.repair.count({ where: { id } }), 0)
      for (const model of [prisma.payment, prisma.cashMovement, prisma.inventoryMovement, prisma.repairPart, prisma.repairStatusHistory, prisma.warrantyClaim] as any[]) assert.equal(await model.count({ where: { repairId: id } }), 0)
      assert.equal((await request(`/repairs/${id}`)).status, 404)
    }
    await prisma.cashMovement.create({ data: { businessId, type: 'INCOME', amount: 100000, description: 'Synthetic opening', origin: 'GENERAL' } })
    const summaries = async () => {
      const general = await request('/cash/movements?period=MONTH')
      const grouped = await request('/cash/movements?period=MONTH&origin=REPAIR&groupByRepair=true')
      const dashboard = await request('/dashboard/overview?period=month')
      const report = await request('/reports/overview?period=this_month')
      for (const result of [general, grouped, dashboard, report]) assert.equal(result.status, 200, JSON.stringify(result.body))
      return { general: general.body.summary, repair: grouped.body.summary, financial: dashboard.body.financial,
        flow: dashboard.body.charts.cashFlow, report: report.body.finance, timeline: report.body.finance.timeline }
    }
    const baseline = await summaries()
    for (const [income, expense] of [[0, 0], [50000, 0], [0, 20000], [50000, 20000], [10000, 40000]]) {
      const repair = await create(income, expense)
      assert.equal(await balance(), 100000 + income - expense)
      const result = await request(`/repairs/${repair.id}`, undefined, 'DELETE')
      assert.equal(result.status, 200, JSON.stringify(result.body))
      await absent(repair.id)
      assert.equal(await balance(), 100000)
      assert.deepEqual(await summaries(), baseline, 'General Cash, repair Cash, dashboard, graphs and reports return to their exact initial values')
      assert.equal((await request(`/tracking/${repair.trackingToken}`)).status, 404)
      assert.equal((await request(`/repairs?search=${repair.number}`)).body.total, 0)
      console.log(`PASS cash ${100000 + income - expense} -> 100000 (income ${income}, expense ${expense})`)
    }
    const disabled = await create()
    for (const endpoint of ['cancel', 'cancel-preview', 'cancellation-payment']) assert.equal((await request(`/repairs/${disabled.id}/${endpoint}`, { requestId: randomUUID(), reviewFee: 0, expenses: [] })).status, 404)
    assert.equal((await request(`/repairs/${disabled.id}/status`, { status: 'CANCELLED' }, 'PATCH')).status, 400)
    assert.equal((await request('/repairs', { clientId: client.body.id, deviceBrand: 'Samsung', deviceModel: 'Synthetic', issue: 'Synthetic issue', status: 'CANCELLED' })).status, 400)
    await request(`/repairs/${disabled.id}`, undefined, 'DELETE')

    for (const status of ['RECEIVED', 'REVIEW', 'BUDGET', 'APPROVED', 'WAITING_PART', 'REPAIRING', 'TESTING', 'READY', 'DELIVERED', 'WARRANTY'] as const) {
      const repair = await create(10000, 20000)
      await prisma.repair.update({ where: { id: repair.id }, data: { status } })
      await prisma.repairStatusHistory.create({ data: { repairId: repair.id, newStatus: status, changedByUserId: userId, internalNote: 'Synthetic exclusive note' } })
        await prisma.cashMovement.create({ data: { businessId, repairId: repair.id, type: 'INCOME', amount: 5000, method: 'CASH', description: 'Synthetic supplier refund', origin: 'REPAIR' } })
      await prisma.cashMovement.create({ data: { businessId, repairId: repair.id, type: 'EXPENSE', amount: -5000, description: 'Synthetic accounting correction', origin: 'REPAIR' } })
      await prisma.cashMovement.create({ data: { businessId, repairId: repair.id, type: 'EXPENSE', amount: 3000, method: 'CASH', description: 'Synthetic customer refund', origin: 'REPAIR' } })
      const claim = await prisma.warrantyClaim.create({ data: { businessId, repairId: repair.id, description: 'Synthetic warranty' } })
      const warrantyCash = await prisma.cashMovement.create({ data: { businessId, repairId: repair.id, type: 'EXPENSE', amount: 2000, method: 'CASH', description: 'Synthetic warranty cost', origin: 'REPAIR' } })
      await prisma.warrantyClaimExpense.create({ data: { businessId, claimId: claim.id, cashMovementId: warrantyCash.id, idempotencyKey: randomUUID(), concept: 'Synthetic expense' } })
      assert.equal((await request(`/repairs/${repair.id}`, undefined, 'DELETE')).status, 200)
      await absent(repair.id)
      assert.equal(await prisma.warrantyClaimExpense.count({ where: { claimId: claim.id } }), 0)
      assert.equal(await balance(), 100000)
      console.log(`PASS historical ${status}, refunds, corrections, warranty, history`)
    }
    const multi = await create(10000)
    for (let i = 0; i < 3; i++) assert.equal((await request(`/repairs/${multi.id}/payments`, { requestId: randomUUID(), confirmed: true, amount: 5000, method: 'CASH' })).status, 201)
    assert.equal((await request(`/repairs/${multi.id}`, undefined, 'DELETE')).status, 200)
    await absent(multi.id)
    assert.equal(await balance(), 100000)

    const legacy = await create()
    const historicCash = await prisma.cashMovement.create({ data: { businessId, type: 'INCOME', amount: 4000, method: 'CASH', description: 'Synthetic old unclassified receipt', createdAt: new Date('2025-01-01T12:00:00Z') } })
    await prisma.payment.create({ data: { businessId, repairId: legacy.id, clientId: client.body.id, amount: 4000, method: 'CASH', cashMovementId: historicCash.id } })
    const legacyExpense = await prisma.cashMovement.create({ data: { businessId, type: 'EXPENSE', amount: 2500, method: 'CASH', description: 'Synthetic old unclassified cost' } })
    await prisma.repair.update({ where: { id: legacy.id }, data: { paid: 4000, initialCostMovementId: legacyExpense.id } })
    const sharing = await create()
    await prisma.repair.update({ where: { id: sharing.id }, data: { initialCostMovementId: historicCash.id } })
    assert.equal((await request(`/repairs/${legacy.id}`, undefined, 'DELETE')).status, 409, 'Shared receipt prevents any deletion')
    assert.ok(await prisma.cashMovement.findUnique({ where: { id: historicCash.id } }))
    await prisma.repair.update({ where: { id: sharing.id }, data: { initialCostMovementId: null } })
    assert.equal((await request(`/repairs/${legacy.id}`, undefined, 'DELETE')).status, 200)
    assert.equal(await prisma.cashMovement.count({ where: { id: { in: [historicCash.id, legacyExpense.id] } } }), 0, 'Exclusive linked cash is deleted even without repairId')
    const historicalReport = await request('/reports/overview?period=custom&from=2025-01-01&to=2025-01-31')
    assert.equal(historicalReport.status, 200)
    assert.equal(historicalReport.body.finance.collected, 0)
    assert.equal((await request(`/repairs/${sharing.id}`, undefined, 'DELETE')).status, 200)
    assert.equal(await balance(), 100000)
    console.log('PASS exclusive legacy cash without repairId, old report periods and shared-reference protection')

    // Permission to delete is sufficient even without finance/cash-write privileges.
    const technician = await prisma.user.create({ data: { businessId, name: 'Synthetic deleter', email: `delete-tech-${randomUUID()}@example.com`, passwordHash: 'unused synthetic hash', role: 'TECHNICIAN', permissions: [] } })
    const techToken = jwt.sign({ userId: technician.id, businessId, role: 'TECHNICIAN', tokenVersion: technician.tokenVersion }, process.env.JWT_SECRET!, { expiresIn: '1h' })
    const restricted = await create(15000, 5000)
    assert.equal((await request(`/repairs/${restricted.id}`, undefined, 'DELETE', techToken)).status, 403)
    assert.ok(await prisma.repair.findUnique({ where: { id: restricted.id } }))
    await prisma.user.update({ where: { id: technician.id }, data: { permissions: ['repairs.delete'] } })
    assert.equal((await request(`/repairs/${restricted.id}`, undefined, 'DELETE', techToken)).status, 200)
    await absent(restricted.id)
    assert.equal(await balance(), 100000)

    const stockRepair = await create()
    const category = await prisma.commerceCategory.create({ data: { businessId, name: 'Synthetic independent commerce' } })
    const product = await prisma.commerceProduct.create({ data: { businessId, name: 'Synthetic commerce product', category: category.name, purchaseCost: 100, salePrice: 300, currentStock: 7 } })
    const sale = await prisma.commerceSale.create({ data: { businessId, total: 600, costOfGoodsSold: 200, profit: 400, paymentMethod: 'CASH', cancelledAt: new Date() } })
    await prisma.commerceSaleLine.create({ data: { saleId: sale.id, productId: product.id, productName: product.name, quantity: 2, unitCost: 100, unitPrice: 300, lineTotal: 600, lineCost: 200, lineProfit: 400 } })
    await prisma.cashMovement.create({ data: { businessId, type: 'INCOME', origin: 'COMMERCE', commerceSaleId: sale.id, amount: 600, method: 'CASH', description: 'Synthetic independent sale' } })
    await prisma.cashMovement.create({ data: { businessId, type: 'EXPENSE', origin: 'COMMERCE', relatedCommerceSaleId: sale.id, amount: 600, method: 'CASH', description: 'Synthetic independent sale reversal' } })
    const commerceSnapshot = async () => ({
      products: await prisma.commerceProduct.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
      categories: await prisma.commerceCategory.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
      sales: await prisma.commerceSale.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
      lines: await prisma.commerceSaleLine.findMany({ where: { sale: { businessId } }, orderBy: { id: 'asc' } }),
      movements: await prisma.cashMovement.findMany({ where: { businessId, origin: 'COMMERCE' }, orderBy: { id: 'asc' } }),
    })
    const commerceBefore = await commerceSnapshot()
    const stock = await prisma.stockItem.create({ data: { businessId, name: 'Synthetic part', category: 'screen', quantity: 7 } })
    await prisma.repairPart.create({ data: { repairId: stockRepair.id, stockItemId: stock.id, quantity: 3, unitCost: 100, unitPrice: 200, itemNameSnapshot: stock.name } })
    await prisma.inventoryMovement.create({ data: { businessId, repairId: stockRepair.id, stockItemId: stock.id, type: 'REPAIR_USAGE', quantity: 3, unitCost: 100, totalCost: 300, previousStock: 10, newStock: 7, createdByUserId: userId } })
    const later = await prisma.inventoryMovement.create({ data: { businessId, stockItemId: stock.id, type: 'PURCHASE', quantity: 2, unitCost: 100, totalCost: 200, previousStock: 7, newStock: 9, createdByUserId: userId, createdAt: new Date(Date.now() + 1000) } })
    await prisma.stockItem.update({ where: { id: stock.id }, data: { quantity: 9 } })
    const stockBefore = await prisma.stockItem.findUniqueOrThrow({ where: { id: stock.id } })
    assert.equal((await request(`/repairs/${stockRepair.id}`, undefined, 'DELETE')).status, 200)
    await absent(stockRepair.id)
    assert.deepEqual(await prisma.stockItem.findUniqueOrThrow({ where: { id: stock.id } }), stockBefore, 'Deletion never restores or updates legacy stock')
    assert.deepEqual(await prisma.inventoryMovement.findUnique({ where: { id: later.id } }), later, 'Unrelated operations retain every original field')
    assert.deepEqual(await commerceSnapshot(), commerceBefore, 'Commerce stock, products, sales, categories, sale lines and movements remain byte-for-byte unchanged')
    const legacyPartRepair = await create()
    await prisma.repairPart.create({ data: { repairId: legacyPartRepair.id, stockItemId: stock.id, quantity: 2, unitCost: 100, unitPrice: 200, itemNameSnapshot: stock.name } })
    assert.equal((await request(`/repairs/${legacyPartRepair.id}`, undefined, 'DELETE')).status, 200)
    await absent(legacyPartRepair.id)
    assert.deepEqual(await prisma.stockItem.findUniqueOrThrow({ where: { id: stock.id } }), stockBefore, 'Legacy part-only links never return stock either')
    assert.deepEqual(await commerceSnapshot(), commerceBefore)
    assert.equal(await balance(), 100000)
    console.log('PASS no stock restitution; exclusive legacy links removed; all Commerce data and unrelated inventory movements preserved')

    const rollback = await create(5000, 2000)
    const before = await prisma.repair.findUniqueOrThrow({ where: { id: rollback.id } })
    const moneyBefore = await prisma.cashMovement.findMany({ where: { repairId: rollback.id }, orderBy: { id: 'asc' } })
    const { deleteRepairInTransaction } = await import('../src/modules/repairs/repair-delete')
    await assert.rejects(prisma.$transaction(async tx => {
      await deleteRepairInTransaction(tx, businessId, rollback.id)
      throw new Error('Synthetic failure after all deletes')
    }), /Synthetic failure/)
    assert.deepEqual(await prisma.repair.findUniqueOrThrow({ where: { id: rollback.id } }), before)
    assert.deepEqual(await prisma.cashMovement.findMany({ where: { repairId: rollback.id }, orderBy: { id: 'asc' } }), moneyBefore)
    assert.equal(await prisma.payment.count({ where: { repairId: rollback.id } }), 1)
    assert.equal((await request(`/repairs/${rollback.id}`, undefined, 'DELETE')).status, 200)

    // Exercise the exact photo-removal migration guard against synthetic old data.
    const migration = readFileSync(resolve(__dirname, '../prisma/migrations/20261012120000_remove_unused_repair_photos/migration.sql'), 'utf8')
    const guard = migration.slice(migration.indexOf('DO $$'), migration.indexOf('DROP TABLE')).trim()
    await prisma.$executeRawUnsafe('CREATE SCHEMA photo_removal_guard_test')
    try {
      await prisma.$executeRawUnsafe('CREATE TABLE photo_removal_guard_test."RepairPhoto" ("id" TEXT)')
      await prisma.$executeRawUnsafe('INSERT INTO photo_removal_guard_test."RepairPhoto" VALUES (\'synthetic-preserved-photo\')')
      await assert.rejects(prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET LOCAL search_path = photo_removal_guard_test')
        await tx.$executeRawUnsafe(guard)
        await tx.$executeRawUnsafe('DROP TABLE "RepairPhoto"')
      }), /RepairPhoto is not empty/)
      assert.equal((await prisma.$queryRawUnsafe<any[]>('SELECT * FROM photo_removal_guard_test."RepairPhoto"')).length, 1)
      await prisma.$executeRawUnsafe('DELETE FROM photo_removal_guard_test."RepairPhoto"')
      await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET LOCAL search_path = photo_removal_guard_test')
        await tx.$executeRawUnsafe(guard)
        await tx.$executeRawUnsafe('DROP TABLE "RepairPhoto"')
      })
      console.log('PASS photo migration: populated legacy table protected; empty table removable')
    } finally { await prisma.$executeRawUnsafe('DROP SCHEMA photo_removal_guard_test') }

    const other = await register()
    assert.equal(other.status, 201)
    const isolated = await create(5000)
    assert.equal((await request(`/repairs/${isolated.id}`, undefined, 'DELETE', other.body.token)).status, 404)
    assert.ok(await prisma.repair.findUnique({ where: { id: isolated.id } }))
    const malformed = await prisma.cashMovement.create({ data: { businessId: other.body.user.business.id, repairId: isolated.id, type: 'INCOME', amount: 7, description: 'Synthetic invalid tenant reference' } })
    assert.equal((await request(`/repairs/${isolated.id}`, undefined, 'DELETE')).status, 409)
    assert.equal(await prisma.payment.count({ where: { repairId: isolated.id } }), 1, 'Conflict rolls back all deletion')
    await prisma.cashMovement.delete({ where: { id: malformed.id } })
    assert.equal((await request(`/repairs/${isolated.id}`, undefined, 'DELETE')).status, 200)

    const racing = await create()
    const concurrent = await Promise.all([request(`/repairs/${racing.id}`, undefined, 'DELETE'), request(`/repairs/${racing.id}`, undefined, 'DELETE'), request(`/repairs/${racing.id}/payments`, { requestId: randomUUID(), confirmed: true, amount: 5000, method: 'CASH' })])
    assert.deepEqual(concurrent.slice(0, 2).map(r => r.status).sort(), [200, 404])
    assert.ok([201, 404, 409].includes(concurrent[2].status))
    await absent(racing.id)
    assert.equal(await balance(), 100000)
    const purchaseRace = await create()
    const purchaseResults = await Promise.all([
      request(`/repairs/${purchaseRace.id}`, undefined, 'DELETE'),
      request(`/repairs/${purchaseRace.id}/initial-cost`, { amount: 2000, method: 'CASH' }, 'PATCH'),
    ])
    assert.equal(purchaseResults[0].status, 200)
    assert.ok([200, 404].includes(purchaseResults[1].status))
    await absent(purchaseRace.id)
    assert.equal(await balance(), 100000)
    assert.ok(await prisma.client.findUnique({ where: { id: client.body.id } }))
    assert.ok(await prisma.user.findUnique({ where: { id: userId } }))
    for (const path of ['/cash/movements?period=ALL', '/cash/movements?period=ALL&origin=REPAIR&groupByRepair=true', '/dashboard/overview', '/reports/overview?period=this_month']) assert.equal((await request(path)).status, 200, path)
    console.log('PASS multiple payments, cancellation disabled, tenant isolation, atomic rollback, concurrent delete/payment and duplicate deletion')
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

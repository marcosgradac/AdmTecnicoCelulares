import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { validRegistrationPayload } from './helpers/registration'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.equal(database.hostname, '127.0.0.1')
assert.equal(database.pathname, '/repair_finance_test')
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
  const request = async (path: string, body?: object, selectedToken = token, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, { method, headers: { 'content-type': 'application/json', 'X-Turnstile-Token': 'synthetic-test', ...(selectedToken ? { authorization: `Bearer ${selectedToken}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, body: await response.json() as any }
  }
  try {
    const owner = await request('/auth/register', validRegistrationPayload({ firstName: 'Finance', lastName: 'Synthetic', email: `finance-${randomUUID()}@example.com`, password: 'FinanceSynthetic123!', businessName: 'Synthetic finance' }))
    assert.equal(owner.status, 201)
    token = owner.body.token
    const businessId = owner.body.user.business.id
    const client = await request('/clients', { name: 'Synthetic client', phone: '1111111111' })
    assert.equal(client.status, 201)
    const create = async (budget = 0, expense = 0, advance = 0) => {
      const result = await request('/repairs', { clientId: client.body.id, deviceBrand: 'Samsung', deviceModel: 'Synthetic', issue: 'Synthetic diagnosis', total: 100000, partsCost: budget, partsCostMethod: 'TRANSFER', ...(expense ? { initialExpenseAmount: expense, initialExpenseMethod: 'TRANSFER', expenseConfirmed: true } : {}), advanceAmount: advance, ...(advance ? { advanceMethod: 'CASH' } : {}) })
      assert.equal(result.status, 201, JSON.stringify(result.body))
      return result.body
    }
    const movements = (id: string) => prisma.cashMovement.findMany({ where: { businessId, repairId: id }, orderBy: { createdAt: 'asc' } })
    const net = (rows: any[]) => rows.reduce((sum, row) => sum + (row.type === 'INCOME' ? row.amount : -row.amount), 0)
    const budget = await create(30000)
    assert.equal((await movements(budget.id)).length, 0, 'A parts estimate must never create a cash expense')
    if (process.argv.includes('--red')) return

    const cases = [
      { name: 'A', expense: 0, paid: 0, fee: 0, recovery: 0, expected: 0 },
      { name: 'B', expense: 30000, paid: 20000, fee: 20000, recovery: 30000, expected: 20000 },
      { name: 'C', expense: 30000, paid: 20000, fee: 20000, recovery: 0, expected: -10000 },
      { name: 'D', expense: 30000, paid: 20000, fee: 20000, recovery: 10000, expected: 0 },
      { name: 'E', expense: 30000, paid: 0, fee: 0, recovery: 0, expected: -30000 },
      { name: 'F', expense: 0, paid: 20000, fee: 0, recovery: 0, expected: 0 },
    ]
    for (const scenario of cases) {
      const repair = await create(30000, scenario.expense, scenario.paid)
      const original = await movements(repair.id)
      const expense = original.find(row => row.type === 'EXPENSE')
      const payload = { requestId: randomUUID(), reviewFee: scenario.fee, refundConfirmed: true, refundMethod: 'CASH', expenses: expense ? [{ movementId: expense.id, disposition: scenario.recovery === 30000 ? 'REFUND_FULL' : scenario.recovery ? 'REFUND_PARTIAL' : 'KEEP', ...(scenario.recovery ? { amount: scenario.recovery, method: 'TRANSFER', confirmed: true } : {}), stockDisposition: 'LOST' }] : [] }
      const preview = await request(`/repairs/${repair.id}/cancel-preview`, payload)
      assert.equal(preview.status, 200, JSON.stringify(preview.body))
      assert.equal(preview.body.projectedNet, scenario.expected, `Preview ${scenario.name}`)
      assert.deepEqual(await movements(repair.id), original, 'Preview must not write')
      const cancelled = await request(`/repairs/${repair.id}/cancel`, payload)
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body))
      assert.equal(cancelled.body.status, 'CANCELLED')
      assert.equal(cancelled.body.financialSummary.net, scenario.expected)
      assert.equal(net(await movements(repair.id)), scenario.expected, `Case ${scenario.name}`)
      for (const before of original) assert.deepEqual((await movements(repair.id)).find(row => row.id === before.id), before, 'Original monetary entries remain unchanged')
      const repeat = await request(`/repairs/${repair.id}/cancel`, payload)
      assert.equal(repeat.status, 200, 'Identical retry succeeds without duplicate settlement')
      assert.equal(net(await movements(repair.id)), scenario.expected)
      assert.equal((await request(`/repairs/${repair.id}/cancel`, { ...payload, reviewFee: scenario.fee + 1 })).status, 409)
      assert.equal((await request(`/repairs/${repair.id}`, undefined, token, 'DELETE')).status, 409, 'Even a zero-money cancelled repair retains history')
      console.log(`CASE ${scenario.name}: net ${scenario.expected} PASS`)
    }

    // A phantom historic expense is corrected without receiving a single peso.
    const historical = await create(70000, 0, 20000)
    await prisma.repair.update({ where: { id: historical.id }, data: { financeVersion: null } } as any)
    const oldDate = new Date(Date.now() - 60 * 86400000)
    const phantom = await prisma.cashMovement.create({ data: { businessId, repairId: historical.id, type: 'EXPENSE', origin: 'REPAIR', amount: 70000, description: 'Historic automatic estimate', createdAt: oldDate } })
    await assert.rejects(() => prisma.cashMovement.create({ data: { businessId, repairId: historical.id, type: 'EXPENSE', origin: 'REPAIR', amount: -1, accountingOnly: true, relatedMovementId: phantom.id, reason: 'Synthetic missing classification', description: 'Invalid unclassified adjustment' } }), /constraint|check/i)
    const correctionPayload = { requestId: randomUUID(), reviewFee: 20000, expenses: [{ movementId: phantom.id, disposition: 'NOT_PURCHASED', confirmed: true, reason: 'Synthetic evidence: no purchase ever occurred' }] }
    const correction = await request(`/repairs/${historical.id}/cancel`, correctionPayload)
    assert.equal(correction.status, 200, JSON.stringify(correction.body))
    const correctedRows = await movements(historical.id)
    assert.equal(correctedRows.filter(row => row.type === 'INCOME').reduce((s, row) => s + row.amount, 0), 20000, 'No invented supplier income')
    assert.equal(net(correctedRows), 20000)
    assert.deepEqual(correctedRows.find(row => row.id === phantom.id), phantom)
    const adjustment = correctedRows.find(row => (row as any).accountingOnly) as any
    assert.equal(adjustment.amount, -70000)
    assert.equal(adjustment.type, 'EXPENSE')
    assert.equal(adjustment.method, null)
    assert.equal(adjustment.relatedMovementId, phantom.id)
    assert.ok(adjustment.createdAt > oldDate)
    const financialReport = await request('/reports/overview?period=this_month')
    assert.equal(financialReport.status, 200)
    const cash = await request('/cash/movements?origin=REPAIR&groupByRepair=true&period=MONTH&pageSize=100')
    assert.equal(cash.status, 200)
    const historicGroup = cash.body.items.find((row: any) => row.repairId === historical.id)
    assert.equal(historicGroup.status, 'CANCELLED')
    assert.equal(historicGroup.net, 90000, 'Current period contains only current income and explicit correction; old outflow date is untouched')

    const unconfirmed = await create(30000, 30000)
    const outflow = (await movements(unconfirmed.id))[0]
    assert.equal((await request(`/repairs/${unconfirmed.id}/cancel`, { requestId: randomUUID(), reviewFee: 0, expenses: [{ movementId: outflow.id, disposition: 'REFUND_FULL', method: 'TRANSFER' }] })).status, 400)
    assert.equal((await prisma.repair.findUnique({ where: { id: unconfirmed.id } }))?.status, 'RECEIVED')
    assert.equal((await movements(unconfirmed.id)).length, 1)
    assert.equal((await request(`/repairs/${unconfirmed.id}/cancel`, { requestId: randomUUID(), reviewFee: 0, expenses: [] })).status, 409, 'Every expense needs an explicit disposition')

    const owe = await create(0, 0, 10000)
    const pending = await request(`/repairs/${owe.id}/cancel`, { requestId: randomUUID(), reviewFee: 20000, expenses: [] })
    assert.equal(pending.status, 200)
    assert.equal(pending.body.financialSummary.reviewBalance, 10000)
    assert.equal(net(await movements(owe.id)), 10000)
    const reviewPayload = { requestId: randomUUID(), amount: 5000, method: 'CARD', confirmed: true }
    assert.equal((await request(`/repairs/${owe.id}/cancellation-payment`, reviewPayload)).status, 200)
    assert.equal((await request(`/repairs/${owe.id}/cancellation-payment`, reviewPayload)).status, 200)
    assert.equal(net(await movements(owe.id)), 15000)
    const races = await Promise.all([1, 2].map(() => request(`/repairs/${owe.id}/cancellation-payment`, { requestId: randomUUID(), amount: 5000, method: 'TRANSFER', confirmed: true })))
    assert.equal(races.filter(result => result.status === 200).length, 1)
    assert.equal(net(await movements(owe.id)), 20000)

    const refundOwed = await create(0, 0, 20000)
    const pendingRefund = await request(`/repairs/${refundOwed.id}/cancel`, { requestId: randomUUID(), reviewFee: 0, expenses: [] })
    assert.equal(pendingRefund.status, 200)
    assert.equal(pendingRefund.body.financialSummary.refundBalance, 20000)
    assert.equal(net(await movements(refundOwed.id)), 20000, 'Pending refund is not a real outflow')
    const refundPayload = { requestId: randomUUID(), amount: 20000, method: 'CASH', confirmed: true }
    assert.equal((await request(`/repairs/${refundOwed.id}/cancellation-refund`, refundPayload)).status, 200)
    assert.equal((await request(`/repairs/${refundOwed.id}/cancellation-refund`, refundPayload)).status, 200)
    assert.equal(net(await movements(refundOwed.id)), 0)

    const conserved = await create(30000, 30000)
    const conservedExpense = (await movements(conserved.id))[0]
    const stock = await prisma.stockItem.create({ data: { businessId, name: 'Synthetic retained part', category: 'Repuestos', cost: 30000, salePrice: 40000, quantity: 0 } })
    assert.equal((await request(`/repairs/${conserved.id}/cancel`, { requestId: randomUUID(), reviewFee: 0, expenses: [{ movementId: conservedExpense.id, disposition: 'KEEP', stockDisposition: 'KEPT_FOR_STOCK' }] })).status, 200)
    assert.equal(net(await movements(conserved.id)), -30000)
    assert.equal((await prisma.stockItem.findUnique({ where: { id: stock.id } }))?.quantity, 0)
    assert.equal(await prisma.inventoryMovement.count({ where: { repairId: conserved.id } }), 0)

    const tenant = await request('/auth/register', validRegistrationPayload({ firstName: 'Other', lastName: 'Synthetic', email: `other-${randomUUID()}@example.com`, password: 'FinanceSynthetic123!', businessName: 'Other finance' }), '')
    assert.equal(tenant.status, 201)
    assert.equal((await request(`/repairs/${unconfirmed.id}/cancel-preview`, { requestId: randomUUID(), reviewFee: 0, expenses: [] }, tenant.body.token)).status, 404)
    const wrongExpense = await request(`/repairs/${unconfirmed.id}/cancel`, { requestId: randomUUID(), reviewFee: 0, expenses: [{ movementId: conservedExpense.id, disposition: 'REFUND_FULL', method: 'CASH', confirmed: true }] })
    assert.equal(wrongExpense.status, 400)
    assert.equal((await movements(unconfirmed.id)).length, 1)


    const editEvidence = await create(30000, 30000)
    const beforeBudgetEdit = await movements(editEvidence.id)
    await prisma.repair.update({ where: { id: editEvidence.id }, data: { financeVersion: null } })
    const reportBeforeBudgetEdit = await request('/reports/overview?period=this_month')
    assert.equal((await request('/repairs/' + editEvidence.id + '/edit', { partsCost: 40000 }, token, 'PATCH')).status, 200)
    assert.deepEqual(await movements(editEvidence.id), beforeBudgetEdit)
    const reportAfterBudgetEdit = await request('/reports/overview?period=this_month')
    assert.equal(reportAfterBudgetEdit.body.finance.partsCost, reportBeforeBudgetEdit.body.finance.partsCost)
    assert.equal(reportAfterBudgetEdit.body.finance.estimatedProfit, reportBeforeBudgetEdit.body.finance.estimatedProfit)
    assert.equal((await request('/repairs/' + editEvidence.id + '/initial-cost', { amount: 0 }, token, 'PATCH')).status, 409)
    // The server detects a changed preview before recording any settlement.
    const stale = await create(30000, 30000)
    const staleExpense = (await movements(stale.id))[0]
    const staleInput = { requestId: randomUUID(), reviewFee: 0, expenses: [{ movementId: staleExpense.id, disposition: 'KEEP', stockDisposition: 'LOST' }] }
    const stalePreview = await request('/repairs/' + stale.id + '/cancel-preview', staleInput)
    const paymentInput = { requestId: randomUUID(), amount: 10000, method: 'CARD', confirmed: true }
    assert.equal((await request('/repairs/' + stale.id + '/payments', paymentInput)).status, 201)
    assert.equal((await request('/repairs/' + stale.id + '/payments', paymentInput)).status, 201)
    assert.equal((await movements(stale.id)).filter(row => row.type === 'INCOME').length, 1)
    assert.equal((await request('/repairs/' + stale.id + '/cancel', { ...staleInput, expectedVersion: stalePreview.body.version })).status, 409)
    assert.equal((await prisma.repair.findUniqueOrThrow({ where: { id: stale.id } })).status, 'RECEIVED')
    assert.equal((await request('/repairs/' + stale.id + '/payments', { ...paymentInput, amount: 10001 })).status, 409)

    // Ordinary payment and cancellation share the same row lock; no stale paid snapshot.
    for (let index = 0; index < 4; index++) {
      const concurrent = await create()
      const results = await Promise.all([
        request('/repairs/' + concurrent.id + '/payments', { requestId: randomUUID(), amount: 20000, method: 'CASH', confirmed: true }),
        request('/repairs/' + concurrent.id + '/cancel', { requestId: randomUUID(), reviewFee: 20000, expenses: [] }),
      ])
      assert.equal(results[1].status, 200)
      assert.ok([201, 409].includes(results[0].status))
      const state = await prisma.repair.findUniqueOrThrow({ where: { id: concurrent.id } })
      assert.equal(state.cancellationPaidAmount, state.paid)
      assert.equal(state.paid, results[0].status === 201 ? 20000 : 0)
    }

    const refundRace = await create(30000, 30000)
    const refundOriginal = (await movements(refundRace.id))[0]
    const operation = { requestId: randomUUID(), kind: 'SUPPLIER_REFUND', movementId: refundOriginal.id, amount: 10000, method: 'TRANSFER', confirmed: true }
    for (const response of await Promise.all([1, 2].map(() => request('/repairs/' + refundRace.id + '/financial-operations', operation)))) assert.equal(response.status, 200)
    assert.equal(net(await movements(refundRace.id)), -20000)
    assert.equal((await request('/repairs/' + refundRace.id + '/financial-operations', { ...operation, requestId: randomUUID(), amount: 20001 })).status, 400)
    assert.equal((await request('/repairs/' + refundRace.id + '/financial-operations', { ...operation, requestId: randomUUID(), kind: 'EXPENSE_CORRECTION', amount: 20000, reason: 'No purchase ever existed' })).status, 409)
    assert.equal((await request('/repairs/' + refundRace.id + '/financial-operations', { ...operation, requestId: randomUUID(), amount: 20000 })).status, 200)
    assert.equal(net(await movements(refundRace.id)), 0)
    assert.equal((await request('/repairs/' + refundRace.id + '/financial-operations', { ...operation, requestId: randomUUID(), amount: 1 })).status, 400)


    // Later compensation cannot change a prior period's monetary ledger or recognized cost.
    const dated = await create(30000, 30000)
    const datedExpense = (await movements(dated.id))[0]
    await prisma.repair.update({ where: { id: dated.id }, data: { createdAt: oldDate } })
    await prisma.cashMovement.update({ where: { id: datedExpense.id }, data: { createdAt: oldDate } })
    const oldFrom = oldDate.getUTCFullYear() + '-' + String(oldDate.getUTCMonth() + 1).padStart(2, '0') + '-01'
    const oldTo = oldDate.getUTCFullYear() + '-' + String(oldDate.getUTCMonth() + 1).padStart(2, '0') + '-' + new Date(Date.UTC(oldDate.getUTCFullYear(), oldDate.getUTCMonth() + 1, 0)).getUTCDate()
    const historicPath = '/reports/overview?period=custom&from=' + oldFrom + '&to=' + oldTo
    const historicBefore = await request(historicPath)
    assert.equal((await request('/repairs/' + dated.id + '/cancel', { requestId: randomUUID(), reviewFee: 0, expenses: [{ movementId: datedExpense.id, disposition: 'REFUND_FULL', confirmed: true, method: 'TRANSFER' }] })).status, 200)
    const historicAfter = await request(historicPath)
    for (const field of ['billed', 'partsCost', 'estimatedProfit', 'cashBalance', 'balance']) assert.equal(historicAfter.body.finance[field], historicBefore.body.finance[field], 'Historic ' + field + ' is not changed by a later refund')
    // A reused cancellation UUID cannot cancel another zero-money repair.
    const once = await create(), twice = await create(), onceInput = { requestId: randomUUID(), reviewFee: 0, expenses: [] }
    assert.equal((await request('/repairs/' + once.id + '/cancel', onceInput)).status, 200)
    assert.equal((await request('/repairs/' + twice.id + '/cancel', onceInput)).status, 409)

    // Ambiguous historic receipts must be reconciled explicitly, never rebuilt.
    const ambiguous = await create()
    await prisma.repair.update({ where: { id: ambiguous.id }, data: { paid: 10000 } })
    assert.equal((await request('/repairs/' + ambiguous.id + '/cancel', { requestId: randomUUID(), reviewFee: 10000, expenses: [] })).status, 409)
    assert.equal((await movements(ambiguous.id)).length, 0)

    // Failed history write rolls back refund, cancellation and all other writes.
    const atomic = await create(30000, 30000, 20000)
    const atomicOriginal = await movements(atomic.id)
    await prisma.$executeRawUnsafe("CREATE FUNCTION finance_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic history failure'; END $$")
    await prisma.$executeRawUnsafe('CREATE TRIGGER finance_test_failure BEFORE INSERT ON "RepairStatusHistory" FOR EACH ROW EXECUTE FUNCTION finance_test_failure()')
    try {
      assert.equal((await request('/repairs/' + atomic.id + '/cancel', { requestId: randomUUID(), reviewFee: 0, refundConfirmed: true, refundMethod: 'CASH', expenses: [{ movementId: atomicOriginal.find(row => row.type === 'EXPENSE')!.id, disposition: 'REFUND_FULL', method: 'TRANSFER', confirmed: true }] })).status, 500)
      assert.deepEqual(await movements(atomic.id), atomicOriginal)
      assert.equal((await prisma.repair.findUniqueOrThrow({ where: { id: atomic.id } })).status, 'RECEIVED')
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER finance_test_failure ON "RepairStatusHistory"')
      await prisma.$executeRawUnsafe('DROP FUNCTION finance_test_failure()')
    }
    const summary = await request('/cash/movements?period=MONTH')
    const reports = await request('/reports/overview?period=this_month')
    assert.equal(summary.status, 200)
    assert.equal(reports.status, 200)
    assert.equal(summary.body.summary.balance, reports.body.finance.balance)
    assert.equal(summary.body.summary.cashBalance, reports.body.finance.cashBalance)
    assert.equal(historicGroup.cashNet, 20000)
    assert.equal(historicGroup.accountingAdjustment, 70000)
    console.log('FINANCIAL CANCELLATION PASS: estimates, A–F, corrections without cash, periods, confirmations, stock, retries, concurrent collection, pending refunds, tenant boundaries')
  } finally {
    globalThis.fetch = nativeFetch
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

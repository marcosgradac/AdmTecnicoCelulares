import 'dotenv/config'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const url = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Local PostgreSQL only')
assert.ok(url.pathname.endsWith('_test'), 'Dedicated test database required')
assert.notEqual(process.env.NODE_ENV, 'production')

process.env.NODE_ENV = 'test'
process.env.MAIL_MODE = 'fake'
process.env.JWT_SECRET = randomBytes(32).toString('hex')
const prisma = new PrismaClient()
const email = 'landing-demo@local.test'
const password = randomBytes(24).toString('base64url')
const businesses: string[] = []
let ownsLanding = false
const run = (extra: Record<string, string> = {}) => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [require.resolve('tsx/cli'), 'src/scripts/load-business-demo.ts'], {
      env: { ...process.env, NODE_ENV: 'test', DEMO_PROFILE: 'landing', DEMO_USER_EMAIL: '',
        LANDING_DEMO_PASSWORD: password, DEMO_ALLOW_PRODUCTION: '', DOTENV_CONFIG_QUIET: 'true', ...extra },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    child.on('error', reject)
    child.on('close', code => resolve({ code, output }))
})
async function snapshot() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename`
  const result: Record<string, unknown> = {}
  for (const { tablename } of tables) {
    const quoted = '"' + tablename.replace(/"/g, '""') + '"'
    result[tablename] = await prisma.$queryRawUnsafe(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS rows FROM ${quoted} t`)
  }
  return result
}
async function cleanup(id: string) {
  await prisma.$transaction(async tx => {
    await tx.warrantyClaimExpense.deleteMany({ where: { businessId: id } })
    await tx.repairPart.deleteMany({ where: { repair: { businessId: id } } })
    await tx.inventoryMovement.deleteMany({ where: { businessId: id } })
    await tx.warrantyClaim.deleteMany({ where: { businessId: id } })
    await tx.cashMovement.deleteMany({ where: { businessId: id } })
    await tx.payment.deleteMany({ where: { businessId: id } })
    await tx.repairStatusHistory.deleteMany({ where: { repair: { businessId: id } } })
    await tx.repair.deleteMany({ where: { businessId: id } })
    await tx.device.deleteMany({ where: { businessId: id } })
    await tx.client.deleteMany({ where: { businessId: id } })
    await tx.commerceSaleLine.deleteMany({ where: { sale: { businessId: id } } })
    await tx.commerceSale.deleteMany({ where: { businessId: id } })
    await tx.commerceProduct.deleteMany({ where: { businessId: id } })
    await tx.commerceCategory.deleteMany({ where: { businessId: id } })
    await tx.resaleDevice.deleteMany({ where: { businessId: id } })
    await tx.stockItem.deleteMany({ where: { businessId: id } })
    await tx.subscription.deleteMany({ where: { businessId: id } })
    await tx.user.deleteMany({ where: { businessId: id } })
    await tx.business.delete({ where: { id } })
  })
}
async function main() {
  assert.equal(await prisma.user.count({ where: { email } }), 0, 'Use a fresh test DB; never overwrite an existing visual demo')
  ownsLanding = true
  const other = await prisma.business.create({ data: { name: 'Unrelated tenant ' + randomUUID(),
    users: { create: { name: 'Unrelated owner', email: randomUUID() + '@example.invalid', passwordHash: 'not-login-capable', role: 'OWNER' } },
    clients: { create: { name: 'Untouched client', notes: 'isolation sentinel' } },
    cashMovements: { create: { type: 'INCOME', amount: 12345, description: 'Sentinel' } },
    commerceProducts: { create: { name: 'Sentinel product', category: 'Sentinel', purchaseCost: 100, salePrice: 200, currentStock: 10 } },
  } })
  businesses.push(other.id)
  const before = await snapshot()
  for (const extra of [
    { NODE_ENV: 'production', DEMO_ALLOW_PRODUCTION: 'true' },
    { DATABASE_URL: 'postgresql://nobody:unused@remote.example.invalid/demo_test', DEMO_ALLOW_PRODUCTION: 'true' },
    { LANDING_DEMO_PASSWORD: '' }, { LANDING_DEMO_PASSWORD: 'short' }, { DEMO_USER_EMAIL: 'different@example.invalid' },
  ]) {
    const blocked = await run(extra)
    assert.notEqual(blocked.code, 0); assert.ok(!blocked.output.includes(password))
    if (extra.DATABASE_URL) assert.match(blocked.output, /LOCAL-ONLY/, 'Reject remote input before connecting')
    assert.deepEqual(await snapshot(), before)
  }
  // A real database failure mid-seed, without a failure hook in product code.
  const trigger = 'landing_fail_' + randomBytes(8).toString('hex')
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'artificial landing fixture failure'; END $$`)
  try {
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "CommerceSale" FOR EACH ROW EXECUTE FUNCTION "${trigger}"()`)
    assert.notEqual((await run()).code, 0)
    assert.deepEqual(await snapshot(), before, 'Mid-seed failure rolls back account, data, ledgers and counters')
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "CommerceSale"`)
    await prisma.$executeRawUnsafe(`DROP FUNCTION "${trigger}"()`)
  }
  const concurrent = await Promise.all([run(), run()])
  for (const r of concurrent) assert.equal(r.code, 0, r.output)
  assert.equal(concurrent.filter(r => r.output.includes('"mode": "created"')).length, 1)
  assert.equal(concurrent.filter(r => r.output.includes('"mode": "existing"')).length, 1)
  const result = JSON.parse(concurrent.find(r => r.output.includes('"mode": "created"'))!.output)
  const owner = await prisma.user.findUniqueOrThrow({ where: { email }, include: { business: true } })
  const businessId = owner.businessId
  assert.equal(owner.business.name, 'TecnoFix Demo'); assert.equal(owner.role, 'OWNER'); assert.equal(owner.platformRole, 'USER')
  assert.ok(await bcrypt.compare(password, owner.passwordHash))
  const clients = await prisma.client.findMany({ where: { businessId } })
  const devices = await prisma.device.findMany({ where: { businessId } })
  const repairs = await prisma.repair.findMany({ where: { businessId }, include: { payments: true, parts: true, statusHistory: { orderBy: { createdAt: 'asc' } } } })
  const cash = await prisma.cashMovement.findMany({ where: { businessId } })
  const users = await prisma.user.findMany({ where: { businessId } })
  assert.deepEqual([clients.length, devices.length, repairs.length, users.filter(u => u.role === 'TECHNICIAN').length], [32, 40, 50, 3])
  assert.ok(clients.every(c => c.name.endsWith('(DEMO)') && (!c.email || c.email.endsWith('@example.invalid')) && (!c.phone || c.phone.startsWith('000-000-')) && !c.whatsapp))
  assert.ok(devices.every(d => !d.imei && clients.some(c => c.id === d.clientId && +c.createdAt <= +d.createdAt)))
  assert.equal(new Set(repairs.map(r => r.status)).size, 11)
  assert.ok(clients.some(c => repairs.filter(r => r.clientId === c.id).length > 1))
  assert.equal(new Set(repairs.map(r => r.number)).size, 50)
  assert.equal(owner.business.lastRepairNumber, Math.max(...repairs.map(r => r.number)))
  assert.equal(repairs.filter(r => r.warrantyEnabled).length, 10)
  assert.ok(repairs.some(r => r.warrantyEnabled && !r.warrantyStartedAt))
  assert.ok(repairs.some(r => r.warrantyExpiresAt && +r.warrantyExpiresAt < Date.now()))
  assert.ok(repairs.some(r => r.warrantyExpiresAt && +r.warrantyExpiresAt > Date.now() && +r.warrantyExpiresAt < Date.now() + 7 * 86400000))
  assert.ok(repairs.filter(r => r.trackingEnabled && r.trackingToken).length >= 5)
  for (const r of repairs) {
    if (r.estimatedDeliveryDate) assert.ok(+r.estimatedDeliveryDate >= +r.createdAt, 'Estimated delivery cannot precede intake')
    assert.equal(devices.find(d => d.id === r.deviceId)!.clientId, r.clientId)
    assert.ok(+devices.find(d => d.id === r.deviceId)!.createdAt <= +r.createdAt)
    assert.equal(r.paid, r.payments.filter(p => !p.cancellationReview).reduce((n, p) => n + p.amount, 0))
    const income = cash.filter(c => c.repairId === r.id && c.type === 'INCOME')
    assert.equal(income.length, r.payments.length, 'One cash income per payment')
    assert.equal(income.reduce((n, c) => n + c.amount, 0), r.payments.reduce((n, p) => n + p.amount, 0))
    for (const p of r.payments) {
      assert.equal(p.businessId, businessId); assert.equal(p.clientId, r.clientId)
      assert.ok(income.some(c => c.amount === p.amount && c.method === p.method && +c.createdAt === +p.createdAt))
      assert.ok(+p.createdAt >= +r.createdAt && +p.createdAt <= Date.now())
      if (r.deliveredAt) assert.ok(+p.createdAt <= +r.deliveredAt, 'Original repair payment precedes delivery, not its later warranty claim')
    }
    assert.equal(r.partsCost, r.parts.reduce((n, p) => n + p.quantity * p.unitCost, 0))
    assert.equal(r.statusHistory.at(-1)?.newStatus, r.status)
    for (let i = 0; i < r.statusHistory.length; i++) {
      assert.equal(r.statusHistory[i].previousStatus, i ? r.statusHistory[i - 1].newStatus : null)
      assert.ok(+r.statusHistory[i].createdAt >= +r.createdAt && +r.statusHistory[i].createdAt <= Date.now())
    }
    if (r.status === 'DELIVERED' || r.status === 'WARRANTY') assert.equal(r.paid, r.total)
    if (r.status === 'CANCELLED') {
      assert.equal(r.cancellationPaidAmount, r.paid); assert.equal(r.cancellationRefundAmount, Math.max(0, r.paid - r.cancellationReviewFee!))
      assert.equal(r.trackingEnabled, false)
      if (r.cancellationRefundAmount) assert.equal(cash.find(c => c.id === r.cancellationRefundMovementId)?.amount, r.cancellationRefundAmount)
    }
  }
  assert.ok(repairs.some(r => r.payments.length > 1) && repairs.some(r => r.paid === 0) && repairs.some(r => r.paid > 0 && r.paid < r.total))
  assert.deepEqual([...new Set(repairs.flatMap(r => r.payments.map(p => p.method)))].sort(), ['CARD', 'CASH', 'OTHER', 'TRANSFER'])
  assert.deepEqual([...new Set(cash.map(c => c.origin))].sort(), ['COMMERCE', 'EQUIPMENT', 'GENERAL', 'REPAIR'])
  assert.ok(cash.every(c => c.amount > 0 && +c.createdAt <= Date.now()))
  const claims = await prisma.warrantyClaim.findMany({ where: { businessId }, include: { expenses: { include: { cashMovement: true } } } })
  assert.deepEqual(claims.map(c => c.status).sort(), ['IN_REVIEW', 'OPEN', 'REJECTED', 'RESOLVED'])
  assert.ok(claims.filter(c => c.expenses.length).length >= 2)
  for (const c of claims) {
    const r = repairs.find(r => r.id === c.repairId)!
    assert.deepEqual(c.coveredWarrantyStartedAt, r.warrantyStartedAt); assert.deepEqual(c.coveredWarrantyExpiresAt, r.warrantyExpiresAt)
    assert.equal(c.coveredWarrantyDurationDays, r.warrantyDurationDays)
    assert.equal(Boolean(c.resolvedAt), ['RESOLVED', 'REJECTED'].includes(c.status))
    for (const e of c.expenses) {
      assert.equal(e.businessId, businessId); assert.equal(e.cashMovement.businessId, businessId); assert.equal(e.cashMovement.repairId, r.id)
      assert.equal(e.cashMovement.type, 'EXPENSE'); assert.equal(e.cashMovement.origin, 'REPAIR')
      assert.ok(e.idempotencyKey && e.cashMovement.amount > 0 && e.cashMovement.method)
      assert.ok(+e.createdAt >= +c.createdAt && +e.createdAt <= +c.updatedAt)
    }
  }
  const stock = await prisma.stockItem.findMany({ where: { businessId }, include: { repairParts: true, movements: { orderBy: { createdAt: 'asc' } } } })
  assert.equal(stock.length, 18)
  for (const s of stock) {
    let quantity = 0
    for (const m of s.movements) {
      assert.equal(m.businessId, businessId); assert.equal(m.previousStock, quantity)
      quantity += m.type === 'REPAIR_USAGE' ? -m.quantity : m.quantity
      assert.equal(m.newStock, quantity); assert.equal(m.totalCost, m.quantity * m.unitCost); assert.ok(quantity >= 0)
      if (m.repairId) assert.ok(repairs.some(r => r.id === m.repairId))
    }
    assert.equal(s.quantity, quantity)
    assert.equal(s.repairParts.reduce((n, p) => n + p.quantity, 0), s.movements.filter(m => m.type === 'REPAIR_USAGE').reduce((n, m) => n + m.quantity, 0))
  }
  const categories = await prisma.commerceCategory.findMany({ where: { businessId } })
  const products = await prisma.commerceProduct.findMany({ where: { businessId } })
  const sales = await prisma.commerceSale.findMany({ where: { businessId }, include: { lines: true } })
  assert.deepEqual([categories.length, products.length, sales.length], [5, 28, 15])
  assert.ok(categories.every(c => ['charger', 'cable', 'case', 'screen-protector', 'earbuds'].includes(c.iconKey!)))
  assert.ok(products.some(p => p.currentStock === 0) && products.some(p => p.currentStock >= 20))
  // Hand-checked closing stock catches omitted decrements or double cancellation restocks.
  for (const [name, closing] of [['Cargador USB-C 20 W', 18], ['Base de carga inalámbrica', 3], ['Funda transparente Samsung A15', 11], ['Cable USB-C reforzado 1 m', 30]] as const) {
    assert.equal(products.find(p => p.name === name)?.currentStock, closing)
  }
  assert.equal(sales.filter(s => s.cancelledAt).length, 1)
  for (const s of sales) {
    assert.equal(s.total, s.lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0))
    assert.equal(s.costOfGoodsSold, s.lines.reduce((n, l) => n + l.unitCost * l.quantity, 0)); assert.equal(s.profit, s.total - s.costOfGoodsSold)
    for (const l of s.lines) {
      assert.ok(products.some(p => p.id === l.productId)); assert.equal(l.lineTotal, l.quantity * l.unitPrice)
      assert.equal(l.lineCost, l.quantity * l.unitCost); assert.equal(l.lineProfit, l.lineTotal - l.lineCost)
    }
    const income = cash.filter(c => c.commerceSaleId === s.id)
    assert.equal(income.length, 1); assert.equal(income[0].amount, s.total); assert.equal(income[0].origin, 'COMMERCE'); assert.equal(income[0].type, 'INCOME')
    const reversal = cash.filter(c => c.relatedCommerceSaleId === s.id)
    assert.equal(reversal.length, s.cancelledAt ? 1 : 0)
    if (s.cancelledAt) { assert.equal(reversal[0].amount, s.total); assert.equal(reversal[0].method, s.paymentMethod); assert.equal(reversal[0].type, 'EXPENSE'); assert.equal(reversal[0].commerceSaleId, null) }
  }
  const resale = await prisma.resaleDevice.findMany({ where: { businessId }, include: { cashMovements: true } })
  assert.equal(resale.length, 12)
  for (const state of ['PURCHASED', 'REPAIRING', 'READY_FOR_SALE', 'SOLD']) assert.equal(resale.filter(r => r.status === state).length, 3)
  for (const r of resale) {
    const costs = r.cashMovements.filter(c => c.resaleKind !== 'SALE')
    assert.equal(costs.reduce((n, c) => n + (c.type === 'EXPENSE' ? c.amount : -c.amount), 0), r.purchasePrice + r.repairExpenses)
    assert.ok(costs.every(c => c.businessId === businessId && c.origin === 'EQUIPMENT' && c.resaleVersion === 0))
    const income = r.cashMovements.filter(c => c.resaleKind === 'SALE')
    assert.equal(income.length, r.status === 'SOLD' ? 1 : 0)
    if (r.status === 'SOLD') {
      assert.equal(r.saleCostBasis, r.purchasePrice + r.repairExpenses); assert.equal(income[0].amount, r.actualSalePrice)
      assert.equal(income[0].method, r.salePaymentMethod); assert.equal(income[0].resaleVersion, r.version)
      assert.ok(+r.soldAt! >= +r.createdAt && +r.soldAt! <= +income[0].createdAt)
    } else assert.equal(r.saleCostBasis, null)
  }
  assert.equal(new Set(users.filter(u => u.role === 'TECHNICIAN').map(u => JSON.stringify(u.permissions))).size, 3)
  const seeded = await snapshot(), replay = await run({ LANDING_DEMO_PASSWORD: 'Different-local-only-password' })
  assert.equal(replay.code, 0, replay.output); assert.match(replay.output, /"mode": "existing"/)
  assert.deepEqual(await snapshot(), seeded, 'Second execution preserves every row, timestamp, credential and counter')
  const { app } = await import('../src/server')
  const { prisma: apiPrisma } = await import('../src/lib/prisma')
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const root = `http://127.0.0.1:${address.port}/api`
  try {
    const login = await fetch(root + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
    assert.equal(login.status, 200)
    const { token } = await login.json() as { token: string }
    const get = async (path: string) => { const r = await fetch(root + path, { headers: { authorization: `Bearer ${token}` } }); assert.equal(r.status, 200, path); return r.json() as Promise<any> }
    for (const period of ['today', '7d', '30d', 'month']) {
      const d = await get('/dashboard/overview?period=' + period)
      assert.ok(d.financial.income > 0 && d.financial.expense > 0 && d.financial.balance !== 0)
      const rows = cash.filter(c => +c.createdAt >= +new Date(d.period.start) && +c.createdAt < +new Date(d.period.end))
      assert.equal(d.financial.income, rows.filter(c => c.type === 'INCOME').reduce((n, c) => n + c.amount, 0))
      assert.equal(d.financial.expense, rows.filter(c => c.type === 'EXPENSE').reduce((n, c) => n + c.amount, 0))
      assert.ok(d.current.activeRepairs > 0 && d.current.readyRepairs > 0 && d.current.pending > 0)
      assert.ok(d.charts.cashFlow.length && d.activity.length && d.modules.commerce.sales > 0 && d.modules.equipment.sales > 0 && d.modules.repairs.received > 0)
      console.log(`DASHBOARD ${period}: income=${d.financial.income}, expense=${d.financial.expense}, balance=${d.financial.balance}`)
    }
    const recommended = repairs.find(r => `/seguimiento/${r.trackingToken}` === result.recommendedTrackingPath)!
    assert.ok(recommended && recommended.deviceModel === 'Galaxy A54' && ['REPAIRING', 'TESTING'].includes(recommended.status))
    const trackingResponse = await fetch(root + '/tracking/' + recommended.trackingToken)
    assert.equal(trackingResponse.status, 200)
    const trackingText = await trackingResponse.text(); assert.ok(!trackingText.includes(password) && !trackingText.includes(owner.email))
    for (const path of ['/clients', '/repairs', '/cash/movements', '/warranties', '/commerce/products', '/equipment-sales', '/team']) await get(path)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await apiPrisma.$disconnect()
  }
  await cleanup(businessId)
  assert.deepEqual(await snapshot(), before, 'Unrelated tenant and shared tables stay untouched')
  console.log('LANDING DEMO PASSED: guards, ledgers, relations, stock, privacy, HTTP dashboards/tracking, isolation, concurrency, idempotence and rollback')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  try {
    if (ownsLanding) { const owner = await prisma.user.findUnique({ where: { email } }); if (owner) await cleanup(owner.businessId) }
    for (const id of businesses) await cleanup(id)
  } finally { await prisma.$disconnect() }
})

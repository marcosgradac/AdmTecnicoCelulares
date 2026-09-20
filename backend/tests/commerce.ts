import 'dotenv/config'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'

process.env.NODE_ENV = 'test'
// This integration suite exercises more writes than a human session in one minute.
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '200'

async function main() {
  const { app } = await import('../src/server')
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const suffix = `${Date.now()}`
  const businessIds: string[] = []
  const request = async (method: string, path: string, body: object | undefined, token: string) => {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, body: await response.json() as any }
  }
  const prepareSale = async (body: { lines: Array<{ productId: string; quantity: number; expectedUnitPrice?: number }>; paymentMethod: string; expectedTotal?: number; idempotencyKey?: string }) => {
    const products = await prisma.commerceProduct.findMany({ where: { id: { in: body.lines.map(line => line.productId) } } })
    const lines = body.lines.map(line => ({ ...line, expectedUnitPrice: line.expectedUnitPrice ?? products.find(product => product.id === line.productId)!.salePrice }))
    return { ...body, lines, expectedTotal: body.expectedTotal ?? lines.reduce((total, line) => total + line.quantity * line.expectedUnitPrice, 0), idempotencyKey: body.idempotencyKey ?? randomUUID() }
  }
  const postSale = async (body: Parameters<typeof prepareSale>[0], token: string) => request('POST', '/commerce/sales', await prepareSale(body), token)
  const createTenant = async (planCode: 'INITIAL' | 'PROFESSIONAL' | 'COMPLETE') => {
    const now = new Date()
    const business = await prisma.business.create({ data: { name: `Commerce ${planCode} ${suffix}` } })
    const user = await prisma.user.create({ data: { businessId: business.id, name: 'Commerce Owner', firstName: 'Commerce', lastName: 'Owner', email: `commerce-${planCode}-${suffix}@example.com`, passwordHash: 'test', role: 'OWNER' } })
    await prisma.subscription.create({ data: { businessId: business.id, planCode, status: 'ACTIVE', trialStartedAt: now, trialEndsAt: new Date(now.getTime() - 86_400_000), trialConsumedAt: now, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000), accessExpiresAt: new Date(now.getTime() + 30 * 86_400_000) } })
    businessIds.push(business.id)
    return jwt.sign({ userId: user.id, businessId: business.id, role: user.role, platformRole: user.platformRole, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET!)
  }
  try {
    const completeToken = await createTenant('COMPLETE')
    const initialToken = await createTenant('INITIAL')
    const professionalToken = await createTenant('PROFESSIONAL')
    const category = await request('POST', '/commerce/categories', { name: 'Accesorios de prueba' }, completeToken)
    assert.equal(category.status, 201)
    assert.equal((await request('GET', '/commerce/categories', undefined, completeToken)).body[0].name, 'Accesorios de prueba')
    const product = await request('POST', '/commerce/products', { name: 'Cable de prueba', category: category.body.name, purchaseCost: 1000, salePrice: 2500, currentStock: 5 }, completeToken)
    assert.equal(product.status, 201)
    const validInput = await prepareSale({ lines: [{ productId: product.body.id, quantity: 1 }], paymentMethod: 'CASH' })
    for (const missing of ['idempotencyKey', 'expectedTotal', 'expectedUnitPrice']) {
      const invalid: any = structuredClone(validInput)
      if (missing === 'expectedUnitPrice') delete invalid.lines[0].expectedUnitPrice
      else delete invalid[missing]
      assert.equal((await request('POST', '/commerce/sales', invalid, completeToken)).status, 400, `${missing} is mandatory`)
    }
    const sale = await postSale( { lines: [{ productId: product.body.id, quantity: 2 }], paymentMethod: 'CASH' }, completeToken)
    assert.equal(sale.status, 201)
    assert.equal(sale.body.total, 5000)
    assert.equal(sale.body.costOfGoodsSold, 2000)
    assert.equal(sale.body.profit, 3000)
    const updated = await prisma.commerceProduct.findUniqueOrThrow({ where: { id: product.body.id } })
    assert.equal(updated.currentStock, 3)
    const cash = await prisma.cashMovement.findFirstOrThrow({ where: { commerceSaleId: sale.body.id } })
    assert.equal(cash.origin, 'COMMERCE')
    assert.equal((await request('GET', '/commerce/products', undefined, completeToken)).body.items[0].lowStock, undefined)
    for (const origin of ['REPAIR', 'EQUIPMENT']) {
      const movement = await request('POST', '/cash/movements', { type: 'EXPENSE', description: 'Egreso de prueba', amount: 100, origin }, completeToken)
      assert.equal(movement.status, 201)
      assert.equal(movement.body.origin, origin, 'manual movements retain their structured origin')
      const filtered = await request('GET', `/cash/movements?origin=${origin}`, undefined, completeToken)
      assert.equal(filtered.body.total, 1)
      assert.equal(filtered.body.summary.incomeToday, 0, 'commerce sales do not enter other cash views')
    }
    assert.equal((await request('GET', '/cash/movements?origin=COMMERCE', undefined, completeToken)).body.total, 1)
    assert.equal((await request('GET', '/cash/movements', undefined, completeToken)).body.total, 3)
    for (const token of [initialToken, professionalToken]) {
      for (const path of ['/commerce/products', '/commerce/sales', '/commerce/summary', '/commerce/categories', '/cash/movements?origin=COMMERCE']) {
        assert.equal((await request('GET', path, undefined, token)).status, 403, path)
      }
      assert.equal((await request('POST', '/cash/movements', { type: 'INCOME', origin: 'COMMERCE', description: 'Intento de acceso', amount: 100 }, token)).status, 403)
    }
    const beforeFailedSale = await prisma.commerceSale.count({ where: { businessId: businessIds[0] } })
    assert.equal((await postSale( { lines: [{ productId: product.body.id, quantity: 4 }], paymentMethod: 'CASH' }, completeToken)).status, 409)
    assert.equal(await prisma.commerceSale.count({ where: { businessId: businessIds[0] } }), beforeFailedSale)
    assert.equal((await prisma.commerceProduct.findUniqueOrThrow({ where: { id: product.body.id } })).currentStock, 3)
    const staff = await prisma.user.create({ data: { businessId: businessIds[0], name: 'Vendedor', firstName: 'Vendedor', lastName: 'Prueba', email: `commerce-staff-${suffix}@example.com`, passwordHash: 'test', role: 'TECHNICIAN', permissions: ['commerce.view', 'commerce.sell'] } })
    const staffToken = jwt.sign({ userId: staff.id, businessId: staff.businessId, role: staff.role, platformRole: staff.platformRole, tokenVersion: staff.tokenVersion }, process.env.JWT_SECRET!)
    const legacyStaff = await prisma.user.create({ data: { businessId: businessIds[0], name: 'Técnico antiguo', email: `commerce-legacy-${suffix}@example.com`, passwordHash: 'test', role: 'TECHNICIAN' } })
    const legacyToken = jwt.sign({ userId: legacyStaff.id, businessId: legacyStaff.businessId, role: legacyStaff.role, platformRole: legacyStaff.platformRole, tokenVersion: legacyStaff.tokenVersion }, process.env.JWT_SECRET!)
    for (const permissions of [null, []]) {
      if (permissions) await prisma.user.update({ where: { id: legacyStaff.id }, data: { permissions } })
      assert.equal((await request('GET', '/commerce/products', undefined, legacyToken)).status, 403)
      assert.equal((await postSale(validInput, legacyToken)).status, 403)
      assert.equal((await request('POST', '/commerce/products', { name: 'Bloqueado' }, legacyToken)).status, 403)
    }
    const entitlements = await request('GET', '/billing/entitlements', undefined, staffToken)
    assert.equal(entitlements.status, 200)
    assert.equal(entitlements.body.commerce, true)
    assert.equal((await request('GET', '/billing/subscription', undefined, staffToken)).status, 403)
    assert.equal((await request('GET', '/commerce/products', undefined, staffToken)).status, 200)
    assert.equal((await request('POST', '/commerce/products', { name: 'No permitido' }, staffToken)).status, 403)
    await prisma.subscription.update({ where: { businessId: businessIds[1] }, data: { planCode: 'COMPLETE' } })
    assert.equal((await request('GET', '/commerce/products', undefined, initialToken)).body.total, 0)
    assert.equal((await postSale( { lines: [{ productId: product.body.id, quantity: 1 }], paymentMethod: 'CASH' }, initialToken)).status, 404)
    await prisma.subscription.update({ where: { businessId: businessIds[1] }, data: { planCode: 'INITIAL' } })
    const competingSales = await Promise.all([1, 2].map(() => postSale( { lines: [{ productId: product.body.id, quantity: 2 }], paymentMethod: 'CARD' }, staffToken)))
    assert.deepEqual(competingSales.map(result => result.status).sort(), [201, 409])
    assert.equal((await prisma.commerceProduct.findUniqueOrThrow({ where: { id: product.body.id } })).currentStock, 1)
    assert.equal((await request('GET', '/commerce/summary', undefined, completeToken)).body.lowStock, undefined)
    assert.equal((await postSale( { lines: [{ productId: product.body.id, quantity: 1 }, { productId: product.body.id, quantity: 1 }], paymentMethod: 'CASH' }, completeToken)).status, 409)
    assert.equal((await postSale( { lines: [{ productId: product.body.id, quantity: 0 }], paymentMethod: 'CASH' }, completeToken)).status, 400)
    assert.equal((await request('GET', '/commerce/products?pageSize=101', undefined, completeToken)).status, 400)
    assert.equal((await request('GET', '/commerce/products?inStock=invalid', undefined, completeToken)).status, 400)
    const staleEdit = { name: product.body.name, category: product.body.category, purchaseCost: 1000, salePrice: 2500, currentStock: 5, expectedStock: 5 }
    assert.equal((await request('PATCH', `/commerce/products/${product.body.id}`, staleEdit, completeToken)).status, 409, 'editing an old form must not restore sold stock')
    assert.equal((await prisma.commerceProduct.findUniqueOrThrow({ where: { id: product.body.id } })).currentStock, 1)
    assert.equal((await request('PATCH', `/commerce/products/${product.body.id}`, { ...staleEdit, expectedStock: 1, currentStock: 1 }, completeToken)).status, 200)
    const secondProduct = await request('POST', '/commerce/products', { name: 'Funda de prueba', category: category.body.name, purchaseCost: 2000, salePrice: 3000, currentStock: 2 }, completeToken)
    assert.equal(secondProduct.status, 201)
    const wrongTotal = await postSale( { lines: [{ productId: secondProduct.body.id, quantity: 1 }], paymentMethod: 'CASH', expectedTotal: 2500 }, completeToken)
    assert.equal(wrongTotal.status, 409, 'a stale displayed total must never be silently charged')
    assert.equal((await prisma.commerceProduct.findUniqueOrThrow({ where: { id: secondProduct.body.id } })).currentStock, 2)
    const multiSale = await postSale( { lines: [{ productId: product.body.id, quantity: 1 }, { productId: secondProduct.body.id, quantity: 1 }], paymentMethod: 'TRANSFER' }, completeToken)
    assert.equal(multiSale.status, 201)
    assert.equal(multiSale.body.lines.length, 2)
    assert.equal(multiSale.body.total, 5500)
    assert.equal(multiSale.body.costOfGoodsSold, 3000)
    assert.equal(multiSale.body.profit, 2500)
    const saleCount = await prisma.commerceSale.count({ where: { businessId: businessIds[0] } })
    assert.equal((await postSale( { lines: [{ productId: secondProduct.body.id, quantity: 1 }, { productId: product.body.id, quantity: 1 }], paymentMethod: 'CASH' }, completeToken)).status, 409)
    assert.equal((await prisma.commerceProduct.findUniqueOrThrow({ where: { id: secondProduct.body.id } })).currentStock, 1)
    assert.equal(await prisma.commerceSale.count({ where: { businessId: businessIds[0] } }), saleCount)
    await prisma.commerceProduct.createMany({ data: Array.from({ length: 23 }, () => ({ businessId: businessIds[0], name: 'Producto paginado', category: category.body.name, purchaseCost: 1, salePrice: 2, currentStock: 10 })) })
    const firstPage = await request('GET', '/commerce/products?page=1&pageSize=20', undefined, completeToken)
    const secondPage = await request('GET', '/commerce/products?page=2&pageSize=20', undefined, completeToken)
    assert.equal(firstPage.body.items.length, 20)
    assert.equal(secondPage.body.items.length, 5)
    assert.equal(new Set([...firstPage.body.items, ...secondPage.body.items].map(item => item.id)).size, 25)
    assert.equal((await request('GET', '/commerce/products?search=PAGINADO', undefined, completeToken)).body.total, 23)
    const retryProduct = await prisma.commerceProduct.create({ data: { businessId: businessIds[0], name: 'Idempotencia', category: category.body.name, purchaseCost: 100, salePrice: 200, currentStock: 20 } })
    const retryInput = await prepareSale({ lines: [{ productId: retryProduct.id, quantity: 2 }], paymentMethod: 'CASH' })
    const results = await Promise.all([1, 2, 3].map(() => request('POST', '/commerce/sales', retryInput, completeToken)))
    assert.ok(results.every(result => result.status === 201), JSON.stringify(results))
    assert.equal(new Set(results.map(result => result.body.id)).size, 1, 'same key returns the same sale under concurrent requests')
    const retrySaleId = results[0].body.id
    assert.equal((await prisma.commerceProduct.findUniqueOrThrow({ where: { id: retryProduct.id } })).currentStock, 18)
    assert.equal(await prisma.commerceSale.count({ where: { businessId: businessIds[0], lines: { some: { productId: retryProduct.id } } } }), 1)
    assert.equal(await prisma.cashMovement.count({ where: { commerceSaleId: retrySaleId } }), 1)
    await prisma.commerceProduct.update({ where: { id: retryProduct.id }, data: { currentStock: 0, salePrice: 300 } })
    const replay = await request('POST', '/commerce/sales', retryInput, completeToken)
    assert.equal(replay.status, 201, 'replay succeeds even when stock and price have changed')
    assert.equal(replay.body.id, retrySaleId)
    assert.equal(replay.body.total, 400)
    assert.equal((await request('POST', '/commerce/sales', { ...retryInput, paymentMethod: 'CARD' }, completeToken)).status, 409, 'key cannot be reused for another payload')
    assert.equal(await prisma.cashMovement.count({ where: { commerceSaleId: retrySaleId } }), 1)
    assert.equal((await prisma.commerceProduct.findUniqueOrThrow({ where: { id: retryProduct.id } })).currentStock, 0)
    await prisma.subscription.update({ where: { businessId: businessIds[1] }, data: { planCode: 'COMPLETE' } })
    assert.equal((await request('POST', '/commerce/sales', retryInput, initialToken)).status, 404, 'same key cannot reveal another business sale')
    const otherProduct = await prisma.commerceProduct.create({ data: { businessId: businessIds[1], name: 'Otro negocio', category: 'Test', purchaseCost: 100, salePrice: 200, currentStock: 5 } })
    const otherSale = await postSale({ ...retryInput, lines: [{ productId: otherProduct.id, quantity: 2 }] }, initialToken)
    assert.equal(otherSale.status, 201, 'same key is permitted for a different business')
    assert.notEqual(otherSale.body.id, retrySaleId)
    await prisma.subscription.update({ where: { businessId: businessIds[1] }, data: { planCode: 'INITIAL' } })
    const priceProducts = await Promise.all([200, 300].map(salePrice => prisma.commerceProduct.create({ data: { businessId: businessIds[0], name: 'Cambio compensado', category: 'Test', purchaseCost: 100, salePrice, currentStock: 5 } })))
    const stalePrices = await prepareSale({ lines: priceProducts.map(product => ({ productId: product.id, quantity: 1 })), paymentMethod: 'CASH' })
    await prisma.commerceProduct.update({ where: { id: priceProducts[0].id }, data: { salePrice: 250 } })
    await prisma.commerceProduct.update({ where: { id: priceProducts[1].id }, data: { salePrice: 250 } })
    const beforePrices = { sales: await prisma.commerceSale.count(), cash: await prisma.cashMovement.count() }
    assert.equal((await request('POST', '/commerce/sales', stalePrices, completeToken)).status, 409, 'unit price changes are rejected even with an unchanged total')
    assert.equal(await prisma.commerceSale.count(), beforePrices.sales)
    assert.equal(await prisma.cashMovement.count(), beforePrices.cash)
    assert.ok((await prisma.commerceProduct.findMany({ where: { id: { in: priceProducts.map(product => product.id) } } })).every(product => product.currentStock === 5))
    const freshPrices = await prepareSale({ ...stalePrices, lines: priceProducts.map(product => ({ productId: product.id, quantity: 1 })) })
    assert.equal((await request('POST', '/commerce/sales', freshPrices, completeToken)).status, 201, 'a rejected transaction does not consume its key')
    assert.equal((await request('GET', '/commerce/products?page=1&pageSize=20', undefined, initialToken)).status, 403)
    assert.equal((await request('POST', '/commerce/products', { name: 'Bloqueado', category: 'Test', purchaseCost: 1, salePrice: 2, currentStock: 1 }, initialToken)).status, 403)
    // Product forms no longer require or overwrite the legacy minimum stock column.
    await prisma.commerceProduct.update({ where: { id: product.body.id }, data: { minimumStock: 99 } })
    assert.equal((await request('PATCH', '/commerce/products/' + product.body.id, { ...staleEdit, expectedStock: 0, currentStock: 0 }, completeToken)).status, 200)
    assert.equal((await prisma.commerceProduct.findUniqueOrThrow({ where: { id: product.body.id } })).minimumStock, 99)

    const audio = await request('POST', '/commerce/categories', { name: 'Audio original' }, completeToken)
    await prisma.commerceProduct.createMany({ data: Array.from({ length: 24 }, (_, i) => ({ businessId: businessIds[0], name: 'AuRi prueba ' + i, category: audio.body.name, purchaseCost: 1, salePrice: 2, currentStock: i === 0 ? 0 : 3 })) })
    const hidden = await prisma.commerceProduct.create({ data: { businessId: businessIds[0], name: 'Archivado', category: audio.body.name, purchaseCost: 1, salePrice: 2, currentStock: 3, active: false } })
    const found = await request('GET', '/commerce/products?search=auri&inStock=true&pageSize=20', undefined, completeToken)
    const foundNext = await request('GET', '/commerce/products?search=AURI&inStock=true&pageSize=20&page=2', undefined, completeToken)
    assert.equal(found.body.total, 23)
    assert.equal(found.body.items.length, 20)
    assert.equal(foundNext.body.items.length, 3)
    assert.equal(new Set([...found.body.items, ...foundNext.body.items].map(item => item.id)).size, 23)
    assert.ok(found.body.items.every(item => item.currentStock > 0))
    assert.equal((await request('GET', '/commerce/products?search=sincoincidencias&inStock=true', undefined, completeToken)).body.total, 0)
    assert.equal((await request('GET', '/commerce/products?search=auri&inStock=false', undefined, completeToken)).body.total, 24)
    assert.equal((await request('PATCH', '/commerce/categories/' + audio.body.id, { name: 'Audio nuevo' }, staffToken)).status, 403)
    assert.equal((await request('PATCH', '/commerce/categories/' + audio.body.id, { name: 'A' }, completeToken)).status, 400)
    assert.equal((await request('PATCH', '/commerce/categories/' + audio.body.id, { name: category.body.name }, completeToken)).status, 409)
    assert.equal((await prisma.commerceProduct.findUniqueOrThrow({ where: { id: hidden.id } })).category, audio.body.name)
    const renamed = await request('PATCH', '/commerce/categories/' + audio.body.id, { name: '  Audio nuevo  ' }, completeToken)
    assert.equal(renamed.status, 200)
    assert.equal(renamed.body.name, 'Audio nuevo')
    assert.equal(renamed.body.productCount, 24)
    assert.equal((await prisma.commerceProduct.findUniqueOrThrow({ where: { id: hidden.id } })).category, 'Audio nuevo')
    assert.equal(await prisma.commerceProduct.count({ where: { businessId: businessIds[0], category: audio.body.name } }), 0)
    assert.equal((await request('DELETE', '/commerce/categories/' + audio.body.id, undefined, completeToken)).status, 409)
    const otherCategory = await prisma.commerceCategory.create({ data: { businessId: businessIds[1], name: 'Otro propietario' } })
    assert.equal((await request('PATCH', '/commerce/categories/' + otherCategory.id, { name: 'Intruso' }, completeToken)).status, 404)
    const virtual = await prisma.commerceProduct.create({ data: { businessId: businessIds[0], name: 'Legado', category: 'Categoría antigua', purchaseCost: 1, salePrice: 2, currentStock: 1 } })
    const virtualId = encodeURIComponent('product-category-Categoría antigua')
    assert.equal((await request('PATCH', '/commerce/categories/' + virtualId, { name: 'Categoría recuperada' }, completeToken)).status, 200)
    assert.equal((await prisma.commerceProduct.findUniqueOrThrow({ where: { id: virtual.id } })).category, 'Categoría recuperada')
    assert.equal((await request('PATCH', '/commerce/categories/product-category-Inexistente', { name: 'No crear' }, completeToken)).status, 404)
    console.log('COMMERCE TEST PASSED: acceso por plan, venta atómica, stock, costo, ganancia y caja separada')
  } finally {
    for (const businessId of businessIds) await prisma.$transaction([
      prisma.cashMovement.deleteMany({ where: { businessId } }),
      prisma.commerceSaleLine.deleteMany({ where: { sale: { businessId } } }),
      prisma.commerceSale.deleteMany({ where: { businessId } }),
      prisma.commerceProduct.deleteMany({ where: { businessId } }),
      prisma.commerceCategory.deleteMany({ where: { businessId } }),
      prisma.subscription.deleteMany({ where: { businessId } }),
      prisma.user.deleteMany({ where: { businessId } }),
      prisma.business.deleteMany({ where: { id: businessId } }),
    ])
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })

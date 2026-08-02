import 'dotenv/config'
import assert from 'node:assert/strict'
import { app } from '../src/server'
import { prisma } from '../src/lib/prisma'

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
    const result = await request('POST', '/auth/register', { firstName: 'QA', lastName: label, email: `inventory-${label}-${suffix}@example.com`, password: 'Inventario123', businessName: `Inventory ${label} ${suffix}` })
    assert.equal(result.status, 201)
    businesses.push(result.body.user.business.id)
    return result.body.token as string
  }
  const clean = async () => {
    for (const businessId of businesses) await prisma.$transaction([
      prisma.inventoryMovement.deleteMany({ where: { businessId } }), prisma.repairPart.deleteMany({ where: { repair: { businessId } } }),
      prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId } } }), prisma.repairPhoto.deleteMany({ where: { repair: { businessId } } }),
      prisma.payment.deleteMany({ where: { businessId } }), prisma.cashMovement.deleteMany({ where: { businessId } }), prisma.repair.deleteMany({ where: { businessId } }),
      prisma.device.deleteMany({ where: { businessId } }), prisma.client.deleteMany({ where: { businessId } }), prisma.stockItem.deleteMany({ where: { businessId } }),
      prisma.passwordResetToken.deleteMany({ where: { user: { businessId } } }), prisma.user.deleteMany({ where: { businessId } }), prisma.business.deleteMany({ where: { id: businessId } }),
    ])
  }
  try {
    const tokenA = await register('A'), tokenB = await register('B')
    const created = await request('POST', '/inventory', { sku: 'MOD-TEST', name: 'Módulo prueba', category: 'modulo', brand: 'Apple', compatibleModels: ['iPhone 11'], purchaseCost: 12000, salePrice: 20000, currentStock: 5, minimumStock: 2, notes: 'prueba automatizada' }, tokenA)
    assert.equal(created.status, 201)
    const itemId = created.body.id as string
    let detail = await request('GET', `/inventory/${itemId}`, undefined, tokenA)
    assert.equal(detail.body.currentStock, 5)
    assert.equal(detail.body.movements[0].type, 'initial_stock')
    const repair = await request('POST', '/repairs', { clientName: 'Cliente QA', phone: '5491100000000', deviceBrand: 'Apple', deviceModel: 'iPhone 11', issue: 'Pantalla rota', total: 50000 }, tokenA)
    assert.equal(repair.status, 201)
    const repairId = repair.body.id as string, trackingToken = repair.body.trackingToken as string
    const part = await request('POST', `/repairs/${repairId}/parts`, { inventoryItemId: itemId, quantity: 2 }, tokenA)
    assert.equal(part.status, 201)
    assert.equal(part.body.totalCost, 24000)
    detail = await request('GET', `/inventory/${itemId}`, undefined, tokenA)
    assert.equal(detail.body.currentStock, 3)
    assert.equal(detail.body.movements[0].type, 'repair_usage')
    assert.equal((await request('GET', `/repairs/${repairId}`, undefined, tokenA)).body.partsCost, 24000)
    assert.equal((await request('POST', `/repairs/${repairId}/parts`, { inventoryItemId: itemId, quantity: 4 }, tokenA)).status, 409)
    assert.equal((await request('GET', `/inventory/${itemId}`, undefined, tokenB)).status, 404)
    const itemB = await request('POST', '/inventory', { sku: 'B-ONLY', name: 'Batería B', category: 'bateria', compatibleModels: [], purchaseCost: 1000, currentStock: 2, minimumStock: 1 }, tokenB)
    assert.equal(itemB.status, 201)
    assert.equal((await request('POST', `/repairs/${repairId}/parts`, { inventoryItemId: itemB.body.id, quantity: 1 }, tokenB)).status, 404)
    assert.equal((await request('DELETE', `/repairs/${repairId}/parts/${part.body.id}`, undefined, tokenA)).status, 200)
    detail = await request('GET', `/inventory/${itemId}`, undefined, tokenA)
    assert.equal(detail.body.currentStock, 5)
    assert.equal(detail.body.movements[0].type, 'cancelled_repair_return')
    assert.equal((await request('GET', `/repairs/${repairId}`, undefined, tokenA)).body.partsCost, 0)
    const publicTracking = await request('GET', `/tracking/${trackingToken}`)
    assert.equal(publicTracking.status, 200)
    const publicJson = JSON.stringify(publicTracking.body)
    assert.ok(!publicJson.includes('partsCost') && !publicJson.includes('unitCost') && !publicJson.includes('repairParts'))
    console.log('INVENTORY TESTS PASSED: initial stock, usage, costs, return, insufficient stock, isolation and public privacy')
  } finally {
    await clean()
    await prisma.$disconnect()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })

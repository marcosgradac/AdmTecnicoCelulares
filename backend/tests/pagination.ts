import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { app } from '../src/server'
import { prisma } from '../src/lib/prisma'
import { validRegistrationPayload } from './helpers/registration'

async function main() {
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`, suffix = Date.now(), businesses: string[] = []
  const request = async (method: string, path: string, body?: object, token?: string) => { const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: response.status, body: await response.json() as any } }
  const register = async (label: string) => { const password = `Qa-${randomBytes(12).toString('base64url')}9!`; const result = await request('POST', '/auth/register', validRegistrationPayload({ firstName: 'QA', lastName: label, email: `pagination-${label}-${suffix}@example.com`, password, businessName: `Pagination ${label}` })); assert.equal(result.status, 201); businesses.push(result.body.user.business.id); return result.body.token as string }
  try {
    const tokenA = await register('A'), tokenB = await register('B')
    for (let index = 1; index <= 12; index++) { const client = (await request('POST', '/clients', { name: `Cliente QA ${String(index).padStart(2, '0')}`, phone: `1155500${String(index).padStart(3, '0')}` }, tokenA)).body; assert.equal((await request('POST', '/repairs', { clientId: client.id, deviceBrand: index === 12 ? 'MarcaBuscable' : 'Motorola', deviceModel: `Modelo ${index}`, imei: `IMEI-${index}`, issue: `Falla QA ${index}`, total: index * 1000 }, tokenA)).status, 201) }
    const foreign = (await request('POST', '/clients', { name: 'Cliente ajeno', phone: '1199999999' }, tokenB)).body
    assert.equal((await request('POST', '/repairs', { clientId: foreign.id, deviceBrand: 'MarcaBuscable', deviceModel: 'Ajeno', issue: 'No visible', total: 1 }, tokenB)).status, 201)
    const clientsFirst = await request('GET', '/clients?paginated=true&page=1&pageSize=10', undefined, tokenA); assert.equal(clientsFirst.status, 200); assert.equal(clientsFirst.body.items.length, 10); assert.equal(clientsFirst.body.total, 12); assert.equal(clientsFirst.body.totalPages, 2)
    const clientsSecond = await request('GET', '/clients?paginated=true&page=2&pageSize=10', undefined, tokenA); assert.equal(clientsSecond.body.items.length, 2)
    const repairsFirst = await request('GET', '/repairs?page=1&pageSize=10', undefined, tokenA); assert.equal(repairsFirst.body.items.length, 10); assert.equal(repairsFirst.body.total, 12); assert.equal(repairsFirst.body.pages, 2)
    const searched = await request('GET', '/repairs?page=1&pageSize=10&search=MarcaBuscable', undefined, tokenA); assert.equal(searched.body.items.length, 1); assert.equal(searched.body.items[0].deviceBrand, 'MarcaBuscable')
    assert.ok(!clientsFirst.body.items.some((client: { id: string }) => client.id === foreign.id)); assert.ok(!repairsFirst.body.items.some((repair: { clientId: string }) => repair.clientId === foreign.id))
    console.log('PAGINATION TESTS PASSED: 12 records, page size 10, search and tenant isolation')
  } finally {
    for (const businessId of businesses) await prisma.$transaction([prisma.repairStatusHistory.deleteMany({ where: { repair: { businessId } } }), prisma.repairPhoto.deleteMany({ where: { repair: { businessId } } }), prisma.payment.deleteMany({ where: { businessId } }), prisma.cashMovement.deleteMany({ where: { businessId } }), prisma.repair.deleteMany({ where: { businessId } }), prisma.device.deleteMany({ where: { businessId } }), prisma.client.deleteMany({ where: { businessId } }), prisma.passwordResetToken.deleteMany({ where: { user: { businessId } } }), prisma.subscription.deleteMany({ where: { businessId } }), prisma.user.deleteMany({ where: { businessId } }), prisma.business.deleteMany({ where: { id: businessId } })])
    await prisma.$disconnect(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

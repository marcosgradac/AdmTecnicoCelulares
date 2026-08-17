import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { app } from '../src/server'
import { prisma } from '../src/lib/prisma'

async function main() {
  const server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve)); const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${(address as any).port}/api`, suffix = Date.now(), businesses: string[] = []
  const request = async (method: string, path: string, body?: object, token?: string) => { const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'content-type':'application/json' } : {}), ...(token ? { authorization:`Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); const text = await response.text(); return { status:response.status, body:text ? JSON.parse(text) : null } }
  const register = async (label: string) => { const password = `Qa-${randomBytes(12).toString('base64url')}9!`; const result = await request('POST','/auth/register',{firstName:'Pago',lastName:label,email:`pay-${label}-${suffix}@example.com`,password,businessName:`Pay ${label}`}); assert.equal(result.status,201); businesses.push(result.body.user.business.id); return { token:result.body.token as string, businessId:result.body.user.business.id as string } }

  try {
    const owner = await register('A')
    const client = (await request('POST','/clients',{name:'Cliente pago',phone:'3333333333'},owner.token)).body
    const repairRes = await request('POST','/repairs',{deviceBrand:'Nokia',deviceModel:'Test',issue:'Test pago',total:5000,clientId:client.id},owner.token)
    assert.equal(repairRes.status,201)
    const repair = repairRes.body

    // valid payment
    const pay = await request('POST',`/repairs/${repair.id}/payments`,{amount:1000,method:'CASH'},owner.token)
    assert.equal(pay.status,201)
    assert.equal(await prisma.payment.count({where:{repairId:repair.id}}),1)
    const updated = await prisma.repair.findUnique({where:{id:repair.id}})
    assert.equal(updated?.paid,1000)
    assert.equal(await prisma.cashMovement.count({where:{repairId:repair.id}}),1)

    // invalid amounts
    assert.equal((await request('POST',`/repairs/${repair.id}/payments`,{amount:0,method:'CASH'},owner.token)).status,400)
    assert.equal((await request('POST',`/repairs/${repair.id}/payments`,{amount:-100,method:'CASH'},owner.token)).status,400)

    // duplicate submission: two concurrent requests that would overpay only one should succeed
    const p1 = request('POST',`/repairs/${repair.id}/payments`,{amount:4500,method:'CASH'},owner.token)
    const p2 = request('POST',`/repairs/${repair.id}/payments`,{amount:4500,method:'CASH'},owner.token)
    const [r1,r2] = await Promise.all([p1,p2])
    // debug: log statuses and bodies
    console.log('concurrent responses', { s1: r1.status, b1: r1.body, s2: r2.status, b2: r2.body })
    // acceptable outcomes:
    // - one 201 and one 409 => total payments 2, final paid 5000
    // - both 409 => no additional payments, total payments remain 1, final paid 1000
    const statuses = [r1.status, r2.status]
    if (statuses.includes(201)) {
      // one succeeded, one failed
      assert.ok(statuses.includes(409))
      assert.equal(await prisma.payment.count({ where: { repairId: repair.id } }), 2)
      const finalRepair = await prisma.repair.findUnique({ where: { id: repair.id } })
      assert.equal(finalRepair?.paid, 5000)
    } else {
      // both failed
      assert.equal(statuses[0], 409)
      assert.equal(statuses[1], 409)
      assert.equal(await prisma.payment.count({ where: { repairId: repair.id } }), 1)
      const finalRepair = await prisma.repair.findUnique({ where: { id: repair.id } })
      assert.equal(finalRepair?.paid, 1000)
    }

    console.log('PAYMENTS FLOW TEST PASSED: payment creation, validations, atomicity and cash movement')
  } finally {
    for (const businessId of businesses) await prisma.$transaction([prisma.payment.deleteMany({where:{businessId}}),prisma.cashMovement.deleteMany({where:{businessId}}),prisma.repair.deleteMany({where:{businessId}}),prisma.device.deleteMany({where:{businessId}}),prisma.client.deleteMany({where:{businessId}}),prisma.passwordResetToken.deleteMany({where:{user:{businessId}}}),prisma.user.deleteMany({where:{businessId}}),prisma.business.deleteMany({where:{id:businessId}})])
    await prisma.$disconnect(); await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
  }
}
main().catch(error=>{ console.error(error); process.exitCode=1 })

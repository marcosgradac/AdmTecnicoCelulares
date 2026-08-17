import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { app } from '../src/server'
import { prisma } from '../src/lib/prisma'

async function main() {
  const server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve)); const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`, suffix = Date.now(), businesses: string[] = []
  const request = async (method: string, path: string, body?: object, token?: string) => { const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'content-type':'application/json' } : {}), ...(token ? { authorization:`Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); const text = await response.text(); return { status:response.status, body:text ? JSON.parse(text) : null } }
  const register = async (label: string) => { const password = `Qa-${randomBytes(12).toString('base64url')}9!`; const result = await request('POST','/auth/register',{firstName:'Garantía',lastName:label,email:`warranty-${label}-${suffix}@example.com`,password,businessName:`Warranty ${label}`}); assert.equal(result.status,201); businesses.push(result.body.user.business.id); return { token:result.body.token as string, businessId:result.body.user.business.id as string } }
  try {
    const ownerA = await register('A'), ownerB = await register('B')
    const clientA = (await request('POST','/clients',{name:'Cliente garantía A',phone:'1111111111'},ownerA.token)).body
    const clientB = (await request('POST','/clients',{name:'Cliente garantía B',phone:'2222222222'},ownerB.token)).body
    const input = { deviceBrand:'Infinix',deviceModel:'Note 40',issue:'No enciende',total:25000,warrantyEnabled:true,warrantyDurationDays:30 }
    const repairA = await request('POST','/repairs',{...input,clientId:clientA.id},ownerA.token); assert.equal(repairA.status,201); assert.equal(repairA.body.warrantyStartedAt,null)
    assert.equal((await request('POST',`/warranties/${repairA.body.id}/claims`,{description:'Falla antes de entrega'},ownerA.token)).status,409)
    const delivered = await request('PATCH',`/repairs/${repairA.body.id}/status`,{status:'DELIVERED'},ownerA.token); assert.equal(delivered.status,200); assert.ok(delivered.body.warrantyStartedAt); assert.ok(delivered.body.warrantyExpiresAt)
    const days = Math.round((new Date(delivered.body.warrantyExpiresAt).getTime()-new Date(delivered.body.warrantyStartedAt).getTime())/86_400_000); assert.equal(days,30)
    const originalStart=delivered.body.warrantyStartedAt
    assert.equal((await request('PATCH',`/warranties/${repairA.body.id}`,{durationDays:60,conditions:'Cobertura QA'},ownerB.token)).status,404)
    const edited=await request('PATCH',`/warranties/${repairA.body.id}`,{durationDays:60,conditions:'Cobertura QA'},ownerA.token);assert.equal(edited.status,200);assert.equal(edited.body.warrantyStartedAt,originalStart);assert.equal(Math.round((new Date(edited.body.warrantyExpiresAt).getTime()-new Date(originalStart).getTime())/86_400_000),60)
    const dashboard = await request('GET','/dashboard/summary',undefined,ownerA.token); assert.equal(dashboard.status,200); assert.equal(dashboard.body.activeWarranties,1); assert.ok(Array.isArray(dashboard.body.cashFlow))
    const isolatedList = await request('GET','/warranties',undefined,ownerB.token); assert.equal(isolatedList.status,200); assert.equal(isolatedList.body.length,0)
    assert.equal((await request('POST',`/warranties/${repairA.body.id}/claims`,{description:'Intento desde otro tenant'},ownerB.token)).status,404)
    const claim = await request('POST',`/warranties/${repairA.body.id}/claims`,{description:'La falla volvió durante una carga normal'},ownerA.token); assert.equal(claim.status,201); assert.equal(claim.body.status,'OPEN')
    assert.equal((await request('PATCH',`/warranties/claims/${claim.body.id}`,{status:'RESOLVED',resolution:'Se ajustó el conector'},ownerB.token)).status,404)
    const resolved = await request('PATCH',`/warranties/claims/${claim.body.id}`,{status:'RESOLVED',resolution:'Se ajustó el conector'},ownerA.token); assert.equal(resolved.status,200); assert.ok(resolved.body.resolvedAt)
    await assert.rejects(() => prisma.repair.delete({where:{id:repairA.body.id}}), error => {
      if (!error) return false
      // Prisma may surface a P2003 or a lower-level Postgres error; accept either
      if (typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 'P2003') return true
      if (error instanceof Error && error.message.includes('violates RESTRICT')) return true
      return false
    })
    assert.equal(await prisma.repair.count({where:{id:repairA.body.id}}),1)
    await prisma.payment.create({data:{businessId:ownerA.businessId,repairId:repairA.body.id,clientId:clientA.id,amount:1000,method:'CASH'}})
    assert.equal((await request('DELETE',`/warranties/${repairA.body.id}`,undefined,ownerB.token)).status,404)
    assert.equal((await request('DELETE',`/warranties/${repairA.body.id}`,undefined,ownerA.token)).status,200)
    assert.equal((await request('GET','/warranties',undefined,ownerA.token)).body.length,0)
    assert.equal((await request('GET',`/repairs/${repairA.body.id}`,undefined,ownerA.token)).status,200)
    assert.equal((await request('GET',`/clients/${clientA.id}`,undefined,ownerA.token)).status,200)
    assert.equal(await prisma.payment.count({where:{repairId:repairA.body.id}}),1)
    assert.ok(await prisma.repairStatusHistory.count({where:{repairId:repairA.body.id}})>0)
    assert.equal(await prisma.warrantyClaim.count({where:{id:claim.body.id,repairId:repairA.body.id}}),1)
    const repairB = await request('POST','/repairs',{...input,clientId:clientB.id,warrantyDurationDays:7},ownerB.token); assert.equal(repairB.status,201)
    await prisma.repair.update({ where:{id:repairB.body.id}, data:{warrantyStartedAt:new Date(Date.now()-10*86_400_000),warrantyExpiresAt:new Date(Date.now()-3*86_400_000)} })
    assert.equal((await request('POST',`/warranties/${repairB.body.id}/claims`,{description:'Reclamo fuera de término'},ownerB.token)).status,409)
    console.log('WARRANTY TESTS PASSED: delivery activation, duration, expiry, soft-delete traceability, RESTRICT integrity and tenant isolation')
  } finally {
    for (const businessId of businesses) await prisma.$transaction([prisma.warrantyClaim.deleteMany({where:{businessId}}),prisma.repairStatusHistory.deleteMany({where:{repair:{businessId}}}),prisma.repairPhoto.deleteMany({where:{repair:{businessId}}}),prisma.payment.deleteMany({where:{businessId}}),prisma.cashMovement.deleteMany({where:{businessId}}),prisma.repair.deleteMany({where:{businessId}}),prisma.device.deleteMany({where:{businessId}}),prisma.client.deleteMany({where:{businessId}}),prisma.passwordResetToken.deleteMany({where:{user:{businessId}}}),prisma.user.deleteMany({where:{businessId}}),prisma.business.deleteMany({where:{id:businessId}})]); await prisma.$disconnect(); await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})

import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { validRegistrationPayload } from './helpers/registration'

process.env.NODE_ENV = 'test'
process.env.RATE_LIMIT_AUTH_WRITES_MAX = '300'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

async function main() {
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')])
  const server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve)); const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`, suffix = Date.now(), businesses: string[] = []
  const request = async (method: string, path: string, body?: object, token?: string) => { const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'content-type':'application/json' } : {}), ...(token ? { authorization:`Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); const text = await response.text(); return { status:response.status, body:text ? (response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text) : null } }
  const register = async (label: string) => { const password = `Qa-${randomBytes(12).toString('base64url')}9!`; const result = await request('POST','/auth/register',validRegistrationPayload({firstName:'Garantía',lastName:label,email:`warranty-${label}-${suffix}@example.com`,password,businessName:`Warranty ${label}`})); assert.equal(result.status,201); businesses.push(result.body.user.business.id); return { token:result.body.token as string, businessId:result.body.user.business.id as string } }
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
    // A warranty expense is one business cost, never a customer payment. Delivery starts a new period.
    const warrantyRepair = await request('POST', '/repairs', { ...input, clientId: clientA.id, warrantyDurationDays: 7 }, ownerA.token)
    await request('PATCH', `/repairs/${warrantyRepair.body.id}/status`, { status: 'DELIVERED' }, ownerA.token)
    const firstStart = new Date(Date.now() - 3 * 86_400_000)
    const firstExpiry = new Date(firstStart.getTime() + 7 * 86_400_000)
    await prisma.repair.update({ where: { id: warrantyRepair.body.id }, data: { warrantyStartedAt: firstStart, warrantyExpiresAt: firstExpiry } })
    const warrantyClaim = await request('POST', `/warranties/${warrantyRepair.body.id}/claims`, { description: 'El módulo instalado dejó de dar imagen' }, ownerA.token)
    const claimPath = `/warranties/claims/${warrantyClaim.body.id}`
    const expenseInput = { concept: 'Módulo nuevo', amount: 20000, method: 'CASH', idempotencyKey: `expense-${suffix}` }
    assert.equal((await request('POST', `${claimPath}/expenses`, expenseInput, ownerB.token)).status, 404)
    const initialExpenses = await Promise.all([request('POST', `${claimPath}/expenses`, expenseInput, ownerA.token), request('POST', `${claimPath}/expenses`, expenseInput, ownerA.token)])
    const expense = initialExpenses[0]
    assert.equal(expense.status, 201, 'registering an expense must create a linked cash movement')
    assert.equal(initialExpenses[1].status, 201)
    assert.equal(initialExpenses[1].body.id, expense.body.id, 'concurrent first submissions create only one expense')
    const retries = await Promise.all([request('POST', `${claimPath}/expenses`, expenseInput, ownerA.token), request('POST', `${claimPath}/expenses`, expenseInput, ownerA.token)])
    for (const retry of retries) { assert.equal(retry.status, 201); assert.equal(retry.body.id, expense.body.id) }
    assert.equal((await request('POST', `${claimPath}/expenses`, { ...expenseInput, amount: 100 }, ownerA.token)).status, 409)
    const movements = await prisma.cashMovement.findMany({ where: { repairId: warrantyRepair.body.id } })
    assert.equal(movements.length, 1)
    assert.equal(movements[0].id, expense.body.cashMovement.id)
    assert.equal(movements[0].type, 'EXPENSE'); assert.equal(movements[0].origin, 'REPAIR')
    assert.equal(movements[0].amount, 20000); assert.equal(movements[0].method, 'CASH')
    assert.equal(await prisma.payment.count({ where: { repairId: warrantyRepair.body.id } }), 0)
    const cash = await request('GET', '/cash/movements?origin=REPAIR', undefined, ownerA.token)
    assert.equal(cash.status, 200)
    assert.equal(cash.body.summary.expenseToday, 20000)
    assert.equal(cash.body.summary.balanceToday, -20000)
    assert.ok(cash.body.items.some((item: any) => item.id === expense.body.cashMovementId))
    const tech = await prisma.user.create({ data: { businessId: ownerA.businessId, name: 'Técnico sin acceso a caja', email: `warranty-tech-${suffix}@example.com`, passwordHash: 'unused', role: 'TECHNICIAN', permissions: ['repairs.view', 'repairs.update'] } })
    const techToken = jwt.sign({ userId: tech.id, businessId: tech.businessId, role: tech.role, platformRole: tech.platformRole, tokenVersion: tech.tokenVersion }, process.env.JWT_SECRET!)
    assert.equal((await request('POST', `${claimPath}/expenses`, { ...expenseInput, idempotencyKey: 'forbidden-expense' }, techToken)).status, 403)
    assert.equal((await request('POST', `${claimPath}/delivery`, { warrantyDurationDays: 7 }, techToken)).status, 403)
    const techList = (await request('GET', '/warranties', undefined, techToken)).body
    assert.deepEqual(techList.find((item: any) => item.id === warrantyRepair.body.id).warrantyClaims[0].expenses, [])
    await prisma.user.update({ where: { id: tech.id }, data: { permissions: ['cash.create'] } })
    assert.equal((await request('POST', `${claimPath}/expenses`, { ...expenseInput, idempotencyKey: 'forbidden-expense' }, techToken)).status, 403)
    assert.equal((await request('POST', `${claimPath}/delivery`, { warrantyDurationDays: 7 }, ownerA.token)).status, 409)
    const resolution = { status: 'RESOLVED', resolution: 'Se reemplazó el módulo fallado por uno nuevo.' }
    assert.equal((await request('PATCH', claimPath, resolution, ownerA.token)).status, 200)
    assert.equal((await request('PATCH', claimPath, resolution, ownerA.token)).status, 200)
    assert.equal((await request('POST', `${claimPath}/delivery`, { warrantyDurationDays: 7 }, ownerB.token)).status, 404)
    const beforeDelivery = Date.now()
    const firstDeliveries = await Promise.all([request('POST', `${claimPath}/delivery`, { warrantyDurationDays: 7 }, ownerA.token), request('POST', `${claimPath}/delivery`, { warrantyDurationDays: 7 }, ownerA.token)])
    const newDelivery = firstDeliveries[0]
    assert.equal(newDelivery.status, 200)
    assert.equal(firstDeliveries[1].status, 200)
    assert.equal(firstDeliveries[1].body.deliveredAt, newDelivery.body.deliveredAt)
    assert.ok(new Date(newDelivery.body.deliveredAt).getTime() >= beforeDelivery)
    assert.equal(newDelivery.body.newWarrantyStartedAt, newDelivery.body.deliveredAt)
    assert.equal(new Date(newDelivery.body.newWarrantyExpiresAt).getTime() - new Date(newDelivery.body.deliveredAt).getTime(), 604800000)
    assert.equal(newDelivery.body.coveredWarrantyStartedAt, firstStart.toISOString())
    assert.equal(newDelivery.body.coveredWarrantyExpiresAt, firstExpiry.toISOString())
    const deliveryRetries = await Promise.all([request('POST', `${claimPath}/delivery`, { warrantyDurationDays: 7 }, ownerA.token), request('POST', `${claimPath}/delivery`, { warrantyDurationDays: 7 }, ownerA.token)])
    deliveryRetries.forEach(result => { assert.equal(result.status, 200); assert.equal(result.body.deliveredAt, newDelivery.body.deliveredAt) })
    assert.equal((await request('POST', `${claimPath}/delivery`, { warrantyDurationDays: 30 }, ownerA.token)).status, 409)
    assert.equal((await request('PATCH', claimPath, { status: 'OPEN' }, ownerA.token)).status, 409)
    assert.equal(await prisma.cashMovement.count({ where: { repairId: warrantyRepair.body.id } }), 1)
    const renewedRepair = (await request('GET', `/repairs/${warrantyRepair.body.id}`, undefined, ownerA.token)).body
    assert.equal(renewedRepair.warrantyStartedAt, newDelivery.body.deliveredAt)
    const rejected = await request('POST', `/warranties/${warrantyRepair.body.id}/claims`, { description: 'Golpe posterior a la entrega' }, ownerA.token)
    const rejectedPath = `/warranties/claims/${rejected.body.id}`
    assert.equal((await request('PATCH', rejectedPath, { status: 'REJECTED', resolution: 'Daño por golpe' }, ownerA.token)).status, 200)
    assert.equal((await request('POST', `${rejectedPath}/expenses`, { ...expenseInput, idempotencyKey: 'rejected-expense' }, ownerA.token)).status, 409)
    assert.equal((await request('POST', `${rejectedPath}/delivery`, { warrantyDurationDays: 7 }, ownerA.token)).status, 409)
    const noWarranty = await request('POST', `/warranties/${warrantyRepair.body.id}/claims`, { description: 'Nueva revisión del conector' }, ownerA.token)
    await request('PATCH', `/warranties/claims/${noWarranty.body.id}`, resolution, ownerA.token)
    assert.equal((await request('POST', `/warranties/claims/${noWarranty.body.id}/delivery`, { warrantyDurationDays: 0 }, ownerA.token)).status, 200)
    const history = (await request('GET', '/warranties', undefined, ownerA.token)).body.find((item: any) => item.id === warrantyRepair.body.id)
    assert.ok(history, 'history remains visible after delivery without a new warranty')
    assert.equal(history.warrantyEnabled, false)
    assert.equal(history.warrantyClaims.length, 3)
    assert.equal(history.warrantyClaims.find((item: any) => item.id === warrantyClaim.body.id).expenses[0].cashMovement.amount, 20000)
    assert.equal((await request('POST', `/warranties/${warrantyRepair.body.id}/claims`, { description: 'Sin cobertura nueva' }, ownerA.token)).status, 404)
    const repairB = await request('POST','/repairs',{...input,clientId:clientB.id,warrantyDurationDays:7},ownerB.token); assert.equal(repairB.status,201)
    await prisma.repair.update({ where:{id:repairB.body.id}, data:{warrantyStartedAt:new Date(Date.now()-10*86_400_000),warrantyExpiresAt:new Date(Date.now()-3*86_400_000)} })
    assert.equal((await request('POST',`/warranties/${repairB.body.id}/claims`,{description:'Reclamo fuera de término'},ownerB.token)).status,409)
    // The initial expense travels with the claim in one atomic request: same cash rules, one movement.
    const initialRepair = await request('POST','/repairs',{...input,clientId:clientA.id,warrantyDurationDays:30},ownerA.token)
    await request('PATCH',`/repairs/${initialRepair.body.id}/status`,{status:'DELIVERED'},ownerA.token)
    const withoutExpense = await request('POST',`/warranties/${initialRepair.body.id}/claims`,{description:'Solo descripción, sin costo asociado'},ownerA.token)
    assert.equal(withoutExpense.status,201)
    assert.deepEqual(withoutExpense.body.expenses,[])
    assert.equal(await prisma.warrantyClaimExpense.count({where:{claimId:withoutExpense.body.id}}),0)
    assert.equal(await prisma.cashMovement.count({where:{repairId:initialRepair.body.id}}),0)
    assert.equal(await prisma.payment.count({where:{repairId:initialRepair.body.id}}),0)
    const initialPayload = { description:'El módulo dejó de dar imagen', initialExpense:{ concept:'Módulo nuevo', amount:20000, method:'CASH', idempotencyKey:`initial-${suffix}` } }
    assert.equal((await request('POST',`/warranties/${initialRepair.body.id}/claims`,initialPayload,ownerB.token)).status,404)
    const initialClaim = await request('POST',`/warranties/${initialRepair.body.id}/claims`,initialPayload,ownerA.token)
    assert.equal(initialClaim.status,201)
    assert.equal(initialClaim.body.expenses.length,1)
    assert.equal(initialClaim.body.expenses[0].concept,'Módulo nuevo')
    const initialExpense = await prisma.warrantyClaimExpense.findFirstOrThrow({where:{claimId:initialClaim.body.id},include:{cashMovement:true}})
    const initialMovements = await prisma.cashMovement.findMany({where:{repairId:initialRepair.body.id}})
    assert.equal(initialMovements.length,1,'the initial expense creates exactly one cash movement')
    assert.equal(initialExpense.cashMovementId,initialMovements[0].id)
    assert.equal(initialMovements[0].type,'EXPENSE'); assert.equal(initialMovements[0].origin,'REPAIR')
    assert.equal(initialMovements[0].amount,20000); assert.equal(initialMovements[0].method,'CASH')
    assert.equal(await prisma.payment.count({where:{repairId:initialRepair.body.id}}),0)
    const initialCash = await request('GET','/cash/movements?origin=REPAIR',undefined,ownerA.token)
    assert.ok(initialCash.body.items.some((item:any)=>item.id===initialMovements[0].id),'the initial expense shows up in Caja → Reparaciones')
    const retriedCreate = await request('POST',`/warranties/${initialRepair.body.id}/claims`,initialPayload,ownerA.token)
    assert.equal(retriedCreate.status,201)
    assert.equal(retriedCreate.body.id,initialClaim.body.id,'replaying the creation does not open a second claim')
    assert.equal((await request('POST',`/warranties/${initialRepair.body.id}/claims`,{...initialPayload,initialExpense:{...initialPayload.initialExpense,amount:15000}},ownerA.token)).status,409)
    assert.equal(await prisma.cashMovement.count({where:{repairId:initialRepair.body.id}}),1)
    // A rejected expense must not leave the claim behind: both writes share one transaction.
    const beforeRollback = await prisma.warrantyClaim.count({where:{repairId:initialRepair.body.id}})
    assert.equal((await request('POST',`/warranties/${initialRepair.body.id}/claims`,{description:'Gasto con importe inválido',initialExpense:{concept:'Módulo',amount:0,method:'CASH',idempotencyKey:`invalid-${suffix}`}},ownerA.token)).status,400)
    assert.equal((await request('POST',`/warranties/${initialRepair.body.id}/claims`,{description:'Gasto sin concepto',initialExpense:{concept:'',amount:5000,method:'CASH',idempotencyKey:`blank-${suffix}`}},ownerA.token)).status,400)
    assert.equal((await request('POST',`/warranties/${initialRepair.body.id}/claims`,{description:'Gasto sin medio de pago',initialExpense:{concept:'Módulo',amount:5000,idempotencyKey:`nomethod-${suffix}`}},ownerA.token)).status,400)
    assert.equal((await request('POST',`/warranties/${initialRepair.body.id}/claims`,{description:'Gasto de otro tenant',initialExpense:{concept:'Módulo',amount:5000,method:'CASH',idempotencyKey:`cross-${suffix}`}},ownerB.token)).status,404)
    assert.equal(await prisma.warrantyClaim.count({where:{repairId:initialRepair.body.id}}),beforeRollback,'no orphan claim survives a failed initial expense')
    assert.equal(await prisma.cashMovement.count({where:{repairId:initialRepair.body.id}}),1)
    assert.equal((await request('GET','/warranties',undefined,ownerA.token)).body.find((item:any)=>item.id===initialRepair.body.id).warrantyClaims.length,2)
    // Further expenses keep working on a claim that already arrived with one.
    const extraExpense = await request('POST',`/warranties/claims/${initialClaim.body.id}/expenses`,{concept:'Adhesivo',amount:3000,method:'TRANSFER',idempotencyKey:`extra-${suffix}`},ownerA.token)
    assert.equal(extraExpense.status,201)
    const bothExpenses = (await request('GET','/warranties',undefined,ownerA.token)).body.find((item:any)=>item.id===initialRepair.body.id).warrantyClaims.find((item:any)=>item.id===initialClaim.body.id).expenses
    assert.equal(bothExpenses.length,2,'the same claim holds both the initial and the later expense')
    assert.deepEqual(bothExpenses.map((item:any)=>item.concept).sort(),['Adhesivo','Módulo nuevo'])
    assert.equal(await prisma.cashMovement.count({where:{repairId:initialRepair.body.id}}),2)
    assert.equal((await request('POST',`/warranties/claims/${initialClaim.body.id}/expenses`,{concept:'Adhesivo',amount:3000,method:'TRANSFER',idempotencyKey:`extra-${suffix}`},ownerA.token)).status,201)
    assert.equal(await prisma.cashMovement.count({where:{repairId:initialRepair.body.id}}),2,'a repeated expense never double-charges')
    const noCashUser = await prisma.user.create({ data: { businessId: ownerA.businessId, name: 'Sin caja', email: `warranty-nocash-${suffix}@example.com`, passwordHash: 'unused', role: 'TECHNICIAN', permissions: ['repairs.view', 'repairs.update'] } })
    const noCashToken = jwt.sign({ userId: noCashUser.id, businessId: noCashUser.businessId, role: noCashUser.role, platformRole: noCashUser.platformRole, tokenVersion: noCashUser.tokenVersion }, process.env.JWT_SECRET!)
    assert.equal((await request('POST',`/warranties/${initialRepair.body.id}/claims`,{description:'Gasto sin permiso de caja',initialExpense:{concept:'Módulo',amount:5000,method:'CASH',idempotencyKey:`nocash-${suffix}`}},noCashToken)).status,403)
    assert.equal(await prisma.cashMovement.count({where:{repairId:initialRepair.body.id}}),2)
    console.log('WARRANTY TESTS PASSED: original coverage, initial and later expenses with their cash movements, rollback, idempotent retries, renewal from delivery, no-warranty history, rejection, permissions and tenant isolation')
  } finally {
    for (const businessId of businesses) await prisma.$transaction([prisma.warrantyClaimExpense.deleteMany({where:{businessId}}),prisma.warrantyClaim.deleteMany({where:{businessId}}),prisma.repairStatusHistory.deleteMany({where:{repair:{businessId}}}),prisma.repairPhoto.deleteMany({where:{repair:{businessId}}}),prisma.payment.deleteMany({where:{businessId}}),prisma.cashMovement.deleteMany({where:{businessId}}),prisma.repair.deleteMany({where:{businessId}}),prisma.device.deleteMany({where:{businessId}}),prisma.client.deleteMany({where:{businessId}}),prisma.passwordResetToken.deleteMany({where:{user:{businessId}}}),prisma.subscription.deleteMany({where:{businessId}}),prisma.user.deleteMany({where:{businessId}}),prisma.business.deleteMany({where:{id:businessId}})]); await prisma.$disconnect(); await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { PERMISSIONS, type Permission } from '../src/config/permissions'

// Refuse remote/configured developer databases before importing app or Prisma.
const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(database.hostname === '127.0.0.1' && database.pathname === '/tecnodesk_role_permissions_test')
process.env.DOTENV_CONFIG_PATH = 'role-permissions-no-env-file'
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'role-permissions-local-only'
process.env.ORIGIN_AUTH_ENABLED = 'false'
for (const key of ['RATE_LIMIT_AUTH_MAX', 'RATE_LIMIT_AUTH_WRITES_MAX', 'RATE_LIMIT_GLOBAL_MAX', 'RATE_LIMIT_SUPER_ADMIN_WRITES_MAX']) process.env[key] = '10000'

async function main() {
  const { prisma } = await import('../src/lib/prisma')
  const { app } = await import('../src/app')
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  let checks = 0
  const failures: string[] = []
  const sign = (user: any, extra = {}) => jwt.sign({ userId: user.id, businessId: user.businessId, tokenVersion: user.tokenVersion, role: user.role, platformRole: user.platformRole, ...extra }, process.env.JWT_SECRET!)
  const call = async (token: string | undefined, method: string, path: string, body?: object) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, { method, redirect: 'error', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await response.text()
    checks++
    return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) as any : text }
  }
  const expect = async (token: string | undefined, method: string, path: string, status: number, body?: object) => {
    const result = await call(token, method, path, body)
    assert.equal(result.status, status, `${method} ${path}: ${JSON.stringify(result.body)}`)
    return result.body
  }
  const probe = async (name: string, test: () => Promise<void>) => {
    try { await test(); console.log(`PASS ${name}`) }
    catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : error}`); console.log(`FAIL ${name}`) }
  }
  const password = 'SyntheticPassword7'
  const hash = await bcrypt.hash(password, 4)
  const createTenant = async (label: string, platformRole: 'USER' | 'SUPER_ADMIN' = 'USER') => {
    const business = await prisma.business.create({ data: { name: `RBAC-${label}-${randomUUID()}` } })
    const makeUser = (name: string, role: 'OWNER' | 'TECHNICIAN', permissions: Permission[], isActive = true) => prisma.user.create({ data: { businessId: business.id, name, email: `${randomUUID()}@example.test`, passwordHash: hash, role, permissions, isActive, platformRole: name === 'Owner' ? platformRole : 'USER' } })
    const owner = await makeUser('Owner', 'OWNER', [])
    const full = await makeUser('Full', 'TECHNICIAN', [...PERMISSIONS])
    const none = await makeUser('None', 'TECHNICIAN', [])
    const partial = await makeUser('Partial', 'TECHNICIAN', ['repairs.view', 'clients.view', 'reports.view'])
    const inactive = await makeUser('Inactive', 'TECHNICIAN', [...PERMISSIONS], false)
    const now = new Date(), future = new Date(Date.now() + 30 * 86400000)
    const subscription = await prisma.subscription.create({ data: { businessId: business.id, planCode: 'COMPLETE', status: 'ACTIVE', trialStartedAt: now, trialEndsAt: now, trialConsumedAt: now, accessExpiresAt: future, currentPeriodStart: now, currentPeriodEnd: future } })
    const client = await prisma.client.create({ data: { businessId: business.id, name: `Private ${label}` } })
    const repair = await prisma.repair.create({ data: { businessId: business.id, clientId: client.id, number: 1, deviceBrand: 'Synthetic', deviceModel: 'Phone', issue: 'Synthetic issue', total: 1000, partsCost: 123, laborCost: 45, laborCharge: 60 } })
    const delivery = await prisma.repair.create({ data: { businessId: business.id, clientId: client.id, number: 2, deviceBrand: 'Synthetic', deviceModel: 'Warranty', issue: 'Synthetic issue', status: 'DELIVERED', deliveredAt: now, warrantyEnabled: true, warrantyDurationDays: 30, warrantyStartedAt: now, warrantyExpiresAt: future } })
    const product = await prisma.commerceProduct.create({ data: { businessId: business.id, name: 'Cable', category: 'Accessories', purchaseCost: 30, salePrice: 100, currentStock: 20 } })
    const category = await prisma.commerceCategory.create({ data: { businessId: business.id, name: 'Accessories' } })
    const device = await prisma.resaleDevice.create({ data: { businessId: business.id, brand: 'Synthetic', model: 'Resale', purchasePrice: 10, repairExpenses: 5, estimatedSalePrice: 50, status: 'READY_FOR_SALE' } })
    const claim = await prisma.warrantyClaim.create({ data: { businessId: business.id, repairId: delivery.id, description: 'Synthetic seeded claim', coveredWarrantyStartedAt: now, coveredWarrantyExpiresAt: future, coveredWarrantyDurationDays: 30 } })
    const expense = await prisma.cashMovement.create({ data: { businessId: business.id, repairId: delivery.id, type: 'EXPENSE', origin: 'REPAIR', amount: 17, method: 'CASH', description: 'Synthetic warranty cost' } })
    await prisma.warrantyClaimExpense.create({ data: { businessId: business.id, claimId: claim.id, cashMovementId: expense.id, concept: 'Synthetic warranty cost', idempotencyKey: randomUUID() } })
    return { business, owner, full, none, partial, inactive, subscription, client, repair, delivery, product, category, device, claim }
  }
  try {
    const A = await createTenant('A'), B = await createTenant('B'), admin = await createTenant('ADMIN', 'SUPER_ADMIN')
    const ids = [A.business.id, B.business.id, admin.business.id]
    const snapshot = async () => {
      const where = { businessId: { in: ids } }, orderBy = { id: 'asc' as const }
      return await Promise.all([
        prisma.business.findMany({ where: { id: { in: ids } }, orderBy }), prisma.user.findMany({ where, orderBy }),
        prisma.client.findMany({ where, orderBy }), prisma.repair.findMany({ where, orderBy, include: { statusHistory: { orderBy }, photos: { orderBy } } }),
        prisma.payment.findMany({ where, orderBy }), prisma.cashMovement.findMany({ where, orderBy }),
        prisma.warrantyClaim.findMany({ where, orderBy }), prisma.warrantyClaimExpense.findMany({ where, orderBy }),
        prisma.commerceProduct.findMany({ where, orderBy }), prisma.commerceCategory.findMany({ where, orderBy }),
        prisma.commerceSale.findMany({ where, orderBy, include: { lines: { orderBy } } }), prisma.resaleDevice.findMany({ where, orderBy }),
        prisma.subscription.findMany({ where, orderBy }), prisma.paymentSubmission.findMany({ where, orderBy }),
        prisma.subscriptionAuditLog.findMany({ where, orderBy }), prisma.platformInternalNote.findMany({ where, orderBy }),
        prisma.passwordResetToken.findMany({ where: { user: where }, orderBy }), prisma.billingSettings.findMany({ orderBy }),
      ])
    }
    type Case = [Permission, string, string, object?]
    const matrix: Case[] = [
      ['clients.view','GET','/clients'], ['clients.view','GET','/clients/options'], ['clients.view','GET',`/clients/${A.client.id}`],
      ['clients.create','POST','/clients',{name:'New client'}], ['clients.update','PATCH',`/clients/${A.client.id}`,{name:'Updated'}], ['clients.delete','DELETE',`/clients/${A.client.id}`],
      ['repairs.view','GET','/repairs'], ['repairs.view','GET',`/repairs/${A.repair.id}`], ['repairs.view','GET',`/repairs/${A.repair.id}/history`],
      ['repairs.create','POST','/repairs',{clientId:A.client.id,deviceBrand:'Test',deviceModel:'Test',issue:'Test issue',total:100}],
      ['repairs.update','PATCH',`/repairs/${A.repair.id}/edit`,{diagnosis:'Test'}], ['repairs.update','PATCH',`/repairs/${A.repair.id}`,{deviceBrand:'Test',deviceModel:'Test',issue:'Test issue',total:1000}],
      ['repairs.delete','DELETE',`/repairs/${A.repair.id}`], ['repairs.changeStatus','PATCH',`/repairs/${A.repair.id}/status`,{status:'REVIEW'}],
      ...['status/advance','status/rewind','approve','start'].map(path => ['repairs.changeStatus','PATCH',`/repairs/${A.repair.id}/${path}`,{}] as Case),
      ['repairs.changeStatus','POST',`/repairs/${A.repair.id}/cancel`,{reviewFee:0}],
      ['repairs.shareTracking','POST',`/repairs/${A.repair.id}/tracking-link`,{}], ['repairs.shareTracking','PATCH',`/repairs/${A.repair.id}/tracking-link`,{enabled:false}],
      ['repairs.viewFinancials','GET',`/repairs/${A.repair.id}/payments`], ['repairs.viewFinancials','POST',`/repairs/${A.repair.id}/payments`,{amount:1,method:'CASH'}],
      ['repairs.viewFinancials','PATCH',`/repairs/${A.repair.id}/advance`,{amount:1,method:'CASH'}], ['repairs.viewFinancials','PATCH',`/repairs/${A.repair.id}/initial-cost`,{amount:1,method:'CASH'}],
      ['repairs.viewFinancials','POST',`/repairs/${A.repair.id}/cancellation-payment`,{amount:1,method:'CASH'}],
      ['cash.view','GET','/cash/movements'], ['cash.create','POST','/cash/movements',{type:'EXPENSE',amount:1,method:'CASH',description:'Test expense'}],
      ['reports.view','GET','/reports/overview'], ['settings.access','GET','/settings'], ['settings.access','GET','/settings/business/logo'],
      ['settings.access','POST','/settings/logout-other-sessions',{}], ['settings.business.update','POST','/settings/business/logo',{}],
      ['settings.business.update','PATCH','/settings/business',{name:'Updated'}], ['settings.business.update','DELETE','/settings/business/logo'],
      ['team.view','GET','/team'], ['team.view','GET',`/team/${A.owner.id}`],
      ['commerce.view','GET','/commerce/categories'], ['commerce.view','GET','/commerce/products'], ['commerce.view','GET','/commerce/sales'], ['commerce.view','GET','/commerce/movements'], ['commerce.view','GET','/commerce/summary'],
      ['commerce.manage','POST','/commerce/categories',{name:'Accessories'}], ['commerce.manage','POST','/commerce/products',{name:'Test',category:'Accessories',purchaseCost:1,salePrice:2,currentStock:1}],
      ['commerce.manage','PATCH',`/commerce/categories/${A.category.id}`,{name:'Renamed'}], ['commerce.manage','DELETE',`/commerce/categories/${A.category.id}`], ['commerce.manage','POST','/commerce/sales/missing/cancel',{}],
      ['commerce.manage','PATCH',`/commerce/products/${A.product.id}`,{name:'Test',category:'Accessories',purchaseCost:1,salePrice:100,currentStock:20}], ['commerce.manage','DELETE',`/commerce/products/${A.product.id}`],
      ['commerce.manage','POST','/commerce/expenses',{amount:1,method:'CASH',description:'Test expense'}],
      ['commerce.sell','POST','/commerce/sales',{lines:[{productId:A.product.id,quantity:1,expectedUnitPrice:100}],paymentMethod:'CASH',expectedTotal:100,idempotencyKey:randomUUID()}],
      ['equipmentSales.view','GET','/equipment-sales'], ['equipmentSales.view','GET','/equipment-sales/summary'],
      ['equipmentSales.manage','POST','/equipment-sales',{brand:'Test',model:'Test',purchasePrice:1,repairExpenses:1,estimatedSalePrice:5,status:'READY_FOR_SALE'}],
      ['equipmentSales.manage','PATCH',`/equipment-sales/${A.device.id}`,{brand:'Test',model:'Test',purchasePrice:1,repairExpenses:1,estimatedSalePrice:50,status:'READY_FOR_SALE',expectedVersion:0}],
      ['equipmentSales.sell','POST',`/equipment-sales/${A.device.id}/sell`,{actualSalePrice:50,salePaymentMethod:'CASH',expectedVersion:0}],
      ['repairs.view','GET','/warranties'], ['repairs.update','PATCH',`/warranties/${A.delivery.id}`,{durationDays:30}], ['repairs.update','DELETE',`/warranties/${A.delivery.id}`],
      ['repairs.update','POST',`/warranties/${A.delivery.id}/claims`,{description:'Test warranty claim'}],
      ['repairs.update','PATCH',`/warranties/claims/${A.claim.id}`,{status:'RESOLVED'}],
      ['repairs.update','POST',`/warranties/claims/${A.claim.id}/expenses`,{concept:'Test expense',amount:1,method:'CASH',idempotencyKey:randomUUID()}],
      ['cash.create','POST',`/warranties/claims/${A.claim.id}/expenses`,{concept:'Test expense',amount:1,method:'CASH',idempotencyKey:randomUUID()}],
      ['repairs.changeStatus','POST',`/warranties/claims/${A.claim.id}/delivery`,{warrantyDurationDays:30}],
    ]
    const setPermissions = async (permissions: Permission[]) => { await prisma.user.update({ where: { id:A.partial.id }, data:{ permissions } }); return sign(A.partial) }
    await probe('all endpoint gates reject empty permissions without effects', async () => {
      const before = await snapshot()
      for (const [,method,path,body] of matrix) await expect(sign(A.none),method,path,403,body)
      assert.deepEqual(await snapshot(),before)
    })
    await probe('each permission is required even when every other permission is granted', async () => {
      for (const [permission,method,path,body] of matrix) {
        const token = await setPermissions(PERMISSIONS.filter(p=>p!==permission))
        const before = await snapshot()
        await expect(token,method,path,403,body)
        assert.deepEqual(await snapshot(),before)
      }
    })
    const restricted: Array<[string,string,object?]> = [
      ['GET','/dashboard/overview'], ['POST','/team',{firstName:'New',lastName:'Owner',email:`${randomUUID()}@example.test`,password,role:'OWNER'}],
      ['PATCH',`/team/${A.full.id}`,{role:'OWNER',permissions:[...PERMISSIONS],isActive:true}], ['DELETE',`/team/${A.none.id}`], ['POST',`/team/${A.full.id}/reset-password`,{password}],
      ['POST',`/repairs/${A.delivery.id}/delivery/correction`,{deliveredAt:new Date().toISOString()}],
      ['GET','/billing/subscription'], ['GET','/billing/usage'], ['GET','/billing/payments'], ['GET','/billing/transfer-details'],
      ['POST','/billing/select-plan',{planCode:'COMPLETE'}], ['POST','/billing/payments',{planCode:'COMPLETE',reportedAmount:1,payerName:'Test',transferDate:new Date().toISOString()}],
      ['DELETE','/account',{password,confirmation:'ELIMINAR MI CUENTA'}],
    ]
    await probe('TECHNICIAN full permissions cannot invoke OWNER operations',async()=>{
      const before=await snapshot()
      for(const [method,path,body] of restricted) await expect(sign(A.full),method,path,403,body)
      assert.deepEqual(await snapshot(),before)
    })
    await probe('reports.view does not expose sensitive finance',async()=>{
      const token=await setPermissions(['reports.view'])
      const report=await expect(token,'GET','/reports/overview',200)
      assert.equal('finance' in report,false,'reports.view leaked finance')
      assert.deepEqual(Object.keys(report.summary).sort(),['repairsIncoming','repairsDelivered','repairsActive','newClients','recurrentClients'].sort())
      assert.ok(report.repairs.byStatus.length)
      assert.deepEqual(Object.keys(report.clients).sort(),['new','recurrent','topByRepairs','averageRepairs'].sort())
      for(const row of report.clients.topByRepairs) assert.deepEqual(Object.keys(row).sort(),['name','repairs'])
      for(const token of [sign(A.owner),sign(A.full),await setPermissions(['reports.view','reports.viewSensitive'])]) {
        const full=await expect(token,'GET','/reports/overview',200)
        assert.equal(full.finance.partsCost,123); assert.equal(full.finance.laborCost,45)
      }
      await expect(await setPermissions(['reports.viewSensitive']),'GET','/reports/overview',403)
    })
    await probe('repair financial fields and errors respect effective permissions',async()=>{
      const token=await setPermissions(['repairs.view','repairs.update','repairs.changeStatus','repairs.create'])
      const view=await expect(token,'GET',`/repairs/${A.repair.id}`,200)
      for(const field of ['partsCost','laborCost','laborCharge','payments','initialCostMovementId']) assert.equal(field in view,false)
      assert.equal(view.total,1000) // Existing operational UI policy.
      const before=await snapshot()
      await expect(token,'PATCH',`/repairs/${A.repair.id}/edit`,403,{partsCost:999,partsCostMethod:'CASH',diagnosis:'Must rollback'})
      await expect(token,'POST','/repairs',403,{clientId:A.client.id,deviceBrand:'Test',deviceModel:'Test',issue:'Test issue',total:10,advanceAmount:1,advanceMethod:'CASH'})
      assert.deepEqual(await snapshot(),before)
      assert.equal((await expect(sign(A.full),'GET',`/repairs/${A.repair.id}`,200)).partsCost,123)
      const warranty=await expect(token,'GET','/warranties',200)
      assert.deepEqual(warranty.find((r:any)=>r.id===A.delivery.id).warrantyClaims[0].expenses,[])
      const beforeClaim=await snapshot()
      await expect(token,'POST',`/warranties/${A.delivery.id}/claims`,403,{description:'Must not create partial claim',initialExpense:{concept:'Denied expense',amount:99,method:'CASH',idempotencyKey:randomUUID()}})
      await expect(token,'POST',`/warranties/claims/${A.claim.id}/expenses`,403,{concept:'Denied expense',amount:99,method:'CASH',idempotencyKey:randomUUID()})
      assert.deepEqual(await snapshot(),beforeClaim)
      const costs=await expect(sign(A.full),'GET','/warranties',200)
      assert.equal(costs.find((r:any)=>r.id===A.delivery.id).warrantyClaims[0].expenses[0].cashMovement.amount,17)
    })
    await probe('JWT privileges and self-profile fields cannot grant authority',async()=>{
      const forged=sign(A.none,{role:'OWNER',platformRole:'SUPER_ADMIN',permissions:[...PERMISSIONS]})
      const before=await snapshot()
      await expect(forged,'GET','/clients',403); await expect(forged,'GET','/platform-admin/dashboard',403)
      for(const token of [undefined,'invalid',jwt.sign({userId:A.owner.id,businessId:A.business.id},'wrong-local-signing-key'),sign(A.owner,{businessId:B.business.id}),sign(A.owner,{purpose:'account-deletion'})]) await expect(token,'GET','/clients',401)
      await expect(sign(A.inactive),'GET','/clients',403)
      assert.deepEqual(await snapshot(),before)
      await expect(sign(A.none),'PATCH','/profile',200,{firstName:'Safe',lastName:'Profile',role:'OWNER',platformRole:'SUPER_ADMIN',permissions:[...PERMISSIONS],businessId:B.business.id})
      const user=await prisma.user.findUniqueOrThrow({where:{id:A.none.id}})
      assert.equal(user.role,'TECHNICIAN');assert.equal(user.platformRole,'USER');assert.equal(user.businessId,A.business.id);assert.deepEqual(user.permissions,[])
      await expect(sign(A.none),'GET','/clients',403)
      const beforeInvalid=await snapshot()
      await expect(sign(A.owner),'PATCH',`/team/${A.full.id}`,400,{platformRole:'SUPER_ADMIN'})
      assert.deepEqual(await snapshot(),beforeInvalid)
    })
    await probe('existing JWT follows database role/permissions/status and password version',async()=>{
      const old=sign(A.partial)
      await setPermissions(['clients.view']);await expect(old,'GET','/clients',200)
      await setPermissions([]);await expect(old,'GET','/clients',403)
      await expect(sign(A.owner),'PATCH',`/team/${A.partial.id}`,200,{permissions:['clients.view']});await expect(old,'GET','/clients',200)
      await expect(sign(A.owner),'PATCH',`/team/${A.partial.id}`,200,{role:'OWNER'});await expect(old,'GET','/dashboard/overview',200)
      await expect(sign(A.owner),'PATCH',`/team/${A.partial.id}`,200,{role:'TECHNICIAN'});await expect(old,'GET','/dashboard/overview',403)
      await expect(sign(A.owner),'PATCH',`/team/${A.partial.id}`,200,{isActive:false});await expect(old,'GET','/clients',403)
      await expect(sign(A.owner),'PATCH',`/team/${A.partial.id}`,200,{isActive:true});await expect(old,'GET','/clients',200)
      await expect(sign(A.owner),'POST',`/team/${A.partial.id}/reset-password`,200,{password:'NewSyntheticPassword8'})
      await expect(old,'GET','/clients',401)
      const login=await expect(undefined,'POST','/auth/login',200,{email:A.partial.email,password:'NewSyntheticPassword8'})
      await expect(login.token,'GET','/clients',200)
      await expect(sign(A.owner),'DELETE',`/team/${A.partial.id}`,200);await expect(login.token,'GET','/clients',401)
    })
    await probe('platform access is global only in platform routes; forged admin rejected',async()=>{
      const before=await snapshot()
      const routes= ['dashboard','businesses',`businesses/${B.business.id}`,'subscriptions',`subscriptions/${B.subscription.id}`,'payments','billing-settings','service-settings']
      for(const path of routes) {
        await expect(sign(A.owner),'GET',`/platform-admin/${path}`,403)
        await expect(sign(A.full,{platformRole:'SUPER_ADMIN'}),'GET',`/platform-admin/${path}`,403)
      }
      for(const [method,path,body] of [['PATCH',`businesses/${B.business.id}/status`,{isActive:false}],['POST',`businesses/${B.business.id}/block`,{reason:'Test'}],['PATCH',`subscriptions/${B.subscription.id}`,{action:'SUSPEND'}],['PATCH','billing-settings',{}],['PATCH','service-settings',{}],['POST',`payments/missing/approve`,{}],['POST',`businesses/${B.business.id}/notes`,{content:'Test'}]] as const) await expect(sign(A.owner),method,`/platform-admin/${path}`,403,body)
      assert.deepEqual(await snapshot(),before)
      await expect(sign(admin.owner),'GET',`/platform-admin/businesses/${B.business.id}`,200)
      await expect(sign(admin.owner),'GET',`/clients/${B.client.id}`,404)
      await expect(sign(admin.owner),'DELETE','/account',403,{password,confirmation:'ELIMINAR MI CUENTA'})
      const oldAdmin=sign(admin.owner)
      await prisma.user.update({where:{id:admin.owner.id},data:{platformRole:'USER'}})
      await expect(oldAdmin,'GET','/platform-admin/dashboard',403)
      await prisma.user.update({where:{id:admin.owner.id},data:{platformRole:'SUPER_ADMIN'}})
      await expect(oldAdmin,'GET','/platform-admin/dashboard',200)
    })
    await probe('subscription expiry/manual block/renewal do not grant operational access',async()=>{
      const oldOwner=sign(B.owner),oldStaff=sign(B.full)
      await prisma.subscription.update({where:{id:B.subscription.id},data:{accessExpiresAt:new Date(Date.now()-30*86400000),graceDaysOverride:0}})
      const before=await snapshot()
      for(const path of ['/clients','/repairs','/cash/movements','/profile','/dashboard/overview','/settings','/platform-admin/dashboard']) await expect(oldOwner,'GET',path,403)
      await expect(oldStaff,'GET','/auth/me',403);await expect(oldStaff,'GET','/billing/entitlements',403)
      await expect(oldOwner,'PATCH','/auth/tutorial-seen',403,{})
      await expect(oldOwner,'PATCH',`/repairs/${B.repair.id}/edit`,403,{diagnosis:'Denied'})
      await expect(oldOwner,'GET','/auth/me',200);await expect(oldOwner,'GET','/billing/subscription',200)
      assert.deepEqual(await snapshot(),before)
      await prisma.subscription.update({where:{id:B.subscription.id},data:{manuallyBlockedAt:new Date(),manualBlockReason:'Synthetic block'}})
      for(const token of [oldOwner,oldStaff]) for(const path of ['/auth/me','/billing/subscription','/clients']) await expect(token,'GET',path,403)
      await prisma.subscription.update({where:{id:B.subscription.id},data:{manuallyBlockedAt:null,accessExpiresAt:new Date(Date.now()+86400000)}})
      await expect(oldOwner,'GET','/clients',200)
      await prisma.business.update({where:{id:B.business.id},data:{isActive:false}});await expect(oldOwner,'GET','/clients',403)
      await prisma.business.update({where:{id:B.business.id},data:{isActive:true}})
    })
    await probe('last active OWNER survives simultaneous self-demotions',async()=>{
      const second=await prisma.user.create({data:{businessId:B.business.id,name:'Second',email:`${randomUUID()}@example.test`,role:'OWNER',passwordHash:hash}})
      const results=await Promise.all([call(sign(B.owner),'PATCH',`/team/${B.owner.id}`,{role:'TECHNICIAN'}),call(sign(second),'PATCH',`/team/${second.id}`,{role:'TECHNICIAN'})])
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409])
      assert.equal(await prisma.user.count({where:{businessId:B.business.id,role:'OWNER',isActive:true}}),1)
      const winner=(await prisma.user.findFirstOrThrow({where:{businessId:B.business.id,role:'OWNER',isActive:true}}))
      const before=await snapshot()
      await expect(sign(winner),'PATCH',`/team/${winner.id}`,409,{role:'TECHNICIAN'})
      await expect(sign(winner),'PATCH',`/team/${winner.id}`,400,{isActive:false})
      assert.deepEqual(await snapshot(),before)
    })
    await probe('concurrent denied money and permission writes leave no effects',async()=>{
      const before=await snapshot()
      const attacks=[...Array.from({length:4},()=>call(sign(A.none),'POST',`/repairs/${A.repair.id}/payments`,{amount:99,method:'CASH'})),...Array.from({length:4},()=>call(sign(A.full),'PATCH',`/team/${A.full.id}`,{role:'OWNER'}))]
      assert.ok((await Promise.all(attacks)).every(r=>r.status===403));assert.deepEqual(await snapshot(),before)
    })
    await probe('account deletion rejects wrong password and manipulated capability without effects',async()=>{
      const before=await snapshot()
      await expect(sign(A.owner),'DELETE','/account',400,{password:'WrongSyntheticPassword',confirmation:'ELIMINAR MI CUENTA'})
      await expect(sign(A.owner),'DELETE','/account',400,{password,confirmation:'Wrong confirmation'})
      await expect(sign(A.full,{purpose:'account-deletion'}),'DELETE','/account',401,{password,confirmation:'ELIMINAR MI CUENTA'})
      assert.deepEqual(await snapshot(),before)
    })
    // Full positive controls use real handlers, with restricted counterpart above.
    await probe('legitimate individual permissions remain usable',async()=>{
      // This user has never undergone a password change, so its JWT is current.
      for(const [permission,path] of [['clients.view','/clients'],['repairs.view','/repairs'],['cash.view','/cash/movements'],['settings.access','/settings'],['team.view','/team'],['commerce.view','/commerce/products'],['equipmentSales.view','/equipment-sales']] as const){await prisma.user.update({where:{id:A.none.id},data:{permissions:[permission]}});await expect(sign(A.none),'GET',path,200)}
      const token=sign(A.full)
      await prisma.user.update({where:{id:A.none.id},data:{permissions:['settings.business.update']}})
      await expect(sign(A.none),'PATCH','/settings/business',200,{name:'Legitimate business'})
      await expect(sign(A.none),'GET','/settings',403)
      const client=await expect(token,'POST','/clients',201,{name:'Legitimate client'})
      await expect(token,'PATCH',`/clients/${client.id}`,200,{name:'Legitimate edited'})
      const disposableClient=await expect(token,'POST','/clients',201,{name:'Disposable legitimate client'})
      await expect(token,'DELETE',`/clients/${disposableClient.id}`,200)
      const repair=await expect(token,'POST','/repairs',201,{clientId:client.id,deviceBrand:'Test',deviceModel:'Test',issue:'Test issue',total:100})
      const disposableRepair=await expect(token,'POST','/repairs',201,{clientId:client.id,deviceBrand:'Test',deviceModel:'Test',issue:'Disposable repair',total:100})
      await expect(token,'DELETE',`/repairs/${disposableRepair.id}`,200)
      await expect(token,'PATCH',`/repairs/${repair.id}/edit`,200,{diagnosis:'Legitimate'})
      await expect(token,'PATCH',`/repairs/${repair.id}/status/advance`,200,{})
      await expect(token,'POST',`/repairs/${repair.id}/tracking-link`,200,{})
      await expect(token,'PATCH',`/repairs/${repair.id}/tracking-link`,200,{enabled:false})
      await expect(token,'PATCH',`/repairs/${repair.id}/advance`,200,{amount:10,method:'CASH'})
      await expect(token,'PATCH',`/repairs/${repair.id}/initial-cost`,200,{amount:5,method:'CASH'})
      await expect(token,'POST',`/repairs/${repair.id}/payments`,201,{amount:10,method:'CASH'})
      await expect(token,'GET',`/repairs/${repair.id}/payments`,200)
      await expect(token,'POST','/cash/movements',201,{type:'EXPENSE',amount:1,method:'CASH',description:'Legitimate expense'})
      const category=await expect(token,'POST','/commerce/categories',201,{name:'Legitimate category'})
      const product=await expect(token,'POST','/commerce/products',201,{name:'Legitimate',category:category.name,purchaseCost:1,salePrice:100,currentStock:2})
      await expect(token,'POST','/commerce/sales',201,{lines:[{productId:product.id,quantity:1,expectedUnitPrice:100}],paymentMethod:'CASH',expectedTotal:100,idempotencyKey:randomUUID()})
      const device=await expect(token,'POST','/equipment-sales',201,{brand:'Test',model:'Test',purchasePrice:1,repairExpenses:1,estimatedSalePrice:50,status:'READY_FOR_SALE'})
      await expect(token,'POST',`/equipment-sales/${device.id}/sell`,200,{actualSalePrice:50,salePaymentMethod:'CASH',expectedVersion:device.version})
      await expect(token,'PATCH',`/warranties/${A.delivery.id}`,200,{durationDays:45})
      const claim=await expect(token,'POST',`/warranties/${A.delivery.id}/claims`,201,{description:'Legitimate warranty claim'})
      await expect(token,'POST',`/warranties/claims/${claim.id}/expenses`,201,{concept:'Legitimate expense',amount:1,method:'CASH',idempotencyKey:randomUUID()})
      await expect(token,'PATCH',`/warranties/claims/${claim.id}`,200,{status:'RESOLVED'})
      await expect(token,'POST',`/warranties/claims/${claim.id}/delivery`,200,{warrantyDurationDays:30})
      const owner=sign(A.owner)
      await expect(owner,'GET','/dashboard/overview',200)
      const member=await expect(owner,'POST','/team',201,{firstName:'New',lastName:'Member',email:`${randomUUID()}@example.test`,password,role:'TECHNICIAN',permissions:[]})
      await expect(owner,'PATCH',`/team/${member.id}`,200,{permissions:['clients.view']})
      await expect(owner,'POST',`/team/${member.id}/reset-password`,200,{password})
      await expect(owner,'DELETE',`/team/${member.id}`,200)
    })
    console.log(`${checks} HTTP checks; ${failures.length} failed groups`)
    assert.deepEqual(failures,[])
  } finally {
    await prisma.$disconnect()
    await new Promise<void>(resolve => server.close(()=>resolve()))
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})

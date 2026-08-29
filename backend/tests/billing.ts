import 'dotenv/config'
import assert from 'node:assert/strict'
import { addBillingMonth, addDays, approvePayment, assertWithinLimit, refreshSubscriptionStatus } from '../src/modules/billing/billing.service'
import { validRegistrationPayload } from './helpers/registration'

process.env.NODE_ENV = 'test'
process.env.TURNSTILE_SECRET_KEY = 'test-only-secret'
const nativeFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  String(input).includes('challenges.cloudflare.com/turnstile')
    ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    : nativeFetch(input, init)) as typeof fetch

async function main(){
  const [{ app }, { prisma }] = await Promise.all([import('../src/server'), import('../src/lib/prisma')]);
  const server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}/api`;const suffix=Date.now();let businessId='';
  const request=async(method:string,path:string,body?:object,token?:string)=>{const response=await fetch(`${base}${path}`,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});const text=await response.text();return{status:response.status,body:text?JSON.parse(text):null}}
  try{
    const registration=await request('POST','/auth/register',validRegistrationPayload({businessName:`Billing ${suffix}`,firstName:'Billing',lastName:'Owner',email:`billing-${suffix}@example.com`,password:'Billing-2026!'}));assert.equal(registration.status,201);businessId=registration.body.user.business.id;const token=registration.body.token as string;
    const trial=await prisma.subscription.findUnique({where:{businessId}});assert.ok(trial);assert.equal(trial.status,'TRIALING');assert.equal(trial.planCode,'COMPLETE');assert.ok(Math.abs(trial.trialEndsAt.getTime()-addDays(trial.trialStartedAt,30).getTime())<1000);
    await prisma.subscription.update({where:{businessId},data:{trialEndsAt:addDays(new Date(),-1)}});const grace=await refreshSubscriptionStatus(businessId);assert.equal(grace.status,'GRACE');assert.ok(grace.graceEndsAt);
    await prisma.subscription.update({where:{businessId},data:{status:'GRACE',graceEndsAt:addDays(new Date(),-1),accessExpiresAt:addDays(new Date(),-10)}});const suspended=await refreshSubscriptionStatus(businessId);assert.equal(suspended.status,'SUSPENDED');assert.equal((await request('POST','/clients',{name:'Bloqueado'},token)).status,403);assert.equal((await request('GET','/billing/subscription',undefined,token)).status,403);
    const client=await prisma.client.create({data:{businessId,name:'Cliente tracking'}});const publicRepair=await prisma.repair.create({data:{businessId,number:9001,clientId:client.id,deviceBrand:'Test',deviceModel:'Public',issue:'Test',trackingEnabled:true,trackingToken:`track-${suffix}`}});assert.equal((await request('GET',`/tracking/${publicRepair.trackingToken}`)).status,200);
    await prisma.subscription.update({where:{businessId},data:{status:'ACTIVE',planCode:'INITIAL',currentPeriodStart:new Date(),currentPeriodEnd:addBillingMonth(new Date()),accessExpiresAt:addBillingMonth(new Date()),graceEndsAt:null}});for(let index=0;index<40;index++)await prisma.repair.create({data:{businessId,number:9100+index,clientId:client.id,deviceBrand:'Test',deviceModel:String(index),issue:'Limit'}});await assert.rejects(()=>assertWithinLimit(businessId,'repairs'),/40 reparaciones/);
    assert.equal((await request('GET','/platform-admin/dashboard',undefined,token)).status,403);const owner=await prisma.user.findFirstOrThrow({where:{businessId,role:'OWNER'}});await prisma.user.update({where:{id:owner.id},data:{platformRole:'SUPER_ADMIN'}});const plan=await prisma.plan.findUniqueOrThrow({where:{code:'PROFESSIONAL'}});const sub=await prisma.subscription.findUniqueOrThrow({where:{businessId}});const payment=await prisma.paymentSubmission.create({data:{subscriptionId:sub.id,businessId,planCode:plan.code,expectedAmount:plan.priceARS,reportedAmount:plan.priceARS,payerName:'Billing Owner',transferDate:new Date()}});const approved=await approvePayment(payment.id,owner.id);assert.equal(approved.subscription.status,'ACTIVE');assert.equal(approved.subscription.planCode,'PROFESSIONAL');await assert.rejects(()=>approvePayment(payment.id,owner.id),/ya fue procesado/);
    const adminDashboard=await request('GET','/platform-admin/dashboard',undefined,token);assert.equal(adminDashboard.status,200);
    console.log('BILLING TEST PASSED: trial, grace, suspension, tracking público, límites, aprobación idempotente y protección admin')
  }finally{
    if(businessId)await prisma.$transaction([prisma.subscriptionAuditLog.deleteMany({where:{businessId}}),prisma.paymentSubmission.deleteMany({where:{businessId}}),prisma.repairStatusHistory.deleteMany({where:{repair:{businessId}}}),prisma.repairPhoto.deleteMany({where:{repair:{businessId}}}),prisma.repairPart.deleteMany({where:{repair:{businessId}}}),prisma.payment.deleteMany({where:{businessId}}),prisma.inventoryMovement.deleteMany({where:{businessId}}),prisma.warrantyClaim.deleteMany({where:{businessId}}),prisma.repair.deleteMany({where:{businessId}}),prisma.device.deleteMany({where:{businessId}}),prisma.client.deleteMany({where:{businessId}}),prisma.cashMovement.deleteMany({where:{businessId}}),prisma.stockItem.deleteMany({where:{businessId}}),prisma.passwordResetToken.deleteMany({where:{user:{businessId}}}),prisma.subscription.deleteMany({where:{businessId}}),prisma.user.deleteMany({where:{businessId}}),prisma.business.deleteMany({where:{id:businessId}})]);await prisma.$disconnect();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})

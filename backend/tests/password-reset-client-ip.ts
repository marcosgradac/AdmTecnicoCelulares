// Local HTTP only: invalid payloads stop before Prisma, email or password hashing.
import assert from 'node:assert/strict'
import type { Request } from 'express'
process.env.NODE_ENV='test'
process.env.JWT_SECRET='password-reset-client-ip-test-only'
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:1/never_connected'
process.env.CLIENT_IP_MODE=process.argv[2] === 'baseline' ? 'baseline' : 'cf'
process.env.CLIENT_IP_CF_TRUST_ACK='render-public-web-service'
process.env.PASSWORD_RESET_RATE_LIMIT_MAX='2'
process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS='60000'
async function main(){
 const [{default:express},{passwordResetRouter},{prisma},identity]=await Promise.all([
  import('express'),import('../src/modules/auth/password-reset.routes'),import('../src/lib/prisma'),import('../src/middlewares/client-ip'),
 ])
 const cf=process.env.CLIENT_IP_MODE==='cf'
 let headerReads=0
 const unmarked={ip:'198.51.100.99',rawHeaders:['CF-Connecting-IP','192.0.2.99'],get:()=>{headerReads++;return '192.0.2.99'}} as unknown as Request
 if(cf){for(const reader of [identity.clientIp,identity.clientIpKey,identity.clientRiskKey])assert.throws(()=>reader(unmarked),/middleware/i);assert.equal(headerReads,0)}
 else{assert.equal(identity.clientIp(unmarked),'198.51.100.99');assert.equal(headerReads,0)}
 const originalUser=prisma.user.findUnique,originalTransaction=prisma.$transaction
 let dbCalls=0
 prisma.user.findUnique=(async()=>{dbCalls++;throw new Error('Unexpected local Prisma access')}) as typeof originalUser
 prisma.$transaction=(async()=>{dbCalls++;throw new Error('Unexpected local Prisma transaction')}) as typeof originalTransaction
 const app=express();app.set('trust proxy',cf?false:1)
 app.use(identity.createClientIpMiddleware());app.use(express.json());app.use('/api/auth',passwordResetRouter)
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(done=>server.once('listening',done))
 const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}/api/auth/`
 const post=(route:string,ip:string,xff=ip)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json','CF-Connecting-IP':ip,'X-Forwarded-For':xff},body:'{}'})
 try{
  for(const route of ['forgot-password','reset-password']){
   const a='192.0.2.1',b='192.0.2.2'
   assert.equal((await post(route,a)).status,400)
   assert.equal((await post(route,b)).status,400,'Different public IP must have its own budget')
   assert.equal((await post(route,a,cf?'203.0.113.99':a)).status,400)
   const blocked=await post(route,a,cf?'203.0.113.100':a)
   assert.equal(blocked.status,429,'NAT shares budget and forged XFF cannot rotate CF identity')
   assert.deepEqual(await blocked.json(),{success:false,message:'Demasiados intentos. Probá nuevamente más tarde.'})
   assert.equal((await post(route,b)).status,400)
   assert.equal((await post(route,b)).status,429)
  }
  if(cf){
   assert.equal((await post('forgot-password','2001:db8:1500:1::1')).status,400)
   assert.equal((await post('forgot-password','2001:db8:1500:2::2')).status,400)
   assert.equal((await post('forgot-password','2001:db8:1500:3::3')).status,429)
   assert.equal((await post('forgot-password','2001:db8:1600::1')).status,400)
  }
  assert.equal(dbCalls,0)
  console.log(`PASSWORD RESET CLIENT IP PASSED (${cf?'cf':'baseline'}): forgot/reset independent clients and route budgets, NAT, IPv6, XFF and mandatory central middleware; no DB/email/external requests.`)
 }finally{
  prisma.user.findUnique=originalUser;prisma.$transaction=originalTransaction
  await new Promise<void>(done=>server.close(()=>done()));await prisma.$disconnect()
 }
}
main().catch(error=>{console.error(error);process.exitCode=1})

import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { app } from '../src/server'
import { prisma } from '../src/lib/prisma'

async function main(){const server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}/api`,suffix=Date.now(),businesses:string[]=[]
 const request=async(method:string,path:string,body?:object,token?:string)=>{const response=await fetch(`${base}${path}`,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return{status:response.status,body:await response.json() as any}}
 const register=async(label:string)=>{const password=`Qa-${randomBytes(12).toString('base64url')}9!`;const result=await request('POST','/auth/register',{firstName:'QA',lastName:label,email:`simple-${label}-${suffix}@example.com`,password,businessName:`Simple ${label}`});assert.equal(result.status,201);businesses.push(result.body.user.business.id);return result.body.token as string}
 try{const tokenA=await register('A'),tokenB=await register('B');const clientA=(await request('POST','/clients',{name:'Cliente QA A',phone:'1111111111'},tokenA)).body;const clientB=(await request('POST','/clients',{name:'Cliente QA B',phone:'2222222222'},tokenB)).body
  const input={deviceBrand:'Infinix',deviceModel:'Note 40',issue:'No enciende',total:25000}
  assert.equal((await request('POST','/repairs',input,tokenA)).status,400)
  assert.equal((await request('POST','/repairs',{...input,clientId:'inexistente'},tokenA)).status,404)
  assert.equal((await request('POST','/repairs',{...input,clientId:clientB.id},tokenA)).status,404)
  const created=await request('POST','/repairs',{...input,clientId:clientA.id,color:'Negro'},tokenA);assert.equal(created.status,201);assert.equal(created.body.clientId,clientA.id);assert.equal(created.body.deviceId,null);assert.equal(created.body.deviceBrand,'Infinix')
  const detail=await request('GET',`/clients/${clientA.id}`,undefined,tokenA);assert.ok(detail.body.repairs.some((repair:{id:string})=>repair.id===created.body.id));console.log('SIMPLIFIED REPAIRS TESTS PASSED: required existing client, tenant isolation, free brand and client history')
 }finally{for(const businessId of businesses)await prisma.$transaction([prisma.repairStatusHistory.deleteMany({where:{repair:{businessId}}}),prisma.repairPhoto.deleteMany({where:{repair:{businessId}}}),prisma.payment.deleteMany({where:{businessId}}),prisma.cashMovement.deleteMany({where:{businessId}}),prisma.repair.deleteMany({where:{businessId}}),prisma.device.deleteMany({where:{businessId}}),prisma.client.deleteMany({where:{businessId}}),prisma.passwordResetToken.deleteMany({where:{user:{businessId}}}),prisma.user.deleteMany({where:{businessId}}),prisma.business.deleteMany({where:{id:businessId}})]);await prisma.$disconnect();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}}
main().catch(error=>{console.error(error);process.exitCode=1})

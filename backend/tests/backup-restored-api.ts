import assert from 'node:assert/strict'
import { connectLocal } from '../scripts/backup/safety.mjs'
const url=new URL(process.env.DATABASE_URL??'')
assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/^\/tecnodesk_backup_test_[a-z0-9]{6,40}$/);assert.equal(process.env.BACKUP_DISPOSABLE,'true')
assert.equal(url.protocol,'postgresql:');assert.equal(url.username,'postgres');assert.equal(url.password,'');assert.equal(url.search,'');assert.equal(url.hash,'')
process.env.DOTENV_CONFIG_PATH='security9-no-dotenv-file'
process.env.NODE_ENV='test';process.env.ORIGIN_AUTH_ENABLED='false';process.env.CLIENT_IP_MODE='baseline';process.env.JWT_SECRET='security9-fictitious-local-jwt'
async function main(){
 const verified=await connectLocal({host:url.hostname,port:Number(url.port),database:url.pathname.slice(1),user:url.username,password:'',disposable:true});await verified.client.end()
 const {app}=await import('../src/app');const {prisma}=await import('../src/lib/prisma');const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`
 try{
  const health=await fetch(base+'/api/health');assert.equal(health.status,200);await health.text()
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner0@backup.example.test',password:'Synthetic9!Password'})});assert.equal(login.status,200);const body=await login.json() as any;const token=body.token;assert.equal(typeof token,'string')
  const request=async(path:string,expected:number)=>{const r=await fetch(base+path,{headers:{authorization:`Bearer ${token}`}});assert.equal(r.status,expected);return r.json()}
  const clients=await request('/api/clients',200) as any;assert.ok(JSON.stringify(clients).includes('Fictitious customer'))
  await request('/api/repairs',200);await request('/api/cash/movements',200)
  const other=await prisma.repair.findFirstOrThrow({where:{business:{slug:'backup-synthetic-1'}}});await request('/api/repairs/'+other.id,404)
  const own=await prisma.repair.findFirstOrThrow({where:{business:{slug:'backup-synthetic-0'}}});const detail=await request('/api/repairs/'+own.id,200) as any;assert.equal(detail.total,98765);assert.equal(detail.paid,12345)
  const noJwt=await fetch(base+'/api/clients');assert.equal(noJwt.status,401);await noJwt.text()
  console.log('PASS restored backend health/login/clients/repairs/cash and cross-workshop denial (synthetic only)')
 }finally{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect()}
}
main().catch(()=>{console.error('Restored synthetic API validation failed');process.exitCode=1})

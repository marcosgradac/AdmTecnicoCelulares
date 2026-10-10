// Loopback HTTP, real Express app, mocked Prisma; no production data or network.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { request, type IncomingHttpHeaders } from 'node:http'
const enabled = !['disabled', 'default'].includes(process.argv[2])
const secret = randomBytes(32).toString('hex')
Object.assign(process.env, { NODE_ENV:'test', DOTENV_CONFIG_PATH:'origin-auth-tests-no-env-file', MAIL_MODE:'console', JWT_SECRET:'origin-isolated-only', DATABASE_URL:'postgresql://test:test@127.0.0.1:1/never_connected', CLIENT_IP_MODE:'baseline', RATE_LIMIT_GLOBAL_MAX:'1', ORIGIN_AUTH_ENABLED:enabled?'true':'false', ORIGIN_AUTH_SECRET:secret, CORS_ORIGINS:'https://frontend.example.test', PUBLIC_API_ORIGIN:'https://api.example.test' })
if (process.argv[2] === 'default') delete process.env.ORIGIN_AUTH_ENABLED
async function main() {
 const [{app},{prisma}] = await Promise.all([import('../src/server'),import('../src/lib/prisma')])
 let queries=0
 const originals={query:prisma.$queryRaw,repair:prisma.repair.findUnique,business:prisma.business.findUnique}
 prisma.$queryRaw=(async()=>{queries++;return []}) as typeof originals.query
 prisma.repair.findUnique=(async()=>{queries++;return {trackingEnabled:true,trackingExpiresAt:null,business:{id:'fixture',name:'Taller <ficticio>',logoUrl:'data:image/png;base64,aGVsbG8='}}}) as typeof originals.repair
 prisma.business.findUnique=(async()=>{queries++;return {logoUrl:'data:image/png;base64,aGVsbG8='}}) as typeof originals.business
 const logs:unknown[][]=[]; const originalLogs={log:console.log,warn:console.warn,error:console.error}
 console.log=console.warn=console.error=(...args:unknown[])=>{logs.push(args)}
 const server=app.listen(0,'127.0.0.1'); await new Promise<void>(done=>server.once('listening',done))
 const port=(server.address() as {port:number}).port; const responses:string[]=[]
 const send=(path:string,headers:Record<string,string|string[]>|string[]={},method='GET',body?:string)=>new Promise<{status:number;headers:IncomingHttpHeaders;body:string}>((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port,path,method,headers},res=>{let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk});res.on('end',()=>{responses.push(JSON.stringify(res.headers)+text);resolve({status:res.statusCode!,headers:res.headers,body:text})})});req.on('error',reject);req.end(body)
 })
 const auth={'X-TecnoDesk-Origin-Auth':secret}
 try {
  const health=await send('/health');assert.equal(health.status,200);assert.equal(JSON.parse(health.body).ok,true);assert.equal(queries,0)
  if(enabled){
   const rejectedHeaders:(Record<string,string|string[]>|string[])[]=[{}, {'X-TecnoDesk-Origin-Auth':'0'.repeat(64)}, {'X-TecnoDesk-Origin-Auth':[secret,secret]}, {'X-TecnoDesk-Origin-Auth':[secret,'0'.repeat(64)]}, {'X-TecnoDesk-Origin-Auth':secret+','+secret}, {'X-TecnoDesk-Origin-Auth':'short'}, ['Host','127.0.0.1','X-TecnoDesk-Origin-Auth',secret,'x-tecnodesk-origin-auth',secret], {'CF-Connecting-IP':'192.0.2.1','X-Forwarded-For':'192.0.2.2','User-Agent':'WhatsApp'}]
   for(const headers of rejectedHeaders){const r=await send('/api/health',headers);assert.equal(r.status,403,'Untrusted requests must not enter readiness');assert.equal(r.headers['access-control-allow-origin'],undefined);assert.equal(r.headers['cache-control'],'no-store');assert.equal(queries,0)}
   assert.equal((await send('/api/auth/login',{'Content-Type':'application/json',Origin:'https://disallowed.example.test'},'POST','{')).status,403)
   const blocked=await send('/api/auth/login',{Origin:'https://frontend.example.test','Access-Control-Request-Method':'POST'},'OPTIONS');assert.equal(blocked.status,403);assert.equal(blocked.headers['access-control-allow-origin'],undefined)
   assert.equal((await send('/health',{},'HEAD')).status,403);assert.equal((await send('/health/')).status,403)
  }else{assert.equal((await send('/api/health')).status,200);assert.equal(queries,1)}
  assert.equal((await send('/api/auth/login',{...auth,'Content-Type':'application/json'},'POST','{')).status,400,'Authorized traffic still reaches the existing JSON parser')
  const ready=await send('/api/health',auth);assert.equal(ready.status,200);assert.equal(JSON.parse(ready.body).ok,true)
  const options=await send('/api/auth/login',{...auth,Origin:'https://frontend.example.test','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization,Content-Type,X-Turnstile-Token'},'OPTIONS');assert.equal(options.status,204);assert.equal(options.headers['access-control-allow-origin'],'https://frontend.example.test');assert.match(String(options.headers['access-control-allow-headers']),/X-Turnstile-Token/i)
  const preview=await send('/api/tracking-preview/AbCdEf012345_-xy?clientSlug=ficticio',auth);assert.equal(preview.status,200);assert.match(preview.body,/Taller &lt;ficticio&gt;/);assert.ok(preview.body.includes('https://api.example.test/api/business-logo/fixture'));assert.ok(preview.body.includes('https://www.tecnodeskpro.com/s/ficticio/AbCdEf012345_-xy'));assert.equal(preview.headers['cache-control'],'no-store')
  const image=await send('/api/business-logo/fixture',auth);assert.equal(image.status,200);assert.match(String(image.headers['content-type']),/image\/png/)
  if(enabled){const before=queries;assert.equal((await send('/api/tracking-preview/AbCdEf012345_-xy')).status,403);assert.equal((await send('/api/business-logo/fixture')).status,403);assert.equal(queries,before)}
  assert.ok(!responses.join('').includes(secret),'Responses must not expose the credential');assert.ok(!JSON.stringify(logs).includes(secret),'Logs must not expose the credential')
 }finally{Object.assign(console,originalLogs);prisma.$queryRaw=originals.query;prisma.repair.findUnique=originals.repair;prisma.business.findUnique=originals.business;await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await prisma.$disconnect()}
 console.log(`Origin auth HTTP ${enabled?'enabled':'disabled'}: OK`)
}
main().catch(error=>{console.error(error instanceof assert.AssertionError ? {message:error.message,actual:error.actual,expected:error.expected} : 'Origin auth HTTP failed; details suppressed');process.exitCode=1})

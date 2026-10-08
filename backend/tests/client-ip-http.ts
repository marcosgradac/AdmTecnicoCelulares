// Whole server, loopback only. Prisma and Turnstile are mocked before any requests.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
process.env.NODE_ENV='test'
process.env.JWT_SECRET='client-identity-isolated-only'
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:1/never_connected'
process.env.CLIENT_IP_MODE='cf'
process.env.CLIENT_IP_CF_TRUST_ACK='render-public-web-service'
process.env.CLIENT_IP_INVALID_MAX='3'
process.env.RATE_LIMIT_TRACKING_PREVIEW_MAX='2'
process.env.RATE_LIMIT_TRACKING_PREVIEW_CF_MAX='4'
process.env.RATE_LIMIT_LOGIN_IP_MAX='1'
process.env.RATE_LIMIT_SIGNUP_MAX='1'
process.env.RATE_LIMIT_PUBLIC_TRACKING_MAX='2'
process.env.RATE_LIMIT_HEALTH_MAX='1'
process.env.RATE_LIMIT_GLOBAL_MAX='3'
async function main(){
 const [{app},{prisma},{trackingRisk}]=await Promise.all([import('../src/server'),import('../src/lib/prisma'),import('../src/middlewares/security')])
 const originals={find:prisma.repair.findUnique,query:prisma.$queryRaw,warn:console.warn,fetch:globalThis.fetch}
 let queries=0;let healthQueries=0;let remoteIp='';const warnings:any[]=[]
 prisma.repair.findUnique=(async()=>{queries++;return {id:'fixture',trackingEnabled:true,trackingExpiresAt:null,status:'RECEIVED',business:{id:'fixture',name:'Taller <local>',logoUrl:null},createdAt:new Date('2026-01-01')}}) as typeof originals.find
 prisma.$queryRaw=(async()=>{healthQueries++;return []}) as typeof originals.query
 console.warn=(...args:unknown[])=>warnings.push(args)
 const nativeFetch=globalThis.fetch
 globalThis.fetch=(async(input:any,init:any)=>{
  if(String(input)==='https://challenges.cloudflare.com/turnstile/v0/siteverify'){
   remoteIp=new URLSearchParams(init.body).get('remoteip')??''
   return new Response(JSON.stringify({success:true}),{status:200})
  }
  if(!String(input).startsWith('http://127.0.0.1:'))throw new Error('External traffic forbidden')
  return nativeFetch(input,init)
 }) as typeof fetch
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(done=>server.once('listening',done))
 const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`
 const tokens=['AbCdEf012345_-xy','aB'.repeat(32),'0123456789abcdef','FEDCBA9876543210']
 const get=(path:string,ip?:string,extra:Record<string,string>={})=>fetch(base+path,{headers:{...(ip?{'CF-Connecting-IP':ip}:{}),...extra}})
 const preview=(token:string,ip:string,extra:Record<string,string>={})=>get('/api/tracking-preview/'+token+'?clientSlug=cliente',ip,extra)
 try{
  const before=queries
  for(const header of [undefined,'bad','192.0.2.1, 192.0.2.2'])assert.equal((await get('/api/tracking-preview/'+tokens[0],header,{'X-Forwarded-For':'192.0.2.99'})).status,400)
  assert.equal(queries,before)
  // Repeated invalid requests cannot reach Prisma or rotate the reject budget with XFF.
  for(const header of [undefined,'invalid-again','192.0.2.1, 192.0.2.2']){
   const rejected=await get('/api/tracking-preview/'+tokens[1],header,{'X-Forwarded-For':'192.0.2.'+(20+queries),'User-Agent':'WhatsApp'})
   assert.equal(rejected.status,429);assert.ok(Number(rejected.headers.get('retry-after'))>0)
   assert.equal(rejected.headers.get('cache-control'),'no-store')
   assert.equal(rejected.headers.get('x-robots-tag'),'noindex, nofollow, noarchive')
   assert.deepEqual(await rejected.json(),{success:false,message:'Solicitud inválida.'})
  }
  const invalidBody=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:'malformed-json'})
  assert.equal(invalidBody.status,429,'Invalid CF is rejected even before the JSON parser')
  assert.equal(queries,before);assert.equal(healthQueries,0);assert.equal(remoteIp,'');assert.equal(warnings.length,0)
  // Valid shared-proxy traffic remains allowed despite saturation of invalid-header guard.
  // Shared Vercel/crawler egress: different links use separate pair budgets but one total budget.
  for(let i=0;i<2;i++){const r=await preview(tokens[0],'192.0.2.1',{'User-Agent':'WhatsApp'});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(await r.text(),/og:title/)}
  assert.equal((await preview(tokens[0],'192.0.2.1')).status,429)
  for(let i=0;i<1;i++)assert.equal((await preview(tokens[1],'192.0.2.1')).status,200)
  const frozen=queries
  const blocked=await preview(tokens[2],'192.0.2.1',{'X-Forwarded-For':'192.0.2.9','User-Agent':'facebookexternalhit'})
  assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('retry-after'))>0);assert.equal(queries,frozen)
  assert.equal((await preview(tokens[0],'192.0.2.2')).status,200)
  assert.equal(warnings.length,0,'Preview never logs tokens/IPs')
  // Malformed tokens consume limits without touching Prisma.
  const invalidBefore=queries
  for(let i=0;i<2;i++)assert.equal((await preview('invalid','192.0.2.3')).status,200)
  assert.equal((await preview('invalid','192.0.2.3')).status,429);assert.equal(queries,invalidBefore)
  for(let i=0;i<2;i++)assert.equal((await preview(tokens[0],'2001:db8:1200:1::1')).status,200)
  assert.equal((await preview(tokens[0],'2001:db8:1200:2::2')).status,429)
  assert.equal((await preview(tokens[0],'2001:db8:1300::1')).status,200)
  // Native req.ip is the loopback socket in cf; log and limiter must use selected CF instead.
  const loginHeaders={'content-type':'application/json','CF-Connecting-IP':'198.51.100.1'}
  assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:loginHeaders,body:'{}'})).status,401)
  assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:{...loginHeaders,'X-Forwarded-For':'198.51.100.99'},body:'{}'})).status,429)
  assert.equal(warnings.at(-1)[1].ipHash,createHash('sha256').update('client-identity-isolated-only:198.51.100.1').digest('hex').slice(0,16))
  assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:{...loginHeaders,'CF-Connecting-IP':'198.51.100.2'},body:'{}'})).status,401)
  const registerHeaders={'content-type':'application/json','CF-Connecting-IP':'198.51.100.10'}
  assert.equal((await fetch(base+'/api/auth/register',{method:'POST',headers:registerHeaders,body:'{}'})).status,400)
  assert.equal((await fetch(base+'/api/auth/register',{method:'POST',headers:{...registerHeaders,'X-Forwarded-For':'198.51.100.99'},body:'{}'})).status,429)
  assert.equal((await fetch(base+'/api/auth/register',{method:'POST',headers:{...registerHeaders,'CF-Connecting-IP':'198.51.100.11'},body:'{}'})).status,400)
  // Liveness and OPTIONS bypass IP validation; readiness does not bypass it.
  assert.equal((await get('/health')).status,200)
  assert.equal((await fetch(base+'/api/auth/login',{method:'OPTIONS',headers:{Origin:'http://localhost:5173','Access-Control-Request-Method':'POST'}})).status,204)
  assert.equal((await get('/api/health')).status,429);assert.equal(healthQueries,0)
  assert.equal((await get('/api/health','203.0.113.1')).status,200)
  assert.equal((await get('/api/health','203.0.113.1')).status,429);assert.equal(healthQueries,1)
  const originalError=console.error; console.error=()=>{}
  try{
   prisma.$queryRaw=(async()=>{healthQueries++;throw new Error('mock-only-unavailable')}) as typeof originals.query
   const unavailable=await get('/api/health','203.0.113.4')
   assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).ok,false)
   assert.equal((await get('/health')).status,200)
  }finally{console.error=originalError}
  // Force real tracking route's captcha path; Siteverify is intercepted in memory.
  for(let i=0;i<10;i++)trackingRisk.miss('203.0.113.2')
  const tracked=await get('/api/tracking/'+tokens[0],'203.0.113.2',{'x-turnstile-token':'invented-local-only'})
  assert.equal(tracked.status,200);assert.equal(remoteIp,'203.0.113.2');assert.equal(trackingRisk.get('203.0.113.2').count,0)
  for(let i=0;i<2;i++)assert.equal((await get('/api/tracking/'+tokens[0],'203.0.113.3')).status,200)
  assert.equal((await get('/api/tracking/'+tokens[0],'203.0.113.3',{'X-Forwarded-For':'203.0.113.99'})).status,429)
  assert.equal((await get('/api/tracking/'+tokens[1],'203.0.113.3')).status,429,'Global limiter also rejects a token-bearing tracking URL')
  assert.equal((await get('/api/isolated-global-probe','203.0.113.3')).status,429,'Normal API global budget is exhausted')
  for (const name of ['PUBLIC_TRACKING_ABUSE','RATE_LIMIT_HIT']) {
   assert.ok(warnings.some(([event, details])=>event===name && details.endpoint==='GET /api/tracking/:token'),name+' must log only the tracking route template')
  }
  const serializedWarnings=JSON.stringify(warnings)
  for(const token of tokens)assert.ok(!serializedWarnings.includes(token),'Security logs must never contain tracking tokens')
  const beforeIndependentPreview=queries
  assert.equal((await preview(tokens[0],'203.0.113.3')).status,200,'Preview is outside the exhausted global budget')
  assert.equal(queries,beforeIndependentPreview+1,'Preview protection must come from its own limits, not the global limiter')
  // Risk accounting also groups IPv6 /56 and reaches the selected-IP captcha path.
  for(let i=0;i<10;i++)trackingRisk.miss('2001:db8:1400::/56')
  const trackedV6=await get('/api/tracking/'+tokens[1],'2001:db8:1400:2::2',{'x-turnstile-token':'invented-local-only'})
  assert.equal(trackedV6.status,200);assert.equal(remoteIp,'2001:db8:1400:2::2');assert.equal(trackingRisk.get('2001:db8:1400::/56').count,0)
  // Token fixtures keep expiry/disabled semantics and fallback metadata unchanged.
  for(const fixture of [null,{trackingEnabled:false},{trackingEnabled:true,trackingExpiresAt:new Date(0)}]){
   prisma.repair.findUnique=(async()=>{queries++;return fixture}) as typeof originals.find
   const previewFallback=await preview(tokens[0],'203.0.113.'+(10+queries))
   assert.equal(previewFallback.status,200);assert.match(await previewFallback.text(),/TecnoDesk/)
  }
  assert.ok(!JSON.stringify(warnings).includes('invented-local-only'))
  console.log('CLIENT IP HTTP PASSED: mocked Prisma/Turnstile, CF validation, OG, shared-egress tiers, IPv6/NAT, logs, login, readiness, preflight and tracking budgets.')
 }finally{
  globalThis.fetch=originals.fetch;console.warn=originals.warn;prisma.repair.findUnique=originals.find;prisma.$queryRaw=originals.query
  await new Promise<void>(done=>server.close(()=>done()));await prisma.$disconnect()
 }
}
main().catch(error=>{console.error(error);process.exitCode=1})

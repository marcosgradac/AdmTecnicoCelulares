// Real Express server on loopback; Prisma mocked before requests. No external data.
import assert from 'node:assert/strict'
process.env.NODE_ENV='test'
process.env.CLIENT_IP_MODE='baseline'
process.env.JWT_SECRET='baseline-preview-isolated-only'
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:1/never_connected'
process.env.RATE_LIMIT_TRACKING_PREVIEW_MAX='30'
process.env.RATE_LIMIT_TRACKING_PREVIEW_BASELINE_LINK_MAX='10'
process.env.RATE_LIMIT_TRACKING_PREVIEW_BASELINE_PROCESS_MAX='80'
process.env.RATE_LIMIT_GLOBAL_MAX='6'
process.env.RATE_LIMIT_LOGIN_IP_MAX='1'
process.env.RATE_LIMIT_SIGNUP_MAX='1'
process.env.RATE_LIMIT_PUBLIC_TRACKING_MAX='2'
async function main(){
 const [{app},{prisma}]=await Promise.all([import('../src/server'),import('../src/lib/prisma')])
 const originalFind=prisma.repair.findUnique,originalWarn=console.warn
 const warnings:unknown[][]=[];let queries=0
 const fixture={id:'invented',trackingEnabled:true,trackingExpiresAt:null,status:'RECEIVED',business:{id:'invented',name:'Taller <local>',logoUrl:null},createdAt:new Date('2026-01-01')}
 prisma.repair.findUnique=(async()=>{queries++;return fixture}) as typeof originalFind
 console.warn=(...args)=>{warnings.push(args)}
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(done=>server.once('listening',done))
 const {port}=server.address() as {port:number};const base=`http://127.0.0.1:${port}`
 const tokens=['AbCdEf012345_-xy','aB'.repeat(32),'0123456789abcdef']
 const get=(token:string,ip='192.0.2.1',extra:Record<string,string>={})=>fetch(`${base}/api/tracking-preview/${token}?clientSlug=fixture`,{headers:{'X-Forwarded-For':ip,...extra}})
 const blocked=async(response:Response)=>{
  assert.equal(response.status,429);assert.ok(Number(response.headers.get('retry-after'))>0)
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive')
  const body=await response.text();for(const token of tokens){assert.ok(!body.includes(token));assert.ok(!JSON.stringify(Array.from(response.headers)).includes(token))}
 }
 try{
  for(let i=0;i<10;i++)assert.equal((await get(tokens[0])).status,200)
  const repeated:Response[]=[]
  for(let i=0;i<20;i++)repeated.push(await get(tokens[0],'192.0.2.1',{'X-Forwarded-For':`198.51.100.${i+1}, 192.0.2.1`,'CF-Connecting-IP':`203.0.113.${i+1}`,'User-Agent':'WhatsApp'}))
  const nextLink=await get(tokens[1])
  assert.equal(nextLink.status,200,'A different link behind the shared baseline IP retains admission after abuse of A')
  for(const response of repeated)await blocked(response)
  assert.equal(queries,11,'Rejected link abuse never reaches Prisma or charges shared admission');assert.match(await nextLink.text(),/og:title/)
  for(let i=0;i<9;i++)assert.equal((await get(tokens[1])).status,200)
  for(let i=0;i<10;i++)assert.equal((await get(tokens[2])).status,200)
  await blocked(await get('FEDCBA9876543210'));assert.equal(queries,30,'Aggregate stays 30/IP')
  for(let i=0;i<30;i++)assert.equal((await get(`invalid-${i}`,'192.0.2.2')).status,200)
  const beforeInvalid=queries;await blocked(await get('invalid-31','192.0.2.2'));assert.equal(queries,beforeInvalid)
  for(const [endpoint,firstStatus] of [['login',401],['register',400]] as const){
   const headers={'X-Forwarded-For':'192.0.2.1','Content-Type':'application/json'}
   assert.equal((await fetch(`${base}/api/auth/${endpoint}`,{method:'POST',headers,body:'{}'})).status,firstStatus)
   assert.equal((await fetch(`${base}/api/auth/${endpoint}`,{method:'POST',headers,body:'{}'})).status,429)
  }
  for(let i=0;i<2;i++)assert.equal((await fetch(`${base}/api/tracking/${tokens[0]}`,{headers:{'X-Forwarded-For':'192.0.2.3'}})).status,200)
  assert.equal((await fetch(`${base}/api/tracking/${tokens[0]}`,{headers:{'X-Forwarded-For':'192.0.2.3'}})).status,429)
  let release!:()=>void,ready!:()=>void,starts=0
  const held=new Promise<void>(done=>{release=done}),started=new Promise<void>(done=>{ready=done})
  prisma.repair.findUnique=(async()=>{starts++;queries++;if(starts===4)ready();await held;return fixture}) as typeof originalFind
  const pending=Array.from({length:4},(_,i)=>get(tokens[0],`198.51.100.${i+1}`))
  try{await started;for(let i=0;i<3;i++)await blocked(await get(tokens[1],'198.51.100.10'));assert.equal(starts,4,'Reject before Prisma')}
  finally{release();await Promise.all(pending)}
  prisma.repair.findUnique=(async()=>{queries++;return fixture}) as typeof originalFind
  for(let i=0;i<10;i++)assert.equal((await get(tokens[1],'198.51.100.10')).status,200)
  await blocked(await get(tokens[1],'198.51.100.10'))
  // 60 admissions + 4 held + 10 after release = 74; process ceiling 80.
  for(let i=0;i<6;i++)assert.equal((await get(`invalid-process-${i}`,'203.0.113.1')).status,200)
  const beforeProcess=queries;await blocked(await get(tokens[2],'203.0.113.2'));assert.equal(queries,beforeProcess)
  for(const token of tokens)assert.ok(!JSON.stringify(warnings).includes(token),'No preview tokens in logs')
  console.log('BASELINE PREVIEW HTTP PASSED: shared links, invalid rotation, independent routes, capacity, privacy; mocks only.')
 }finally{prisma.repair.findUnique=originalFind;console.warn=originalWarn;await new Promise<void>((done,fail)=>server.close(error=>error?fail(error):done()));await prisma.$disconnect()}
}
main().catch(error=>{console.error(error);process.exitCode=1})

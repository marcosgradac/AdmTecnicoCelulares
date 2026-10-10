// Loopback HTTP and controlled promises only: no Prisma, external services or real data.
import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import express from 'express'
import { createClientIpMiddleware } from '../src/middlewares/client-ip'
import { createTrackingPreviewProtection, PreviewCapacityError, rejectTrackingPreview } from '../src/middlewares/tracking-preview-protection'

const baseline = process.argv.includes('baseline')

type Options = Parameters<typeof createTrackingPreviewProtection>[0]
const defaults: Options = { windowMs: 60000, linkMax: 2, ipMax: 6, globalMax: 10 }
async function fixture(t: TestContext, options: Partial<Options> = {}, now?: () => number, query?: () => Promise<string>) {
  const guard = createTrackingPreviewProtection({ ...defaults, ...options }, now)
  const app = express(); app.set('trust proxy', baseline ? 1 : false); app.use(createClientIpMiddleware({ mode: baseline ? 'baseline' : 'cf' }))
  let queries = 0
  app.get('/probe/:token', guard.middleware, async (_req, res) => {
    try { const result = await guard.runLookup(() => { queries++; return query ? query() : Promise.resolve('metadata') }); res.json({ ok: true, result }) }
    catch (error) { if (error instanceof PreviewCapacityError) rejectTrackingPreview(res, 1); else res.status(503).json({ ok: false }) }
  })
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(done => server.once('listening', done))
  t.after(() => new Promise<void>(done => server.close(() => done())))
  const address = server.address() as { port: number }
  const get = (token: string, ip = '192.0.2.1', extra: Record<string,string> = {}, signal?: AbortSignal) =>
    fetch(`http://127.0.0.1:${address.port}/probe/${token}`, { headers: baseline
      ? { 'CF-Connecting-IP': '203.0.113.99', ...extra, 'X-Forwarded-For': `${extra['X-Forwarded-For'] ?? '198.51.100.99'}, ${ip}` }
      : { 'CF-Connecting-IP': ip, ...extra }, signal })
  return { guard, get, queries: () => queries }
}
test('one abused link does not consume the shared IP/process budget for other links', async t => {
  const f = await fixture(t)
  for(let i=0;i<2;i++) assert.equal((await f.get('A')).status,200)
  for(let i=0;i<20;i++) {
    const rejected = await f.get('A','192.0.2.1',{'X-Forwarded-For':'198.51.100.'+(i+1),'User-Agent':'WhatsApp'})
    assert.equal(rejected.status,429); assert.ok(Number(rejected.headers.get('retry-after'))>0)
    assert.equal(rejected.headers.get('cache-control'),'no-store')
    assert.equal(rejected.headers.get('x-robots-tag'),'noindex, nofollow, noarchive')
  }
  assert.equal(f.queries(),2); assert.equal(f.guard.state().accepted,2)
  for(const token of ['B','B','C','C']) assert.equal((await f.get(token)).status,200)
  assert.equal((await f.get('D')).status,429,'Rotating links cannot evade aggregate IP admission')
  assert.equal(f.queries(),6); assert.equal(f.guard.state().accepted,6)
  assert.equal((await f.get('D','192.0.2.2')).status,200,'Another IP has independent IP budget')
})
test('different IPs and links cannot exceed the process ceiling before simulated DB', async t => {
  const f = await fixture(t,{globalMax:3})
  for(let i=1;i<=3;i++) assert.equal((await f.get('link'+i,'192.0.2.'+i)).status,200)
  assert.equal((await f.get('link4','192.0.2.4')).status,429)
  assert.equal(f.queries(),3); assert.equal(f.guard.state().accepted,3)
})
test('bounded memory fails closed without eviction; monotonic window resets', async t => {
  let clock=0
  const f=await fixture(t,{maxEntries:3},()=>clock)
  assert.equal((await f.get('A')).status,200) // IP + pair = 2 entries
  assert.equal((await f.get('B')).status,200) // same IP + another pair = 3
  for(let i=0;i<20;i++) assert.equal((await f.get('new'+i)).status,429)
  assert.equal(f.guard.state().entries,3); assert.equal(f.queries(),2)
  assert.equal((await f.get('A')).status,200,'Existing entry still has remaining budget')
  assert.equal((await f.get('A')).status,429,'No eviction/reset bypass')
  clock=59500; assert.equal((await f.get('C')).headers.get('retry-after'),'1')
  clock=60000; assert.equal((await f.get('C')).status,200)
  assert.deepEqual(f.guard.state(),{entries:2,accepted:1,active:0})
})
test('query concurrency has no queue and releases slots on success/error', async () => {
  const guard=createTrackingPreviewProtection({...defaults,maxConcurrent:2})
  let resolve!: (value:string)=>void, reject!: (reason:Error)=>void
  const a=guard.runLookup(()=>new Promise<string>(done=>{resolve=done}))
  const b=guard.runLookup(()=>new Promise<string>((_done,fail)=>{reject=fail}))
  let extraQueries=0
  await assert.rejects(guard.runLookup(async()=>{extraQueries++;return 'extra'}),PreviewCapacityError)
  assert.equal(extraQueries,0); assert.equal(guard.state().active,2)
  resolve('ok'); assert.equal(await a,'ok'); assert.equal(guard.state().active,1)
  const failed=assert.rejects(b,/simulated DB failure/); reject(new Error('simulated DB failure')); await failed
  assert.equal(guard.state().active,0)
  assert.equal(await guard.runLookup(async()=> 'next'),'next')
})
test('HTTP disconnect cannot free a slot while the DB promise is still pending', async t => {
  let resolve!: (value:string)=>void, started!: ()=>void
  const pending=new Promise<string>(done=>{resolve=done})
  const ready=new Promise<void>(done=>{started=done})
  let first=true
  const f=await fixture(t,{maxConcurrent:1},undefined,()=>{if(first){first=false;started();return pending}return Promise.resolve('next')})
  const abort=new AbortController()
  const request=f.get('A','192.0.2.1',{},abort.signal)
  const aborted=assert.rejects(request,/abort/i)
  await ready; abort.abort(); await aborted
  assert.equal((await f.get('B')).status,429)
  assert.equal(f.queries(),1); assert.equal(f.guard.state().active,1)
  resolve('done'); await pending; await new Promise<void>(done=>setImmediate(done))
  assert.equal(f.guard.state().active,0)
  assert.equal((await f.get('C')).status,200); assert.equal(f.queries(),2)
})
test('capacity rejections preserve link, IP and process budgets until a lookup can enter', async t => {
  let release!: (value:string)=>void, started!: ()=>void
  const pending=new Promise<string>(done=>{release=done})
  const ready=new Promise<void>(done=>{started=done})
  let first=true
  const f=await fixture(t,{maxConcurrent:1,linkMax:2,ipMax:3,globalMax:3},undefined,()=>{
    if(first){first=false;started();return pending}
    return Promise.resolve('legitimate')
  })
  const held=f.get('A')
  try {
    await ready
    const before=f.guard.state()
    for(const [token,ip] of [['B','192.0.2.1'],['B','192.0.2.1'],['C','192.0.2.2']]) {
      const rejected=await f.get(token,ip)
      assert.equal(rejected.status,429); assert.equal(rejected.headers.get('retry-after'),'1')
      assert.deepEqual(f.guard.state(),before,'Capacity rejects must not create entries or charge any budget')
      assert.equal(f.queries(),1)
    }
  } finally {release('done');await held}
  assert.equal((await f.get('B')).status,200,'Shared IP/process budgets remain available')
  assert.equal((await f.get('B')).status,200,'The rejected link retains its full two-request budget')
  assert.equal(f.queries(),3);assert.equal(f.guard.state().accepted,3)
  assert.equal((await f.get('B')).status,429,'Normal limits still apply after capacity is released')
})
test('configuration rejects invalid admission/capacity limits',()=>{
  for(const field of ['windowMs','linkMax','ipMax','globalMax','maxEntries','maxConcurrent']) {
    for(const value of [0,-1,1.5,NaN]) assert.throws(()=>createTrackingPreviewProtection({...defaults,[field]:value}))
  }
})
const assert=require('node:assert/strict')
const {chromium}=require('playwright')
const {readFileSync}=require('node:fs')
const payload='<img src=x onerror="window.__security8Executed=true"><svg onload="window.__security8Executed=true"></svg>'
const user={id:'owner-xss-test',fullName:payload,firstName:payload,lastName:'Synthetic',email:'owner@example.test',role:'OWNER',platformRole:'USER',termsAccepted:true,privacyAccepted:true,profileComplete:true,tutorialSeen:true,permissions:[],business:{id:'b1',name:payload,logoUrl:null}}
const client={id:'c1',name:payload,phone:'12345678',createdAt:'2026-10-01T12:00:00Z',repairCount:1,lastRepair:null}
const repair={id:'r1',number:1001,clientId:'c1',client,deviceBrand:payload,deviceModel:payload,issue:payload,diagnosis:payload,notes:payload,color:payload,imei:payload,status:'RECEIVED',total:100,paid:0,partsCost:0,laborCharge:100,trackingToken:'synthetic-token',trackingEnabled:true,warrantyEnabled:false,warrantyDurationDays:null,estimatedDeliveryDate:null,createdAt:'2026-10-01T12:00:00Z',updatedAt:'2026-10-01T12:00:00Z',payments:[],statusHistory:[{id:'h1',newStatus:'RECEIVED',publicMessage:payload,internalNote:payload,createdAt:'2026-10-01T12:00:00Z'}],business:{name:payload,logoUrl:null}}
async function main(){
 process.env.VITE_API_URL='http://127.0.0.1:3000'
 const {createServer}=await import('vite')
 const config=JSON.parse(readFileSync('vercel.json','utf8'))
 const headers=Object.fromEntries(config.headers.find(rule=>rule.source==='/(.*)').headers.map(h=>[h.key,h.value]))
 const server=await createServer({server:{host:'127.0.0.1',port:0,headers},mode:'test'})
 await server.listen()
 const origin=`http://127.0.0.1:${server.httpServer.address().port}`
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})})
 let failures=0,checks=0
 const probe=async(name,run)=>{try{await run();checks++;console.log('PASS '+name)}catch(e){failures++;console.error('FAIL '+name+': '+e.message)}}
 try{
  const context=await browser.newContext()
  // Network is confined to the disposable local app/API. No real image, email or CAPTCHA calls.
  await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort())
  await context.addInitScript(()=>localStorage.setItem('cellufix_access_token','synthetic-session'))
  let resetRequest
  await context.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname
   let data=path==='/api/auth/me'?user:path==='/api/clients'?{items:[client],total:1,page:1,pageSize:10,pages:1}:path.startsWith('/api/repairs/')||path.startsWith('/api/tracking/')?repair:{message:'Synthetic success'}
   if(path==='/api/auth/reset-password')resetRequest=route.request().postDataJSON()
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
  })
  for(const view of ['clients','repair','tracking'])await probe('React escapes HTML, SVG and attributes in '+view,async()=>{
   const page=await context.newPage()
   await page.goto(origin+'/tests/browser-hardening.html?view='+view,{waitUntil:'domcontentloaded'})
   await page.getByText(payload,{exact:true}).first().waitFor()
   assert.equal(await page.evaluate(()=>Boolean(window.__security8Executed)),false)
   assert.equal(await page.locator('[onerror],[onload]').count(),0)
   assert.equal(await page.locator('img[src="x"]').count(),0)
   for(const href of await page.locator('a').evaluateAll(links=>links.map(link=>link.href)))assert.ok(!/^javascript:/i.test(href))
   await page.close()
  })
  await probe('recovery URL is scrubbed while reload and email links still work',async()=>{
   const page=await context.newPage()
   await page.goto(origin+'/tests/browser-hardening.html?view=reset&token=synthetic-recovery-token')
   await page.getByLabel(/^Nueva contraseña/).waitFor()
   assert.equal(new URL(page.url()).searchParams.has('token'),false)
   await page.reload()
   await page.getByLabel(/^Nueva contraseña/).fill('SyntheticNew8!')
   await page.getByLabel(/^Repetir contraseña/).fill('SyntheticNew8!')
   await page.getByRole('button',{name:'Guardar nueva contraseña',exact:true}).click()
   await page.getByText('Synthetic success',{exact:true}).waitFor()
   assert.equal(resetRequest.token,'synthetic-recovery-token')
   await page.evaluate(()=>{
    history.pushState(null,'','?view=reset&token=second-recovery-token')
    dispatchEvent(new PopStateEvent('popstate'))
   })
   await page.getByLabel(/^Nueva contraseña/).fill('SyntheticNew8!')
   await page.getByLabel(/^Repetir contraseña/).fill('SyntheticNew8!')
   await page.getByRole('button',{name:'Guardar nueva contraseña',exact:true}).click()
   await page.getByText('Synthetic success',{exact:true}).waitFor()
   assert.equal(resetRequest.token,'second-recovery-token')
   await page.reload()
   await page.getByText('El enlace es inválido o está incompleto.',{exact:true}).waitFor()
   await page.close()
  })
  await probe('frontend security headers include staged CSP and no-referrer',async()=>{
   const config=JSON.parse(readFileSync('vercel.json','utf8'))
   const headers=Object.fromEntries(config.headers.find(rule=>rule.source==='/(.*)').headers.map(h=>[h.key.toLowerCase(),h.value]))
   assert.equal(headers['referrer-policy'],'no-referrer')
   assert.equal(headers['x-content-type-options'],'nosniff')
   const csp=headers['content-security-policy-report-only'];assert.ok(csp)
   assert.ok(!csp.includes('unsafe-eval'))
   assert.ok(!/script-src[^;]*unsafe-inline/.test(csp))
   assert.ok(csp.includes("frame-ancestors 'none'"))
  })
  await probe('expired and malformed recovery storage cannot restore a capability',async()=>{
   for(const value of [JSON.stringify({token:'expired',expiresAt:Date.now()-1}),'invalid-json',JSON.stringify({token:'invalid',expiresAt:Date.now()+86400000})]){
    const page=await context.newPage()
    await page.goto(origin+'/tests/browser-hardening.html?view=reset')
    await page.evaluate(value=>sessionStorage.setItem('tecnodesk_password_recovery',value),value)
    await page.reload()
    await page.getByText('El enlace es inválido o está incompleto.',{exact:true}).waitFor()
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('tecnodesk_password_recovery')),null)
    await page.close()
   }
  })
  await probe('new email link replaces previous capability and preserves other query parameters',async()=>{
   const page=await context.newPage()
   await page.goto(origin+'/tests/browser-hardening.html?view=reset&token=first-token')
   await page.getByLabel(/^Nueva contraseña/).waitFor()
   await page.goto(origin+'/tests/browser-hardening.html?view=reset&token=replacement-token&source=email')
   await page.getByLabel(/^Nueva contraseña/).waitFor()
   assert.equal(new URL(page.url()).searchParams.get('source'),'email')
   assert.equal(new URL(page.url()).searchParams.has('token'),false)
   const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tecnodesk_password_recovery')))
   assert.equal(stored.token,'replacement-token')
   await page.close()
  })
  await probe('HTTP response protects bootstrap referrers and stages CSP without enforcement',async()=>{
   const response=await context.request.get(origin+'/tests/browser-hardening.html?view=reset')
   assert.equal(response.status(),200)
   assert.equal(response.headers()['referrer-policy'],'no-referrer')
   assert.equal(response.headers()['x-content-type-options'],'nosniff')
   assert.ok(response.headers()['content-security-policy-report-only'])
   assert.equal(response.headers()['content-security-policy'],undefined)
  })
  await probe('unavailable sessionStorage keeps emailed token usable in memory',async()=>{
   for(const mode of ['read','write']){
   const page=await context.newPage()
   await page.addInitScript(mode=>{
    if(mode==='read')Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Storage unavailable','SecurityError')}})
    else {
     const original=Storage.prototype.setItem
     Storage.prototype.setItem=function(key,value){if(this===sessionStorage&&key==='tecnodesk_password_recovery')throw new DOMException('Quota exhausted','QuotaExceededError');original.call(this,key,value)}
    }
   },mode)
   await page.goto(origin+'/tests/browser-hardening.html?view=reset&token=memory-only-token',{waitUntil:'domcontentloaded'})
   await page.waitForFunction(()=>!new URL(location.href).searchParams.has('token'))
   await page.getByLabel(/^Nueva contraseña/).fill('SyntheticNew8!')
   await page.getByLabel(/^Repetir contraseña/).fill('SyntheticNew8!')
   await page.getByRole('button',{name:'Guardar nueva contraseña',exact:true}).click()
   await page.getByText('Synthetic success',{exact:true}).waitFor()
   assert.equal(resetRequest.token,'memory-only-token')
   assert.equal(new URL(page.url()).searchParams.has('token'),false)
   await page.close()
   }
  })
  await context.close()
 }finally{await browser.close();await server.close()}
 console.log(`${checks} groups passed; ${failures} failed`);assert.equal(failures,0)
}
main().catch(error=>{console.error(error.message);process.exitCode=1})

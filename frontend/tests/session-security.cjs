const assert=require('node:assert/strict')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright')
const origin=process.env.SESSION_SECURITY_UI_ORIGIN||'http://127.0.0.1:5179'
assert.equal(new URL(origin).hostname,'127.0.0.1','Only disposable local UI permitted')
const user=name=>({id:name,fullName:name,firstName:name,lastName:'Synthetic',email:`${name}@example.test`,role:'OWNER',platformRole:'USER',termsAccepted:true,privacyAccepted:true,profileComplete:true,tutorialSeen:true,permissions:['settings.access'],business:{id:name,name:`Tenant ${name}`,logoUrl:null}})
async function main(){
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})})
 const failures=[];let checks=0
 const probe=async(name,run)=>{try{await run();console.log(`PASS ${name}`)}catch(e){failures.push(name);console.log(`FAIL ${name}: ${e.message}`)}}
 const fixture=async(mode='ok')=>{
  const context=await browser.newContext();await context.addInitScript(()=>localStorage.setItem('cellufix_access_token','token-A'))
  let meMode=mode,requestMode='ok',held,started
  const startedPromise=new Promise(r=>{started=r})
  await context.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname
   const json=(status,data)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
   if(path==='/api/auth/login'){const name=req.postDataJSON().email.startsWith('b')?'B':'A';return json(200,{token:`token-${name}`,user:user(name)})}
   if(path==='/api/auth/me'){
    if(meMode==='network')return route.abort('failed')
    if(meMode==='500')return json(500,{message:'Temporary failure'})
    if(meMode==='401')return json(401,{message:'Invalid session'})
    if(meMode==='403')return json(403,{message:'Inactive',code:'USER_INACTIVE'})
    return json(200,user(req.headers().authorization==='Bearer token-B'?'B':'A'))
   }
   if(path==='/api/clients'){
    if(requestMode==='held401'){started();await new Promise(r=>{held=r});return json(401,{message:'Old session expired'})}
    if(requestMode==='403')return json(403,{message:'Permission denied'})
    if(requestMode==='inactive')return json(403,{code:'USER_INACTIVE',message:'Inactive'})
    return json(200,[])
   }
   return json(200,{})
  })
  const page=await context.newPage();await page.goto(origin+'/tests/session-security.html')
  return {context,page,setMe:v=>meMode=v,setRequest:v=>requestMode=v,started:startedPromise,release:()=>held()}
 }
 const privateName=async(page,name)=>{await page.getByTestId('private').filter({hasText:`Private ${name}; mounted ${name}`}).waitFor();checks++}
 const signedOut=async page=>{await page.getByText('Signed out',{exact:true}).waitFor();assert.equal(await page.getByTestId('private').count(),0);checks++}
 try{
  await probe('500 and network failure preserve credential; retry restores legitimate session',async()=>{
   for(const mode of ['500','network']){const f=await fixture(mode);await f.page.getByRole('button',{name:'Reintentar',exact:true}).waitFor();assert.equal(await f.page.evaluate(()=>localStorage.getItem('cellufix_access_token')),'token-A');assert.equal(await f.page.getByTestId('private').count(),0);f.setMe('ok');await f.page.getByRole('button',{name:'Reintentar',exact:true}).click();await privateName(f.page,'A');await f.context.close()}
  })
  await probe('401 and inactive 403 restoration remove credential and private page',async()=>{for(const mode of ['401','403']){const f=await fixture(mode);await signedOut(f.page);assert.equal(await f.page.evaluate(()=>localStorage.getItem('cellufix_access_token')),null);await f.context.close()}})
  await probe('ordinary permission 403 keeps session; terminal inactive 403 ends it',async()=>{
   const f=await fixture();await privateName(f.page,'A');f.setRequest('403');const denied=f.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/clients');await f.page.getByRole('button',{name:'Request',exact:true}).click();await denied;await privateName(f.page,'A');assert.equal(await f.page.evaluate(()=>localStorage.getItem('cellufix_access_token')),'token-A')
   f.setRequest('inactive');await f.page.getByRole('button',{name:'Request',exact:true}).click();await signedOut(f.page);await f.context.close()
  })
  await probe('old request 401 cannot remove a newer login credential',async()=>{
   const f=await fixture();await privateName(f.page,'A');f.setRequest('held401');await f.page.getByRole('button',{name:'Request',exact:true}).click();await f.started
   await f.page.getByRole('button',{name:'Login B',exact:true}).click();await privateName(f.page,'B')
   const completed=f.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/clients');f.release();await completed
   await privateName(f.page,'B');assert.equal(await f.page.evaluate(()=>localStorage.getItem('cellufix_access_token')),'token-B');await f.context.close()
  })
  await probe('account switch in another tab restores matching identity and removes old private view',async()=>{
   const f=await fixture();await privateName(f.page,'A');const second=await f.context.newPage();await second.goto(origin+'/tests/session-security.html');await privateName(second,'A');await second.getByRole('button',{name:'Login B',exact:true}).click();await privateName(second,'B');await privateName(f.page,'B');assert.ok(!(await f.page.textContent('body')).includes('Private A'));await f.context.close()
  })
  await probe('localStorage clear in another tab removes private page',async()=>{
   const f=await fixture();await privateName(f.page,'A');const second=await f.context.newPage();await second.goto(origin+'/tests/session-security.html');await privateName(second,'A');await second.evaluate(()=>localStorage.clear());await signedOut(f.page);await f.context.close()
  })
  await probe('logout removes private page and synchronizes other tab',async()=>{
   const f=await fixture();await privateName(f.page,'A');const second=await f.context.newPage();await second.goto(origin+'/tests/session-security.html');await privateName(second,'A');await f.page.getByRole('button',{name:'Logout',exact:true}).click();await signedOut(f.page);await signedOut(second);await f.context.close()
  })
  console.log(`${checks} UI checks; ${failures.length} failed groups`);assert.deepEqual(failures,[])
 }finally{await browser.close()}
}
main().catch(()=>{console.error('Session UI suite failed; see named groups');process.exitCode=1})

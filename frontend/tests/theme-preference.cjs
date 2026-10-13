const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const { setTimeout: delay } = require('node:timers/promises')
const KEY='cellufix_access_token', CACHE='tecnodesk_theme_session'
async function main() {
 process.env.VITE_API_URL='http://127.0.0.1:5194/api'
 const {createServer}=await import('vite')
 const server=await createServer({cacheDir:'node_modules/.vite-theme-preference',server:{host:'127.0.0.1',port:5194,strictPort:true},mode:'test'})
 const watchdog=setTimeout(()=>{console.error('Theme preference watchdog timeout');process.exit(1)},150000)
 let browser
 try {
  await server.listen()
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'})
  const context=await browser.newContext({colorScheme:'light'})
  const preferences={a:'SYSTEM',b:'LIGHT'}, counts={me:0,patch:0}, sessions=new Map(); let sequence=0, failure=false, hold=false, release, held, sameToken=false, holdMe=false, meHeld=false, releaseMe, heldMeDone, finishHeldMe
  const user=id=>({id,firstName:id,lastName:'Synthetic',fullName:id,phone:null,email:`${id}@example.com`,role:id==='a'?'OWNER':'TECHNICIAN',platformRole:'USER',termsAccepted:true,privacyAccepted:true,profileComplete:true,tutorialSeen:true,permissions:[],business:{id:'synthetic',name:'Synthetic',logoUrl:null},themePreference:preferences[id]})
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url())
   if(url.hostname!=='127.0.0.1' && url.hostname!=='localhost') return route.abort()
   if(!url.pathname.startsWith('/api/')) return route.continue()
   const req=route.request(), id=sessions.get((req.headers().authorization||'').replace('Bearer ',''))
   const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
   if(url.pathname==='/api/auth/login') {const id=req.postDataJSON().email[0],token=sameToken ? (req.headers().authorization||'').replace('Bearer ','') : `synthetic-${id}-${++sequence}`;sessions.set(token,id);return send({token,user:user(id)})}
   if(!id)return send({message:'Invalid synthetic session'},401)
   if(url.pathname==='/api/auth/me'){
    counts.me++;const snapshot=user(id)
    if(holdMe){holdMe=false;meHeld=true;snapshot.fullName='Fresh server profile';await new Promise(resolve=>releaseMe=resolve);await send(snapshot);finishHeldMe();return}
    return send(snapshot)
   }
   if(url.pathname==='/api/profile/theme') {
    counts.patch++; const preference=req.postDataJSON().themePreference
    if(failure){failure=false;return send({message:'Synthetic failure'},500)}
    preferences[id]=preference
    if(hold){hold=false;held=true;await new Promise(resolve=>release=resolve)}
    return send({themePreference:preference})
   }
   return send({message:'Unexpected fixture endpoint'},404)
  })
  const page=await context.newPage(), origin='http://127.0.0.1:5194/tests/theme-preference.fixture.html'
  const expect=async(p,test,value)=>{await p.waitForFunction(([test,value])=>document.querySelector(`[data-testid="${test}"]`)?.textContent===value,[test,value])}
  const settle=async(p=page)=>expect(p,'saving','false')
  const mode=async(value,p=page)=>{await expect(p,'mode',value);await expect(p,'mui-mode',value);assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),value)}
  const login=async(id,p=page)=>{const before=Number(await p.getByTestId('session-revision').textContent());await p.getByRole('button',{name:`Login ${id.toUpperCase()}`,exact:true}).click();await expect(p,'identity',id);await p.waitForFunction(before=>Number(document.querySelector('[data-testid="session-revision"]')?.textContent)>before,before);await settle(p)}
  const toggle=async(p=page)=>p.getByRole('switch',{name:'Activar modo oscuro'}).click()
  const heldReady=async()=>{for(let i=0;i<100&&!held;i++)await delay(20);assert.ok(held,'Mock server has committed and held response')}
  page.on('pageerror',error=>console.error('Fixture page error:',error)); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(20000); await page.goto(origin,{waitUntil:'commit'});await page.getByRole('button',{name:'Login A',exact:true}).waitFor({timeout:60000});console.log('RUN login and persistence');await login('a');await mode('light')
  hold=true;held=false;await toggle();await heldReady();await mode('dark');await expect(page,'saving','true');release();await settle();assert.equal(preferences.a,'DARK')
  await page.reload();await expect(page,'identity','a');await mode('dark')
  await page.getByRole('button',{name:'Logout',exact:true}).click();await expect(page,'identity','signed-out');await login('a');await mode('dark')
  console.log('RUN independence');await login('b');await mode('light');await toggle();await settle();assert.equal(preferences.b,'DARK');assert.equal(preferences.a,'DARK')
  await login('a');await toggle();await settle();await mode('light');assert.equal(preferences.a,'LIGHT')
  await page.getByRole('button',{name:'System',exact:true}).click();await settle();await expect(page,'preference','SYSTEM');await page.emulateMedia({colorScheme:'dark'});await mode('dark');await page.emulateMedia({colorScheme:'light'});await mode('light')
  console.log('RUN rollback and portals');failure=true;await toggle();await settle();await mode('light');await page.getByText('No pudimos guardar la apariencia.',{exact:false}).waitFor();assert.equal(preferences.a,'SYSTEM')
  await page.getByRole('button',{name:'Open dialog',exact:true}).click();await page.getByLabel('Dialog input').fill('Synthetic');await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('menuitem').click()
  console.log('RUN cross-tab and session races');const other=await context.newPage();await other.goto(origin,{waitUntil:'commit'});await expect(other,'identity','a');const baseline=counts.me;await toggle(other);await settle(other);await mode('dark');await delay(400);assert.ok(counts.me-baseline<=4,'Cross tab revalidation has no broadcast loop')
  hold=true;held=false;await toggle();await heldReady();await page.getByRole('button',{name:'Logout',exact:true}).click();await login('b');await mode('dark');release();await delay(150);await mode('dark');await expect(page,'identity','b');await settle()
  await login('a');await mode('light');hold=true;held=false;await toggle();await heldReady();await login('a');await mode('dark');release();await settle();await toggle();await settle();await mode('light');assert.equal(preferences.a,'LIGHT','Same-user relogin allows another save')
  hold=true;held=false;await toggle();await heldReady();await mode('dark');preferences.a='LIGHT'
  await page.evaluate(({CACHE})=>window.dispatchEvent(new StorageEvent('storage',{key:CACHE,newValue:JSON.stringify({owner:'a',preference:'LIGHT'}),storageArea:localStorage})),{CACHE})
  release();await settle();await mode('light');await expect(page,'preference','LIGHT');assert.equal(preferences.a,'LIGHT','Queued cross-tab sync reads final server state')
  await other.close()
  console.log('RUN stale read and identical token races')
  holdMe=true;meHeld=false;heldMeDone=new Promise(resolve=>finishHeldMe=resolve)
  await page.evaluate(({CACHE})=>window.dispatchEvent(new StorageEvent('storage',{key:CACHE,newValue:JSON.stringify({owner:'a',preference:'LIGHT'}),storageArea:localStorage})),{CACHE})
  for(let i=0;i<100&&!meHeld;i++)await delay(20);assert.ok(meHeld,'Old LIGHT /me snapshot held')
  await toggle();await settle();await mode('dark');assert.equal(preferences.a,'DARK')
  releaseMe();await heldMeDone;await expect(page,'full-name','Fresh server profile');await mode('dark');assert.equal(preferences.a,'DARK','Stale read cannot overwrite confirmed preference; fresh profile fields still apply')
  hold=true;held=false;await toggle();await heldReady();sameToken=true
  const previousToken=await page.evaluate(KEY=>localStorage.getItem(KEY),KEY)
  await login('a');assert.equal(await page.evaluate(KEY=>localStorage.getItem(KEY),KEY),previousToken,'Same user re-login deliberately reuses identical credential')
  await mode('light');release();await settle();await toggle();await settle();await mode('dark');assert.equal(preferences.a,'DARK','Same-token session revision retires old operation without stuck saving')
  sameToken=false
  await page.reload();await expect(page,'identity','a');await mode('dark')
  await context.close();console.log('PASS real React preference browser: persistence, independence, SYSTEM, rollback, nested MUI, cross-tab/no loops, stale account response, same-user token replacement, queued sync, stale read ordering, identical-token relogin')
 } finally {clearTimeout(watchdog);if(browser)await browser.close();await server.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})

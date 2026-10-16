const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const { createFixtureServer } = require('./premium-theme-browser.cjs')
const { createFixtureState, installMockApi } = require('./premium-theme-fixtures.cjs')
async function main() {
 const server = process.env.MOBILE_SETTINGS_URL ? null : await createFixtureServer(5312)
 const baseUrl = process.env.MOBILE_SETTINGS_URL || 'http://127.0.0.1:5312'
 const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? {channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL} : {})})
 try {
  for (const width of [360,390,430,768,1440]) for (const mode of ['light','dark']) {
   const state = createFixtureState({themePreference:mode.toUpperCase()})
   const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'})
   await installMockApi(context,state)
   await context.route('**/api/auth/password-change/request',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,maskedEmail:'demo@example.test',retryAfter:60})}))
   const page = await context.newPage()
   await page.addInitScript(()=>localStorage.setItem('cellufix_access_token','synthetic-owner'))
   await page.goto(baseUrl+'/admin/configuracion#negocio')
   await page.getByLabel('Nombre comercial').waitFor()
   const panelIds = ['negocio','equipo','suscripcion','seguridad','tutorial']
   const shown = await Promise.all(panelIds.map(id=>page.locator('#'+id).isVisible()))
   assert.deepEqual(shown,width<900?[true,false,false,false,false]:[true,true,true,true,true],`panels at ${width}`)
   await page.getByLabel('Nombre comercial').fill('Draft preserved')
   await page.evaluate(()=>window.__businessField=document.querySelector('#negocio input'))
   const initialReads = state.requests.filter(r=>r.method==='GET').length
   const nav = page.locator('.settings-menu')
   if(width<900) {
    const menuBox=await nav.boundingBox(),panelBox=await page.locator('#negocio').boundingBox();assert.ok(menuBox.y+menuBox.height<=panelBox.y+1,'Navigation must stay above section, without covering its title');
    for(const button of await nav.locator('button').all()) assert.ok((await button.boundingBox()).height>=44,'44px nav target')
   }
   await nav.getByRole('button',{name:/Seguridad/}).click()
   await page.getByRole('button',{name:'Enviar código',exact:true}).click()
   await page.getByLabel('Nueva contraseña',{exact:true}).fill('DraftSecret123')
   await page.getByLabel('Código de 6 dígitos').fill('123456')
   await page.evaluate(()=>window.__passwordField=document.querySelector('input[autocomplete="new-password"]'))
   await nav.getByRole('button',{name:/Equipo/}).click()
   await page.goBack()
   await page.getByLabel('Nueva contraseña',{exact:true}).waitFor({state:'visible'})
   assert.equal(await page.getByLabel('Nueva contraseña',{exact:true}).inputValue(),'DraftSecret123')
   assert.equal(await page.getByLabel('Código de 6 dígitos').inputValue(),'123456')
   assert.ok(await page.evaluate(()=>window.__passwordField===document.querySelector('input[autocomplete="new-password"]')))
   await page.goForward()
   await nav.getByRole('button',{name:/Mi negocio/}).click()
   assert.equal(await page.getByLabel('Nombre comercial').inputValue(),'Draft preserved')
   assert.ok(await page.evaluate(()=>window.__businessField===document.querySelector('#negocio input')))
   if(width<900) {
    await nav.getByRole('button',{name:/Soporte/}).click()
    await page.locator('#soporte').waitFor({state:'visible'})
    assert.ok(page.url().endsWith('#soporte'))
    await nav.getByRole('button',{name:/Mi negocio/}).click()
   }
   assert.equal(state.requests.filter(r=>r.method==='GET').length,initialReads,'switches do not read API')
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'no document overflow')
   await context.close()
   console.log(`PASS settings ${width} ${mode}: mounted business/password drafts, history, API parity, touch size, overflow`)
  }
 } finally {await browser.close();await server?.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})

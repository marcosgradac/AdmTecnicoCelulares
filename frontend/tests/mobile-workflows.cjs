/* Browser workflows against isolated synthetic API contexts; never submit business writes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {chromium}=require('playwright')
const {openScreen,createFixtureServer}=require('./premium-theme-browser.cjs')
const out=path.resolve(__dirname,'../../docs/screenshots/mobile-ux/workflows')
const flows={
 pos:{route:'/admin/punto-de-venta',ready:'Punto de venta',async run(page,width){
  await page.getByRole('button',{name:'Agregar Cargador USB-C al carrito',exact:true}).filter({visible:true}).click()
  if(width<1200)await page.getByRole('button',{name:/Ver carrito/}).first().click()
  const panel=width<1200?page.locator('.MuiDrawer-paper').filter({has:page.getByRole('button',{name:'Volver a productos'})}):page.locator('main')
  await panel.getByRole('button',{name:'Sumar una unidad de Cargador USB-C',exact:true}).click()
  assert.match(await panel.innerText(),/20[.,]000/)
  await panel.getByRole('combobox',{name:'Medio de pago'}).click();await page.getByRole('option',{name:'Transferencia',exact:true}).click()
  if(width<1200){await panel.getByRole('button',{name:'Volver a productos'}).click();await page.getByRole('button',{name:/Ver carrito/}).first().click()}
  assert.match(await panel.getByRole('combobox',{name:'Medio de pago'}).innerText(),/Transferencia/)
  assert.match(await panel.innerText(),/20[.,]000/)
 }},
 team:{route:'/admin/empleados',ready:'Empleados',async run(page,width){
  await page.getByRole('button',{name:'Acciones de Lucas Demo',exact:true}).click();await page.getByRole('menuitem',{name:'Editar',exact:true}).click()
  const drawer=page.locator('.MuiDrawer-paper').filter({has:page.getByRole('heading',{name:'Editar empleado',exact:true})})
  const group=drawer.getByRole('button',{name:/Reparaciones.*asignados/})
  if(width<900)await group.click()
  const permission=drawer.getByRole('checkbox',{name:'Crear reparaciones',exact:true});await permission.check();assert.equal(await permission.isChecked(),true)
  if(width<900){await group.click();await permission.waitFor({state:'hidden'});await group.click();assert.equal(await permission.isChecked(),true)}
 }},
 warranties:{route:'/admin/garantias',ready:'Garantías',async run(page){
  const toggle=page.getByRole('button',{name:/1 reclamo.*sin resolver/}).filter({visible:true}).first()
  await toggle.click();await page.getByText('Falla intermitente',{exact:true}).filter({visible:true}).waitFor();await toggle.click();await page.getByText('Falla intermitente',{exact:true}).filter({visible:true}).waitFor({state:'hidden'});await toggle.click();await page.getByText('Falla intermitente',{exact:true}).filter({visible:true}).waitFor()
 }},
 repair:{route:'/admin/reparaciones/repair-demo',ready:'iPhone 13',async run(page,width){
  assert.equal(await page.getByRole('button',{name:'Editar',exact:true}).isVisible(),true)
  if(width<900){const toggle=page.getByRole('button',{name:'Seguimiento del cliente',exact:true});await toggle.click();await page.getByRole('button',{name:'Copiar enlace',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'WhatsApp',exact:true}).isVisible(),true);await toggle.click();await toggle.click()}
  assert.equal(await page.getByRole('button',{name:'Registrar pago',exact:true}).isVisible(),true)
 }},
 category:{route:'/admin/comercio',ready:'Comercio',async run(page){
  const button=page.getByRole('button',{name:'Acciones de categoría Accesorios',exact:true});await button.focus();await page.keyboard.press('Enter');await page.getByRole('menuitem',{name:'Editar categoría',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Abrir categoría Accesorios',exact:true}).count(),1)
 }}
}
async function main(){fs.mkdirSync(out,{recursive:true});let ownedServer,browser;const results=[];try{const base=process.env.MOBILE_WORKFLOW_URL||(ownedServer=await createFixtureServer(5315),'http://127.0.0.1:5315');browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});for(const width of [360,390,768,1440].filter(width=>!process.env.MOBILE_WORKFLOW_WIDTHS||process.env.MOBILE_WORKFLOW_WIDTHS.split(',').includes(String(width))))for(const mode of ['light','dark'])for(const [name,flow]of Object.entries(flows).filter(([name])=>!process.env.MOBILE_WORKFLOW_FLOWS||process.env.MOBILE_WORKFLOW_FLOWS.split(',').includes(name))){let opened;try{opened=await openScreen(browser,base,{name,...flow},mode,{width,height:width===768?1024:900});const {page,state}=opened;page.setDefaultTimeout(10000);const before=state.requests.length;await flow.run(page,width);assert.deepEqual(state.unhandled,[]);assert.equal(state.mutations.length,0);assert.deepEqual(state.requests.filter(r=>!['GET','HEAD'].includes(r.method)),[]);if(['warranties','category'].includes(name))assert.equal(state.requests.length,before,'Presentation action issued a query');assert.deepEqual(opened.errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Document horizontal overflow');if(width===390&&mode==='light')await page.screenshot({path:path.join(out,`${name}-${width}-${mode}.png`),fullPage:true});results.push({name,width,mode,passed:true,requestDelta:state.requests.length-before});console.log(`PASS ${name} ${width} ${mode}`)}catch(error){results.push({name,width,mode,passed:false,error:error.message});console.error(`FAIL ${name} ${width} ${mode}: ${error.message}`);await opened?.page.screenshot({path:path.join(out,`failure-${name}-${width}-${mode}.png`),fullPage:true}).catch(()=>{})}finally{await opened?.context.close();fs.writeFileSync(path.join(out,process.env.MOBILE_WORKFLOW_FLOWS||process.env.MOBILE_WORKFLOW_WIDTHS?'focused-results.json':'results.json'),JSON.stringify(results,null,2))}}}finally{await browser?.close();await ownedServer?.close()}assert.equal(results.filter(r=>!r.passed).length,0,'Workflow failures');console.log(`MOBILE WORKFLOWS PASSED ${results.length}/${results.length}`)}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
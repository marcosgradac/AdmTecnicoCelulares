const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {chromium}=require('playwright')
const {createFixtureState,installMockApi,handleMockRequest}=require('./premium-theme-fixtures.cjs')
const viewports=[{name:'desktop',width:1440,height:900},{name:'laptop',width:1280,height:800},{name:'tablet',width:768,height:1024},{name:'mobile',width:390,height:844},{name:'narrow',width:360,height:800}]
const screens=[
 {name:'dashboard',route:'/admin',ready:'Inicio ·'},
 {name:'repairs',route:'/admin/reparaciones',ready:'Reparaciones'},
 {name:'repair-detail',route:'/admin/reparaciones/repair-demo',ready:'iPhone 13'},
 {name:'repair-new',route:'/admin/reparaciones?new=1',ready:'Nueva reparación'},
 {name:'clients',route:'/admin/clientes',ready:'Clientes'},
 {name:'client-detail',route:'/admin/clientes/client-demo',ready:'Juan Demo'},
 {name:'cash',route:'/admin/caja',ready:'Caja'},
 {name:'commerce',route:'/admin/comercio',ready:'Comercio'},
 {name:'pos',route:'/admin/punto-de-venta',ready:'Punto de venta'},
 {name:'equipment',route:'/admin/venta-equipos',ready:'Compra y reventa'},
 {name:'warranties',route:'/admin/garantias',ready:'Garantías'},
 {name:'team',route:'/admin/empleados',ready:'Empleados'},
 {name:'settings',route:'/admin/configuracion',ready:'Configuración'},
 {name:'profile',route:'/admin/perfil',ready:'Mi perfil'},
 {name:'subscription',route:'/admin/suscripcion',ready:'Tu plan de TecnoDesk'},
 {name:'support',route:'/admin/configuracion/soporte',ready:'Soporte'},
 {name:'platform',route:'/platform-admin',token:'synthetic-admin',ready:'Resumen'},
 {name:'no-modules',route:'/admin/sin-modulos',role:'TECHNICIAN',ready:'módulos'},
 {name:'blocked',route:'/admin',scenario:'blocked',ready:'Suscripción'},
 {name:'connection-error',route:'/admin',pathErrors:{'/auth/me':503},ready:'conexión'},
 {name:'startup-error',route:'/admin?fixture-error=1',scenario:'startup-error',ready:'No pudimos mostrar esta pantalla'},
 {name:'loading',route:'/admin',loading:true,authDelayMs:10000},
 {name:'dashboard-error',route:'/admin',pathErrors:{'/dashboard/overview':503},ready:'No pudimos cargar Inicio'},
 {name:'landing',route:'/',public:true,ready:'Gestioná todo'},
 {name:'login',route:'/login',public:true,ready:'Bienvenido'},
 {name:'register',route:'/register',public:true,ready:'Creá tu cuenta'},
 {name:'forgot-password',route:'/olvide-mi-contrasena',public:true,ready:'Recuperá'},
 {name:'reset-password',route:'/restablecer-contrasena?token=demo-recovery',public:true,ready:'Creá una nueva'},
 {name:'tracking',route:'/seguimiento/demo-token',public:true,ready:'Seguimiento de tu reparación'},
 {name:'tracking-expired',route:'/seguimiento/demo-token',public:true,scenario:'tracking-expired',ready:'Este seguimiento finalizó'},
 {name:'tracking-missing',route:'/seguimiento/demo-token',public:true,scenario:'tracking-missing',ready:'Seguimiento no encontrado'},
 {name:'terms',route:'/terminos-y-condiciones',public:true,ready:'Términos'},
 {name:'privacy',route:'/politica-de-privacidad',public:true,ready:'Privacidad'},
]

async function createBuiltFixtureServer(port){
 process.env.VITE_API_URL='http://127.0.0.1:'+port
 const root=path.resolve(__dirname,'..'),out=path.join(root,'node_modules/.cache/premium-theme-built-'+port)
 const {build}=await import('vite'),react=(await import('@vitejs/plugin-react')).default
 await build({root,configFile:false,plugins:[react()],mode:'test',build:{outDir:out,emptyOutDir:true,rollupOptions:{input:path.join(__dirname,'premium-theme-browser.html')}}})
 const http=require('node:http'),html=fs.readFileSync(path.join(out,'tests/premium-theme-browser.html'))
 const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon','.json':'application/json'}
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:'+port)
  if(url.pathname.startsWith('/api/')){res.statusCode=404;res.end('No live API');return}
  if(req.headers.accept?.includes('text/html')){res.setHeader('Content-Type','text/html');res.end(html);return}
  let file;try{file=path.resolve(out,'.'+decodeURIComponent(url.pathname))}catch{res.statusCode=400;res.end();return}
  if(!file.startsWith(out+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;res.end();return}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res)
 })
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
 return {close:()=>new Promise(resolve=>server.close(resolve))}
}

async function createFixtureServer(port=5197,fixtureState=null){
 if(!fixtureState && process.env.PREMIUM_THEME_STATIC!=='false')return createBuiltFixtureServer(port)
 process.env.VITE_API_URL=`http://127.0.0.1:${port}`
 const {createServer}=await import('vite')
 const frontendRoot=path.resolve(__dirname,'..');let html=fs.readFileSync(path.join(__dirname,'premium-theme-browser.html'),'utf8');
 if(fixtureState){html=html.replace('<head>','<head><script>if(location.pathname.startsWith("/admin")&&!localStorage.getItem("cellufix_access_token")){localStorage.setItem("cellufix_access_token","synthetic-owner")}<\/script>');}
 const server=await createServer({root:frontendRoot,cacheDir:fixtureState?'node_modules/.vite-premium-theme-demo':'node_modules/.vite-premium-theme-browser',mode:'test',server:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'premium-visual-fixture-navigation',configureServer(server){server.middlewares.use(async(req,res,next)=>{if(fixtureState)res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:"+port+"; frame-src 'none'; object-src 'none'; base-uri 'self'");if(req.url.startsWith('/api/')&&fixtureState){try{let raw='';for await(const chunk of req)raw+=chunk;const response=await handleMockRequest({url:req.url,method:req.method,headers:req.headers,body:raw?JSON.parse(raw):{}},fixtureState);res.statusCode=response.status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(response.body));return}catch(error){res.statusCode=500;res.end(JSON.stringify({message:'Local fixture request failed'}));return}}if(req.headers.accept?.includes('text/html')&&!req.url.startsWith('/api/')&&!req.url.startsWith('/tests/')){res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,html));return}next()})}}]})
 await server.listen();return server
}
async function openScreen(browser,base,screen,mode,viewport,reuseContext){
 const state=createFixtureState({themePreference:mode.toUpperCase(),role:screen.role||'OWNER',scenario:screen.scenario||'normal'})
 Object.assign(state.pathErrors,screen.pathErrors||{});state.authDelayMs=screen.authDelayMs||0;Object.assign(state.pathDelays,screen.pathDelays||{})
 const context=reuseContext||await browser.newContext({viewport,colorScheme:mode,reducedMotion:'reduce',serviceWorkers:'block'}); if(reuseContext)await context.unrouteAll({behavior:'ignoreErrors'})
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.addInitScript(({token})=>{if(token)localStorage.setItem('cellufix_access_token',token);else localStorage.removeItem('cellufix_access_token')},{token:screen.public?null:(screen.token||'synthetic-owner')})
 await installMockApi(context,state)
 await page.goto(`${base}/tests/premium-theme-browser.html?route=${encodeURIComponent(screen.route)}`,{waitUntil:'domcontentloaded',timeout:90000})
 await page.waitForFunction(mode=>document.documentElement.dataset.theme===mode,mode)
 if(screen.ready)await page.getByText(new RegExp(screen.ready,'i')).filter({ visible: true }).first().waitFor({timeout:30000});
 if(screen.loading)await page.locator('.MuiCircularProgress-root').first().waitFor({state:'visible'});else await page.locator('.MuiCircularProgress-root').first().waitFor({state:'hidden',timeout:15000});
 await page.waitForTimeout(150)
 if(!screen.public&&!screen.loading&&!screen.pathErrors&&!screen.scenario&&!['no-modules'].includes(screen.name)){const errors=await page.getByText(/No pudimos cargar|El servidor no reconoce|Algo salió mal/i).filter({visible:true}).allTextContents();assert.deepEqual(errors,[],screen.name+': unexpected module error')}
 return {page,context,state,errors}
}
async function inspectLayout(page,mode){return page.evaluate(mode=>{
 const root=document.documentElement;const body=getComputedStyle(document.body);const surfaces=[...document.querySelectorAll('.MuiPaper-root,.billing-panel,.billing-plan-card,.terms-document,.auth-card,.duo-card,[role="status"]')].filter(el=>{const r=el.getBoundingClientRect();return r.width>100&&r.height>45&&r.top<innerHeight&&r.bottom>0});
 const whitePanels=mode==='dark'?surfaces.filter(el=>{const rgb=getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.map(Number)||[];return rgb[0]>225&&rgb[1]>225&&rgb[2]>225&&(rgb[3]??1)>.9}).map(el=>({className:el.className,text:el.textContent.slice(0,80)})):[];
 return {overflow:root.scrollWidth>innerWidth+1,scrollWidth:root.scrollWidth,viewport:innerWidth,bodyBackground:body.backgroundColor,bodyColor:body.color,whitePanels}
 },mode)}
async function capture(page,out,name,mode,viewport,records){
 const layout=await inspectLayout(page,mode),file=path.join(out,`${mode}-${viewport.name}-${name}.png`)
 await page.screenshot({path:file,fullPage:true});records.push({name,mode,viewport:viewport.name,file:path.relative(path.resolve(__dirname,'../..'),file).split(path.sep).join('/'),...layout})
 assert.equal(layout.overflow,false,`${name} ${mode} ${viewport.name}: horizontal document overflow (${layout.scrollWidth}/${layout.viewport})`)
 assert.deepEqual(layout.whitePanels,[],`${name} ${mode} ${viewport.name}: bright interface panel`)
}
async function dialogCaptures(page,out,screen,mode,viewport,records){
 if(screen.name==='repair-detail'){
  for(const [button,name] of [['Editar','repair-edit'],['Registrar pago','repair-payment'],['Eliminar reparación','repair-delete']]){
   await page.getByRole('button',{name:button,exact:true}).click();await page.getByRole('dialog').waitFor();await capture(page,out,name,mode,viewport,records)
   const cancel=page.getByRole('button',{name:/Cancelar|Cerrar/,exact:true}).last();if(await cancel.count())await cancel.click();else await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'})
  }
 }
 if(screen.name==='equipment'){
  for(const [item,name] of [['Ver detalles','equipment-detail'],['Editar equipo','equipment-edit'],['Registrar venta','equipment-sale'],['Eliminar equipo','equipment-delete']]){
   await page.getByRole('button',{name:'Opciones de Samsung Galaxy A54'}).click();await page.getByRole('menuitem',{name:item,exact:true}).click();await page.getByRole('dialog').waitFor();await capture(page,out,name,mode,viewport,records)
   const cancel=page.getByRole('button',{name:/Cancelar|Cerrar/,exact:true}).last();if(await cancel.count())await cancel.click();else await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'})
  }
 }
 if(screen.name==='platform'){
  for(const [label,name] of [['Negocios','platform-businesses'],['Suscripciones','platform-subscriptions'],['Pagos','platform-payments'],['Configuración','platform-settings']]){
   const open=page.getByRole('button',{name:'Abrir secciones del panel'});if(await open.count())await open.click();await page.getByRole('button',{name:label,exact:true}).click();await page.waitForTimeout(200);await capture(page,out,name,mode,viewport,records)
  }
 }
}
async function main(){
 const port=Number(process.env.PREMIUM_THEME_PORT)||5197,out=process.env.PREMIUM_THEME_SCREENSHOT_DIR||path.resolve(__dirname,'../../docs/screenshots/premium-dark-mode');fs.mkdirSync(out,{recursive:true})
 const server=await createFixtureServer(port);let browser;const records=[],failures=[],contexts=new Map()
 try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})})
  const chosen=process.env.PREMIUM_THEME_SCREENS?screens.filter(s=>process.env.PREMIUM_THEME_SCREENS.split(',').includes(s.name)):screens
  const widths=process.env.PREMIUM_THEME_VIEWPORTS?viewports.filter(v=>process.env.PREMIUM_THEME_VIEWPORTS.split(',').includes(v.name)):viewports
  for(const viewport of widths)for(const mode of ['light','dark'])for(const screen of chosen){let context,page; const contextKey=mode+':'+viewport.name
   try{const opened=await openScreen(browser,`http://127.0.0.1:${port}`,screen,mode,viewport,contexts.get(contextKey));context=opened.context;page=opened.page;contexts.set(contextKey,context)
    if(['desktop','mobile'].includes(viewport.name)){await capture(opened.page,out,screen.name,mode,viewport,records);await dialogCaptures(opened.page,out,screen,mode,viewport,records)}else{const layout=await inspectLayout(opened.page,mode);records.push({name:screen.name,mode,viewport:viewport.name,...layout});assert.equal(layout.overflow,false,'Horizontal overflow');assert.deepEqual(layout.whitePanels,[],'Bright panel')}
    assert.deepEqual(opened.errors,[],'Uncaught application error');assert.deepEqual(opened.state.unhandled,[],'Unhandled API fixture');assert.equal(opened.state.mutations.length,0,'Visual matrix must not submit mutations');console.log(`PASS ${mode} ${viewport.name} ${screen.name}`)
   }catch(error){failures.push({screen:screen.name,mode,viewport:viewport.name,error:error.message});console.error(`FAIL ${mode} ${viewport.name} ${screen.name}: ${error.message}`)}finally{await page?.close()}
  }
 }finally{for(const context of contexts.values())await context.close();await browser?.close();await server.close();fs.writeFileSync(path.join(out,'visual-matrix.json'),JSON.stringify({records,failures},null,2))}
 assert.deepEqual(failures,[],'Full application visual matrix failures')
 console.log(`Validated ${records.length} screen/viewport/theme cases. Screenshots: ${out}`)
}
module.exports={screens,viewports,createFixtureServer,openScreen,inspectLayout,capture,dialogCaptures}
if(require.main===module){const watchdog=setTimeout(()=>{console.error('Premium visual matrix did not complete within 30 minutes');process.exit(1)},1800000);main().then(()=>clearTimeout(watchdog)).catch(error=>{clearTimeout(watchdog);console.error(error);process.exitCode=1})}

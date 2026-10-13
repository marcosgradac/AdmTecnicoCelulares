const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {chromium}=require('playwright')
const {createFixtureServer,openScreen,inspectLayout,screens}=require('./premium-theme-browser.cjs')
const {fixtures}=require('./premium-theme-fixtures.cjs')
const out=path.resolve(__dirname,'../../docs/screenshots/premium-dark-mode/final-correction')
const variants=[{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844},{name:'narrow',width:360,height:800}]
const scenes=[{name:'dashboard',route:'/admin',ready:'Inicio ·'},{name:'cash',route:'/admin/caja',ready:'Caja'},{name:'cash-repair',route:'/admin/caja?origin=REPAIR',ready:'Caja'},{name:'cash-equipment',route:'/admin/caja?origin=EQUIPMENT',ready:'Caja'},{name:'login',route:'/login',public:true,ready:'Bienvenido'},{name:'register',route:'/register',public:true,ready:'Creá tu cuenta'},{name:'landing',route:'/',public:true,ready:screens.find(s=>s.name==='landing').ready},{name:'settings',route:'/admin/configuracion',ready:'Configuración'}]
async function moneyColor(page,label,kind){const card=page.getByText(label,{exact:true}).locator('xpath=ancestor::div[contains(@class,"MuiCard-root")][1]');const value=card.locator('.MuiTypography-root').filter({hasText:/^\s*-?\$/}).first();await value.waitFor();const color=await value.evaluate(e=>getComputedStyle(e).color);const [r,g,b]=color.match(/\d+/g).map(Number);if(kind==='green')assert(g>r&&g>b,label+' must be green: '+color);else if(kind==='red')assert(r>g&&r>b,label+' must be red: '+color);else assert.equal(color,await page.evaluate(()=>getComputedStyle(document.body).color),label+' zero is neutral');const bg=(await card.evaluate(e=>getComputedStyle(e).backgroundColor)).match(/\d+/g).slice(0,3).map(Number);const lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const a=lum([r,g,b]),z=lum(bg);assert((Math.max(a,z)+.05)/(Math.min(a,z)+.05)>=4.5,label+' amount AA contrast');return value.innerText()}
async function validateWordmark(page,mode){const logos=page.getByAltText('TecnoDesk',{exact:true});for(const img of await logos.all()){if(!await img.isVisible())continue;await img.evaluate(e=>e.decode());assert.match(await img.getAttribute('src'),mode==='dark'?/tecnodesk-logo-dark.*\.svg/:/tecnodesk-logo.*\.png/)}if(mode!=='dark'||!await logos.count())return;const img=logos.first();const pixels=await img.evaluate(async e=>{await e.decode();const canvas=document.createElement('canvas');canvas.width=e.naturalWidth;canvas.height=e.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(e,0,0);const dark=ctx.getImageData(0,0,canvas.width,canvas.height).data;const svg=await(await fetch(e.src)).text();const original=new Image();original.src=svg.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/)[0];await original.decode();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(original,0,0);const light=ctx.getImageData(0,0,canvas.width,canvas.height).data;let changedIcon=0,white=0,blue=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4;if(x<720&&[0,1,2,3].some(j=>(light[i+3]===255 ? dark[i+j]!==light[i+j] : Math.abs(dark[i+j]-light[i+j])>1)))changedIcon++;if(dark[i+3]>240&&x>=720&&x<1492&&dark[i]===255&&dark[i+1]===255&&dark[i+2]===255)white++;if(x>=1492&&dark[i+3]>240&&dark[i]===115&&dark[i+1]===186&&dark[i+2]===255)blue++}return{changedIcon,white,blue,width:canvas.width,height:canvas.height}});assert.equal(pixels.changedIcon,0,'original opaque icon pixels unchanged; translucent antialiasing tolerance at most 1/255');assert(pixels.white>1000&&pixels.blue>1000,'white Tecno and light blue Desk');assert.equal(pixels.width/pixels.height,3,'original aspect ratio')}
async function main() {
 const svg=fs.readFileSync(path.resolve(__dirname,'../src/assets/brand/tecnodesk-logo-dark.svg'),'utf8')
 assert.deepEqual(Buffer.from(svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)[1],'base64'),fs.readFileSync(path.resolve(__dirname,'../src/assets/brand/tecnodesk-logo.png')),'original logo bytes preserved')
 fs.mkdirSync(out,{recursive:true})
 const server=await createFixtureServer(5196),records=[]
 let browser
 try {
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})})
  for(const viewport of variants) for(const mode of ['light','dark']) {
   for(const scene of scenes) {
    fixtures.overview.financial.balance=-10000
    fixtures.overview.modules.equipment.profit=50000
    fixtures.equipmentSummary.realizedProfit=50000
    const opened=await openScreen(browser,'http://127.0.0.1:5196',scene,mode,viewport)
    try {
     const p=opened.page
     await validateWordmark(p,mode)
     if(scene.name==='dashboard') {
      assert.match(await moneyColor(p,'Resultado de Caja','red'),/10\.000/)
      for(const [label,kind] of [['Ingresos','green'],['Egresos','red']]) {
       const value=p.locator('.MuiTypography-caption').filter({hasText:new RegExp('^'+label+'$')}).first().locator('..').locator('.MuiTypography-root').last()
       const [r,g,b]=(await value.evaluate(e=>getComputedStyle(e).color)).match(/\d+/g).map(Number)
       assert(kind==='green'?g>r&&g>b:r>g&&r>b,label+' dashboard financial color')
      }
      await p.getByText('El resultado de Caja refleja cobros y pagos; no equivale a la ganancia contable.').waitFor()
     }
     if(scene.name==='cash') {await moneyColor(p,'Ingresos de hoy','green');await moneyColor(p,'Egresos de hoy','red');await moneyColor(p,'Balance de hoy','red')}
     if(scene.name==='cash-repair') {await moneyColor(p,'Caja neta de hoy','red');await moneyColor(p,'Cobrado de hoy','green');await moneyColor(p,'Egresos de hoy','red')}
     if(scene.name==='cash-equipment') {await moneyColor(p,'Invertido en compras de hoy','red');await moneyColor(p,'Gastos de reparación de hoy','red');await moneyColor(p,'Ganancia real de hoy','green')}
     const layout=await inspectLayout(p,mode)
     assert.equal(layout.overflow,false);assert.deepEqual(layout.whitePanels,[])
     const name=`${mode}-${viewport.name}-${scene.name}`
     await p.screenshot({path:path.join(out,name+'.png'),fullPage:true})
     if(scene.name==='settings') {
      if(viewport.name==='desktop')await p.locator('[class*="_drawer_"]').first().hover({position:{x:25,y:26}})
      else await p.getByRole('button',{name:'Abrir menú'}).click()
      await p.waitForTimeout(300);await validateWordmark(p,mode)
      await p.screenshot({path:path.join(out,name+'-expanded-menu.png')})
     }
     assert.deepEqual(opened.errors,[]);assert.deepEqual(opened.state.mutations,[])
     records.push({name,...layout})
    } finally {await opened.context.close()}
   }
   for(const profit of [-5000,0,5000]) {
    fixtures.overview.financial.balance=profit
    fixtures.overview.modules.equipment.profit=profit
    fixtures.overview.modules.commerce.grossProfit=profit
    fixtures.equipmentSummary.realizedProfit=profit
    for(const name of ['dashboard','cash-equipment']) {
     const opened=await openScreen(browser,'http://127.0.0.1:5196',scenes.find(s=>s.name===name),mode,viewport)
     try {
      const p=opened.page
      await moneyColor(p,name==='dashboard'?'Resultado de Caja':'Ganancia real de hoy',profit<0?'red':profit>0?'green':'neutral')
      if(name==='dashboard')for(const label of ['Margen bruto de ventas','Ganancia de esas ventas']) {
       const value=p.getByText(label,{exact:true}).locator('..').locator('.MuiTypography-root').last()
       const [r,g,b]=(await value.evaluate(e=>getComputedStyle(e).color)).match(/\d+/g).map(Number)
       if(profit<0)assert(r>g&&r>b)
       if(profit>0)assert(g>r&&g>b)
       assert.match(await value.innerText(),profit===0?/\$\s*0/:/5\.000/)
      }
      assert.deepEqual(opened.state.mutations,[])
      records.push({name:`${mode}-${viewport.name}-${name}-profit-${profit}`,passed:true})
     }finally{await opened.context.close()}
    }
   }
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({records,failures:[]},null,2)+'\n')
  console.log('PASS final logo/financial colors:',records.length,'cases; original icon; desktop/390/360; both themes; positive/negative/zero; unchanged amounts')
 }finally{await browser?.close();await server.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})

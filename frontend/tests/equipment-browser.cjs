const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')
const base = { id:'sold', brand:'Samsung', model:'Galaxy A54', purchasePrice:100000, repairExpenses:20000, totalCost:120000, estimatedSalePrice:180000, estimatedProfit:60000, status:'SOLD', version:3, actualSalePrice:110000, realizedProfit:-10000, saleCostBasis:120000, salePaymentMethod:'CASH', soldAt:'2026-10-01T12:00:00Z', createdAt:'2026-09-01T12:00:00Z', updatedAt:'2026-10-01T12:00:00Z' }
async function main(){
  process.env.VITE_API_URL='http://127.0.0.1:3000'
  const {createServer}=await import('vite')
  const server=await createServer({server:{host:'127.0.0.1',port:5186,strictPort:true},mode:'test'})
  console.log("Starting owned Vite server"); await server.listen(); console.log("Owned Vite server listening")
  let browser
  const output=process.env.EQUIPMENT_SCREENSHOT_DIR||path.resolve('tests/artifacts/equipment')
  fs.mkdirSync(output,{recursive:true})
  try{
    console.log("Launching local Chromium"); browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})})
    console.log("Chromium launched"); for(const [name,width,height,dark] of [['desktop',1280,900,false],['mobile',390,844,false],['dark',1280,900,true],['readonly',1280,900,false]]){
      const context=await browser.newContext({viewport:{width,height}})
      await context.addInitScript(()=>localStorage.setItem('cellufix_access_token','synthetic'))
      let removed=false, deletes=0, summaries=0
      await context.route('**/*', route => { const hostname=new URL(route.request().url()).hostname; return hostname==='127.0.0.1'||hostname==='localhost'?route.continue():route.abort() })
      await context.route('**/api/**',async route=>{
        const request=route.request(),pathname=new URL(request.url()).pathname
        const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
        if(pathname.endsWith('/auth/me')) return json({id:'test',role:name==='readonly'?'TECHNICIAN':'OWNER',fullName:'Synthetic',permissions:name==='readonly'?['equipmentSales.view']:[],business:{id:'test',name:'Synthetic',logoUrl:null}})
        if(pathname.endsWith('/equipment-sales/summary')){summaries++;return json({inProcess:1,readyForSale:1,totalInvested:removed?120000:240000,purchaseInvestment:200000,repairInvestment:40000,salesCount:removed?0:1,salesRevenue:110000,realizedProfit:removed?0:-10000})}
        if(pathname.endsWith('/equipment-sales/sold')){
          if(request.method()==='DELETE'){deletes++;assert.deepEqual(request.postDataJSON(),{expectedVersion:3,confirmed:true});removed=true;return json({success:true})}
          return json({device:base,movements:[{id:'m1',type:'EXPENSE',amount:100000,method:null,description:'Compra inicial',createdAt:base.createdAt,resaleKind:'PURCHASE',resaleVersion:1},{id:'m2',type:'INCOME',amount:110000,method:'CASH',description:'Venta del equipo',createdAt:base.soldAt,resaleKind:'SALE',resaleVersion:3}]})
        }
        if(pathname.endsWith('/equipment-sales')) return json({items:[...(!removed?[base]:[]),{...base,id:'ready',brand:'Apple',model:'iPhone 13',status:'READY_FOR_SALE',actualSalePrice:null,realizedProfit:null,soldAt:null}],total:removed?1:2,page:1,pageSize:10,pages:1})
        return json({},404)
      })
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
      await page.goto(`http://127.0.0.1:5186/tests/equipment-browser.html${dark?'?dark':''}`)
      await page.getByRole('button',{name:'Opciones de Samsung Galaxy A54'}).waitFor()
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page must fit viewport')
      if(width>600) assert.equal(await page.getByRole('columnheader').count(),5)
      if(name==='readonly'){
        assert.equal(await page.getByRole('button',{name:'Nuevo equipo'}).count(),0);
        for(const model of ['Samsung Galaxy A54','Apple iPhone 13']){await page.getByRole('button',{name:'Opciones de '+model}).click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Ver detalles']);await page.keyboard.press('Escape')}
        await page.getByRole('button',{name:'Opciones de Samsung Galaxy A54'}).click();await page.getByRole('menuitem',{name:'Ver detalles'}).click();await page.getByRole('dialog').getByText('Venta realizada',{exact:true}).waitFor();assert.deepEqual(errors,[]);assert.equal(deletes,0);await context.close();console.log('PASS equipment browser read-only permissions');continue
      }
      await page.screenshot({path:path.join(output,`${name}-list.png`),fullPage:true})
      await page.getByRole('button',{name:'Opciones de Apple iPhone 13'}).click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Ver detalles','Editar equipo','Cambiar estado','Registrar venta','Eliminar equipo']);await page.keyboard.press('Escape')
      await page.getByRole('button',{name:'Opciones de Samsung Galaxy A54'}).click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Ver detalles','Eliminar equipo']);await page.getByRole('menuitem',{name:'Ver detalles'}).click()
      await page.getByText('Venta realizada',{exact:true}).waitFor()
      for(const label of ['Precio estimado de venta','Ganancia estimada','Precio real de venta','Ganancia real','Fecha y hora de venta','Medio de pago','Movimientos financieros']) assert.equal(await page.getByRole('dialog').getByText(label,{exact:true}).count(),1)
      await page.screenshot({path:path.join(output,`${name}-details.png`),fullPage:true})
      await page.getByRole('button',{name:'Cerrar',exact:true}).click()
      await page.getByRole('button',{name:'Opciones de Samsung Galaxy A54'}).click();await page.getByRole('menuitem',{name:'Eliminar equipo'}).click()
      const remove=page.getByRole('button',{name:'Eliminar definitivamente',exact:true});assert.equal(await remove.isDisabled(),true)
      await page.getByRole('checkbox').check();await page.screenshot({path:path.join(output,`${name}-delete.png`),fullPage:true});await remove.click()
      await page.getByRole('button',{name:'Opciones de Samsung Galaxy A54'}).waitFor({state:'detached'})
      assert.equal(deletes,1);assert.ok(summaries>=2);assert.deepEqual(errors,[])
      await context.close();console.log(`PASS equipment browser ${name}`)
    }
    console.log(`Screenshots: ${output}`)
  }finally{await browser?.close();await server.close()}
}
const watchdog=setTimeout(()=>{console.error("Equipment browser verification timed out without completing");process.exit(1)},180000)
main().then(()=>clearTimeout(watchdog)).catch(e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1})

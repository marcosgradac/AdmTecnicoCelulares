const assert=require('node:assert/strict')
const {spawn}=require('node:child_process')
async function main(){
 process.env.VITE_API_URL='http://127.0.0.1:3000'
 const {createServer}=await import('vite')
 const server=await createServer({server:{host:'127.0.0.1',port:5178,strictPort:true},mode:'test'})
 await server.listen()
 try{
  const address=server.httpServer.address();assert.equal(address.address,'127.0.0.1')
  const origin=`http://127.0.0.1:${address.port}`
  for(const file of process.argv.includes('--account')?['account-deletion.cjs']:['session-security.cjs']){
   await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[`tests/${file}`],{windowsHide:true,stdio:'inherit',env:{...process.env,SESSION_SECURITY_UI_ORIGIN:origin,ACCOUNT_DELETION_UI_URL:origin}})
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${file} failed`)))
   })
  }
 }finally{await server.close()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})

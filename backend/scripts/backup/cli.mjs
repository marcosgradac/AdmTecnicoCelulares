import { readFile } from 'node:fs/promises'
import { createBackup,verifyBackup,restoreBackup,catalogBackups } from './engine.mjs'
import { assertPrivatePath } from './safety.mjs'
const [command,...args]=process.argv.slice(2)
const abort=new AbortController()
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>abort.abort())
async function main(){
 const flags={};for(let i=0;i<args.length;i+=2){if(!['--config','--key-file','--bin','--output','--bundle','--commit'].includes(args[i])||!args[i+1]||flags[args[i]])throw Error('Invalid arguments');flags[args[i]]=args[i+1]}
 if(!['create','verify','restore','catalog'].includes(command)||!flags['--key-file']||!flags['--bin'])throw Error('Usage: create|verify|restore|catalog --key-file private.backup-key --bin absolute-bin [--config local.json] [--output private-dir|--bundle bundle-dir]')
 const keyPath=flags['--key-file'];await assertPrivatePath(keyPath,{key:true})
 const key=await readFile(keyPath)
 try{
  const config=['verify','catalog'].includes(command)?undefined:JSON.parse(await readFile(flags['--config'],'utf8'))
  const options={config,key,bin:flags['--bin'],output:flags['--output'],bundle:flags['--bundle'],codeCommit:flags['--commit']??null,signal:abort.signal}
  if(command==='catalog'){console.log(JSON.stringify(await catalogBackups(options)));return}
  const result=command==='create'?await createBackup(options):command==='verify'?await verifyBackup(options):await restoreBackup(options)
  // Intentionally omit filesystem paths, source details and arbitrary error messages.
  console.log(JSON.stringify({id:result.id,backupMs:result.backupMs,restoreMs:result.restoreMs,restored:result.restored,authenticated:result.authenticated,dataComparison:result.dataComparison}))
 }finally{key.fill(0)}
}
main().catch(()=>{console.error('Backup operation rejected or failed. Check local configuration, tools, permissions and integrity. No source data was changed.');process.exitCode=1})

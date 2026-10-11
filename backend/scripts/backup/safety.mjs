import pg from 'pg'
import { spawn } from 'node:child_process'
import { isAbsolute, join, resolve, dirname } from 'node:path'
import { lstat } from 'node:fs/promises'
const allowed=new Set(['host','port','database','user','password','disposable'])
export async function noSymlinkAncestors(path){
 let current=resolve(path)
 while(true){const s=await lstat(current);if(s.isSymbolicLink())throw Error('Symbolic links are not allowed');const parent=dirname(current);if(parent===current)return;current=parent}
}
export async function assertPrivatePath(path,{key=false}={}){
 await noSymlinkAncestors(path);const s=await lstat(path)
 if(key?(!s.isFile()||s.size!==32):!s.isDirectory())throw Error('Invalid private path')
 if(key){let parent=dirname(resolve(path));while(true){try{await lstat(join(parent,'.git'));throw Error('Keys must stay outside Git')}catch(error){if(error.code!=='ENOENT')throw error}const next=dirname(parent);if(next===parent)break;parent=next}}
 if(process.platform!=='win32'){
  if((s.mode&0o077)||s.uid!==process.getuid())throw Error('Owner-only permissions required')
  return
 }
 // Inspect ACLs without printing identities, paths or file contents. Fail closed.
 const script="$ErrorActionPreference='Stop'; try { $acl=Get-Acl -LiteralPath $env:TASK_BACKUP_PRIVATE_PATH; $me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $allowed=@($me,'S-1-5-18','S-1-5-32-544'); foreach($ace in $acl.Access){ if($ace.AccessControlType -eq 'Allow' -and (([int]$ace.FileSystemRights -band 1) -ne 0)){ $sid=$ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value; if($sid -notin $allowed){exit 1} } }; exit 0 } catch {exit 1}"
 await new Promise((ok,no)=>{const child=spawn(join(process.env.SystemRoot??'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{env:{...childEnvironment(),TASK_BACKUP_PRIVATE_PATH:resolve(path)},stdio:'ignore',windowsHide:true,shell:false});const timer=setTimeout(()=>child.kill(),10000);child.on('error',()=>{clearTimeout(timer);no(Error('Private ACL verification failed'))});child.on('close',code=>{clearTimeout(timer);code===0?ok():no(Error('Owner-only ACL required'))})})
}
export function validateLocalConfig(config){
 if(!config||Object.keys(config).some(k=>!allowed.has(k))||!['localhost','127.0.0.1'].includes(config.host)||!Number.isInteger(config.port)||config.port<1024||config.port>65535||config.port===6543||!/^tecnodesk_backup_test_[a-z0-9]{6,40}$/.test(config.database)||config.disposable!==true||typeof config.user!=='string'||!/^[a-zA-Z0-9_]{1,63}$/.test(config.user)||typeof config.password!=='string')throw Error('Disposable local configuration required')
 return {...config}
}
export function childEnvironment(config){
 const env={};for(const name of ['PATH','SystemRoot','WINDIR','TEMP','TMP','TMPDIR','LANG'])if(process.env[name])env[name]=process.env[name]
 if(config)Object.assign(env,{PGHOST:'127.0.0.1',PGPORT:String(config.port),PGDATABASE:config.database,PGUSER:config.user,PGPASSWORD:config.password,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'10',PGAPPNAME:'tecnodesk-backup-local-tool'})
 return env
}
export async function connectLocal(config){
 config=validateLocalConfig(config)
 const client=new pg.Client({host:'127.0.0.1',port:config.port,database:config.database,user:config.user,password:config.password,connectionTimeoutMillis:10000,application_name:'tecnodesk-backup-local'})
 try{await client.connect(); const {rows:[row]}=await client.query("SELECT current_database() db, host(inet_server_addr()) host, inet_server_port() port, current_setting('server_version_num')::int version, current_setting('server_version') version_text")
 const mismatches=[row.db!==config.database?'DB':null,row.host!=='127.0.0.1'?'HOST':null,row.port!==config.port?'PORT':null,row.version<170000||row.version>=180000?'VERSION':null].filter(Boolean)
 if(mismatches.length){const error=Error('Effective connection mismatch');error.code='LOCAL_'+mismatches.join('_');throw error}
 return {client,serverVersion:row.version_text,major:17}
 }catch(error){await client.end().catch(()=>{});throw Error('Local connection verification failed'+(/^[A-Z0-9_]{3,32}$/.test(error.code??'')?' ('+error.code+')':''))}
}
export async function assertEmpty(client){
 const {rows:[row]}=await client.query("SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN ('r','p','v','m','S','f'))+(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema'))+(SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND t.typtype IN ('e','d'))+(SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%')+(SELECT count(*) FROM pg_extension WHERE extname<>'plpgsql') count")
 if(Number(row.count)!==0)throw Error('Restore destination is not empty')
}
export function toolPath(bin,name){if(!isAbsolute(bin))throw Error('Absolute PostgreSQL bin directory required');return join(bin,name+(process.platform==='win32'?'.exe':''))}
export function runTool(command,args,{config,input,signal,maxBytes=128*1024*1024,timeoutMs=120000}={}){
 return new Promise((resolve,reject)=>{
 let child,done=false,failed=false,total=0,chunks=[];const fail=()=>{if(done)return;failed=true;clearTimeout(timer);if(child)child.kill();else {done=true;reject(Error('PostgreSQL operation failed or cancelled'))}}
 const timer=setTimeout(fail,timeoutMs)
 try{child=spawn(command,args,{env:childEnvironment(config),stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false,signal})}catch{fail();return}
 child.on('error',fail);child.stdout.on('data',b=>{total+=b.length;if(total>maxBytes)fail();else if(!failed)chunks.push(b)})
 // PostgreSQL diagnostics may contain connection data or table values: consume, never print.
 child.stderr.on('data',()=>{});child.stdin.on('error',fail)
 // Wait for close even after cancellation: PostgreSQL must disconnect and roll back.
 child.on('close',code=>{if(done)return;done=true;clearTimeout(timer);if(code===0&&!failed)resolve(Buffer.concat(chunks));else {for(const chunk of chunks)chunk.fill(0);reject(Error('PostgreSQL operation failed or cancelled'))}})
 child.stdin.end(input)
 })
}
export function assertClientVersion(version,major=17){if(Number(version.match(/\(PostgreSQL\) (\d+)\./)?.[1])!==major)throw Error('Matching PostgreSQL 17 client tools required')}
export async function assertTools(bin,major=17){for(const name of ['pg_dump','pg_restore','psql'])assertClientVersion((await runTool(toolPath(bin,name),['--version'])).toString(),major)}

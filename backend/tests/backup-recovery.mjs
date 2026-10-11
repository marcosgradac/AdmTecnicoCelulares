import assert from 'node:assert/strict'
import { mkdtemp,mkdir,rm,readFile,writeFile,readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve,join,dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { randomBytes,randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import fsPromises from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import pg from 'pg'
import { PrismaClient,Prisma } from '@prisma/client'
import { seedBackupFixtures } from './helpers/backup-fixtures.mjs'
import { createBackup,verifyBackup,restoreBackup,catalogBackups } from '../scripts/backup/engine.mjs'
import { checksum } from '../scripts/backup/crypto.mjs'
import { runTool,toolPath,childEnvironment,connectLocal,assertEmpty,assertPrivatePath } from '../scripts/backup/safety.mjs'
const backend=resolve(fileURLToPath(new URL('..',import.meta.url)))
const bin=process.env.PG_BIN||(process.platform==='win32'?join(backend,'.security9-tools/pgsql/bin'):'/usr/lib/postgresql/17/bin')
const root=await mkdtemp(join(tmpdir(),'tecnodesk-security9-')),cluster=join(root,'cluster'),output=join(root,'backup-output')
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r))
const suffix=randomUUID().replaceAll('-','').slice(0,12)
const source={host:'127.0.0.1',port,database:'tecnodesk_backup_test_s'+suffix,user:'postgres',password:'',disposable:true}
const target={...source,database:'tecnodesk_backup_test_r'+suffix}
const key=randomBytes(32);let started=false,prisma,maintenance,checks=0
const pass=message=>{checks++;console.log('PASS '+message)}
const pgTool=(name,args,options={})=>name==='pg_ctl'?new Promise((ok,no)=>{
 // The long-lived server must not inherit captured pipes from its launcher on Windows.
 const child=spawn(toolPath(bin,name),args,{env:childEnvironment(),stdio:'ignore',windowsHide:true,shell:false})
 child.on('error',()=>no(Error('Local cluster control failed')));child.on('exit',code=>code===0?ok(Buffer.alloc(0)):no(Error('Local cluster control failed')))
}):runTool(toolPath(bin,name),args,{...options,timeoutMs:180000})
const dbUrl=c=>`postgresql://${c.user}@127.0.0.1:${c.port}/${c.database}`
function nodeRun(args,env,cwd=root){return new Promise((ok,no)=>{const child=spawn(process.execPath,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',()=>{});const timeout=setTimeout(()=>child.kill(),180000);child.on('error',()=>{clearTimeout(timeout);no(Error('Local subprocess failed'))});child.on('close',code=>{clearTimeout(timeout);code===0?ok(stdout):no(Error('Local subprocess failed'))})})}
async function snapshot(config){const {client}=await connectLocal(config);try{
 const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(x=>x.tablename);const rows={}
 for(const table of tables){const quoted='"'+table.replaceAll('"','""')+'"';rows[table]=(await client.query(`SELECT row_to_json(t) data FROM ${quoted} t ORDER BY row_to_json(t)::text`)).rows.map(x=>x.data)}
 const constraints=(await client.query("SELECT c.conname, c.convalidated, pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY c.conname")).rows
 const sequences=(await client.query("SELECT sequencename,last_value,start_value,increment_by,min_value,max_value,cycle FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows
 const indexes=(await client.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname")).rows
 return {rows,constraints,sequences,indexes}
 }finally{await client.end()}}
async function waitForTool(database,predicate){
 const deadline=Date.now()+15000
 while(Date.now()<deadline){const rows=(await maintenance.query("SELECT pid,wait_event,wait_event_type FROM pg_stat_activity WHERE datname=$1 AND application_name='tecnodesk-backup-local-tool'",[database])).rows;const found=rows.find(predicate);if(found)return found;await new Promise(r=>setTimeout(r,50))}
 throw Error('Synthetic operation did not reach expected interruption point')
}
async function waitForToolExit(database){
 const deadline=Date.now()+15000
 while(Date.now()<deadline){const {rows:[row]}=await maintenance.query("SELECT count(*)::int count FROM pg_stat_activity WHERE datname=$1 AND application_name='tecnodesk-backup-local-tool'",[database]);if(row.count===0)return;await new Promise(r=>setTimeout(r,50))}
 throw Error('Synthetic PostgreSQL tool did not disconnect')
}
try{
 if(process.platform==='win32'){
  // Only the newly-created, owned test directory: do not alter any existing ACL.
  const script="$ErrorActionPreference='Stop'; $acl=New-Object Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true,$false); $me=[Security.Principal.WindowsIdentity]::GetCurrent().User; $acl.SetOwner($me); foreach($sid in @($me.Value,'S-1-5-18','S-1-5-32-544')){ $identity=New-Object Security.Principal.SecurityIdentifier($sid); $rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule) }; Set-Acl -LiteralPath $env:TASK_BACKUP_PRIVATE_PATH -AclObject $acl"
  await new Promise((ok,no)=>{const child=spawn(join(process.env.SystemRoot??'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{env:{...childEnvironment(),TASK_BACKUP_PRIVATE_PATH:root},stdio:'ignore',windowsHide:true});child.on('error',()=>no(Error('Synthetic ACL setup failed')));child.on('close',code=>code===0?ok():no(Error('Synthetic ACL setup failed')))})
 }
 await mkdir(output,{mode:0o700})
 await pgTool('initdb',['-D',cluster,'-U','postgres','-A','trust','-E','UTF8','--no-locale'])
 started=true;await pgTool('pg_ctl',['-D',cluster,'-l',join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);console.log('RUN disposable PostgreSQL 17 migration and fixtures')
 maintenance=new pg.Client({host:'127.0.0.1',port,database:'postgres',user:'postgres'});await maintenance.connect()
 for(const db of [source.database,target.database])await maintenance.query(`CREATE DATABASE "${db}"`)
 const env={...childEnvironment(),NODE_ENV:'test',DOTENV_CONFIG_PATH:join(root,'absent.env'),DATABASE_URL:dbUrl(source)}
 await nodeRun([join(backend,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',join(backend,'prisma/schema.prisma')],env)
 prisma=new PrismaClient({datasources:{db:{url:dbUrl(source)}}});await seedBackupFixtures(prisma)
 const {client}=await connectLocal(source);await client.query('CREATE SEQUENCE public.security9_fixture_sequence START WITH 37');await client.query("SELECT nextval('public.security9_fixture_sequence')");await client.end()
 const before=await snapshot(source)
 for(const model of Prisma.dmmf.datamodel.models)assert.ok(before.rows[model.dbName||model.name]?.length>0,'Missing fictitious model '+model.name)
 const schema=await readFile(join(backend,'prisma/schema.prisma'),'utf8');const modelNames=[...schema.matchAll(/^model (\w+) \{/gm)].map(x=>x[1]).sort();assert.deepEqual(Prisma.dmmf.datamodel.models.map(x=>x.name).sort(),modelNames);pass('all '+modelNames.length+' real Prisma models represented, two workshops and complete migrations')
 const saved=await createBackup({config:source,key,bin,output});assert.equal(saved.manifest.metadata.restoreTest,'not-tested');pass('custom archive encrypted; no plaintext file; completion manifest')
 assert.deepEqual((await readdir(saved.bundle)).sort(),['archive.tdbackup','manifest.json'])
 const verified=await verifyBackup({bundle:saved.bundle,key,bin});assert.equal(verified.authenticated,true);pass('AES-GCM, SHA-256 and custom archive structure verified')
 const catalogue=await catalogBackups({output,key,bin});assert.equal(catalogue.validatedBundles,1);assert.deepEqual(catalogue.keep,[saved.id]);assert.equal(catalogue.deleteAutomatically,false);pass('real encrypted catalogue authenticated; retention dry-run cannot delete')
 const testKey=join(root,'fictitious.backup-key');await writeFile(testKey,key,{mode:0o600});await assertPrivatePath(testKey,{key:true})
 await nodeRun([join(backend,'scripts/backup/cli.mjs'),'verify','--key-file',testKey,'--bin',bin,'--bundle',saved.bundle],childEnvironment());pass('CLI accepts private fictitious key outside Git without printing secrets')
 const weak=join(root,'unsafe-permission-test');await mkdir(weak,{mode:0o755});const weakKey=join(weak,'fictitious.backup-key');await writeFile(weakKey,key,{mode:0o644})
 if(process.platform==='win32')await runTool(join(process.env.SystemRoot??'C:\\Windows','System32/icacls.exe'),[weak,'/grant','*S-1-5-32-545:(OI)(CI)R'])
 await assert.rejects(()=>assertPrivatePath(weakKey,{key:true}));await assert.rejects(()=>createBackup({config:source,key,bin,output:weak}));assert.deepEqual(await readdir(weak),['fictitious.backup-key']);pass('readable-by-others key and output directory rejected before backup publication')
 const restored=await restoreBackup({config:target,key,bin,bundle:saved.bundle});assert.equal(restored.restored,true)
 const after=await snapshot(target);assert.equal(checksum(Buffer.from(JSON.stringify(after))),checksum(Buffer.from(JSON.stringify(before))));pass('all rows/IDs/monetary integers/dates/hashes/FKs/indexes/migrations/sequence values match exactly')
 const restoredClient=(await connectLocal(target)).client
 const cross=await restoredClient.query('SELECT count(*)::int count FROM "Repair" r JOIN "Client" c ON c.id=r."clientId" WHERE r."businessId"<>c."businessId"');assert.equal(cross.rows[0].count,0)
 await assert.rejects(()=>restoredClient.query('INSERT INTO "Client" (id,"businessId",name,"updatedAt") VALUES (\'synthetic-bad-fk\',\'missing-workshop\',\'fixture\',now())'));pass('tenant references intact and PostgreSQL rejects invalid foreign key')
 const next=await restoredClient.query("SELECT nextval('public.security9_fixture_sequence') value");assert.equal(Number(next.rows[0].value),38);await restoredClient.end();pass('restored sequence resumes correctly')
 await nodeRun(['--import','tsx','tests/backup-restored-api.ts'],{...env,DATABASE_URL:dbUrl(target),BACKUP_DISPOSABLE:'true',JWT_SECRET:'security9-fictitious-local-jwt',CLIENT_IP_MODE:'baseline',ORIGIN_AUTH_ENABLED:'false',RESEND_API_KEY:'',MAIL_MODE:'console'},backend);pass('real backend reads restored DB, synthetic login, cash/repairs and cross-tenant rejection')
 await assert.rejects(()=>restoreBackup({config:target,key,bin,bundle:saved.bundle}),/not empty/);pass('nonempty restore rejected before writes')
 const objects={...source,database:'tecnodesk_backup_test_o'+suffix};await maintenance.query(`CREATE DATABASE "${objects.database}"`);const objectClient=(await connectLocal(objects)).client
 for(const [create,drop]of [["CREATE TYPE public.security9_enum AS ENUM ('fake')",'DROP TYPE public.security9_enum'],['CREATE SCHEMA security9_schema','DROP SCHEMA security9_schema']]){await objectClient.query(create);await assert.rejects(()=>restoreBackup({config:objects,key,bin,bundle:saved.bundle}),/not empty/);await objectClient.query(drop)}
 await objectClient.end();pass('nonempty enum-only and schema-only destinations rejected')
 await assert.rejects(()=>verifyBackup({bundle:saved.bundle,key:randomBytes(32),bin}));pass('wrong encryption key rejected')
 const encrypted=await readFile(join(saved.bundle,'archive.tdbackup')),manifest=await readFile(join(saved.bundle,'manifest.json'))
 for(const [name,bad]of [['empty',Buffer.alloc(0)],['truncated',encrypted.subarray(0,encrypted.length/2)],['corrupted',Buffer.from(encrypted)]]){if(name==='corrupted')bad[100]^=1;const broken=join(root,name);await mkdir(broken);await writeFile(join(broken,'archive.tdbackup'),bad);await writeFile(join(broken,'manifest.json'),manifest);await assert.rejects(()=>verifyBackup({bundle:broken,key,bin}));pass(name+' backup rejected')}
 const tampered=JSON.parse(manifest);tampered.metadata.plainSha256='0'.repeat(64);await writeFile(join(saved.bundle,'manifest.json'),JSON.stringify(tampered));await assert.rejects(()=>verifyBackup({bundle:saved.bundle,key,bin}));await writeFile(join(saved.bundle,'manifest.json'),manifest);pass('authenticated manifest / incorrect checksum rejected')
 await assert.rejects(()=>runTool(process.execPath,['-e','process.exit(1)']));pass('failed process rejected without diagnostic leakage')
 await assert.rejects(()=>runTool(process.execPath,['-e','process.stdout.write("too large")'],{maxBytes:1}));pass('size overflow controlled')
 const controller=new AbortController();controller.abort();await assert.rejects(()=>runTool(process.execPath,['-e','setTimeout(()=>{},10000)'],{signal:controller.signal}));pass('cancellation controlled')
 await assert.rejects(()=>runTool(process.execPath,['-e','setTimeout(()=>{},10000)'],{timeoutMs:50}));pass('unexpected stalled operation controlled')
 await assert.rejects(()=>createBackup({config:{...source,port:1},key,bin,output}));pass('invalid / disconnected configuration rejected')
 const actualWrite=fsPromises.writeFile
 for(const code of ['ENOSPC','EACCES']){
  const existing=(await readdir(output)).sort()
  try{fsPromises.writeFile=async()=>{const e=Error('Simulated filesystem failure');e.code=code;throw e};syncBuiltinESMExports();await assert.rejects(()=>createBackup({config:source,key,bin,output}))}
  finally{fsPromises.writeFile=actualWrite;syncBuiltinESMExports()}
  assert.deepEqual((await readdir(output)).sort(),existing);pass(code+' simulated failure leaves no invalid published bundle')
 }
 await maintenance.query('CREATE ROLE security9_denied LOGIN');await assert.rejects(()=>createBackup({config:{...source,user:'security9_denied'},key,bin,output}));pass('insufficient pg_dump permissions rejected without valid publication')
 const readonly={...source,database:'tecnodesk_backup_test_e'+suffix,user:'security9_denied'};await maintenance.query(`CREATE DATABASE "${readonly.database}"`)
 await assert.rejects(()=>restoreBackup({config:readonly,key,bin,bundle:saved.bundle}));const empty=(await connectLocal(readonly)).client;await assertEmpty(empty);await empty.end();pass('pg_restore permission failure rolls back transaction to empty destination')
 // Interrupt an actual pg_dump connection while it waits for a synthetic table lock.
 const lock=(await connectLocal(source)).client;await lock.query('BEGIN');await lock.query('LOCK TABLE "Client" IN ACCESS EXCLUSIVE MODE')
 try{
  const rejected=assert.rejects(createBackup({config:source,key,bin,output}));const dumping=await waitForTool(source.database,row=>row.wait_event_type==='Lock')
  await maintenance.query('SELECT pg_terminate_backend($1)',[dumping.pid]);await rejected;await waitForToolExit(source.database)
 }finally{await lock.query('ROLLBACK');await lock.end()}
 pass('actual interrupted pg_dump connection fails without publication or source writes')
 // Make COPY deliberately slow only in the owned fictitious source, then cancel mid-restore.
 const slow=(await connectLocal(source)).client
 await slow.query("CREATE FUNCTION public.security9_restore_delay(text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(3); RETURN true; END $$")
 await slow.query('ALTER TABLE "Client" ADD CONSTRAINT security9_restore_delay_check CHECK (public.security9_restore_delay(id))')
 try{
  const delayed=await createBackup({config:source,key,bin,output});const cancelled={...source,database:'tecnodesk_backup_test_c'+suffix};await maintenance.query(`CREATE DATABASE "${cancelled.database}"`)
  const abort=new AbortController();const operation=restoreBackup({config:cancelled,key,bin,bundle:delayed.bundle,signal:abort.signal}).then(()=>true,()=>false)
  try{await waitForTool(cancelled.database,row=>row.wait_event==='PgSleep')}finally{abort.abort()}
  assert.equal(await operation,false);await waitForToolExit(cancelled.database)
  const connection=(await connectLocal(cancelled)).client;await assertEmpty(connection);await connection.end()
  pass('actual in-flight pg_restore cancellation rolls back every object to an empty destination')
 }finally{await slow.query('ALTER TABLE "Client" DROP CONSTRAINT security9_restore_delay_check');await slow.query('DROP FUNCTION public.security9_restore_delay(text)');await slow.end()}
 assert.equal(checksum(Buffer.from(JSON.stringify(await snapshot(source)))),checksum(Buffer.from(JSON.stringify(before))));pass('source unchanged throughout all negative operations')
 console.log(JSON.stringify({checks,models:modelNames.length,tables:Object.keys(before.rows).length,backupBytes:saved.manifest.encryptedSize,backupMs:saved.backupMs,restoreMs:restored.restoreMs,restoreComparison:'passed',productionAccess:false}))
}finally{
 key.fill(0);await prisma?.$disconnect();await maintenance?.end()
 assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(root.startsWith(join(resolve(tmpdir()),'tecnodesk-security9-')))
 if(started)await pgTool('pg_ctl',['-D',cluster,'-m','fast','-w','stop'])
 await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}

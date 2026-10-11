import { mkdir, readFile, writeFile, lstat, rm, readdir } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { validateLocalConfig,connectLocal,assertEmpty,assertTools,runTool,toolPath,assertPrivatePath,noSymlinkAncestors } from './safety.mjs'
import { checksum,encryptBuffer,decryptBuffer } from './crypto.mjs'
import { retentionPlan } from './catalog.mjs'
const maxSize=128*1024*1024
async function regular(path,limit){await noSymlinkAncestors(path);const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size<1||s.size>limit)throw Error('Invalid backup file');return readFile(path)}
async function archiveCheck(plain,bin,signal){if(plain.length<32||!plain.subarray(0,5).equals(Buffer.from('PGDMP')))throw Error('Empty or invalid custom archive');await runTool(toolPath(bin,'pg_restore'),['--list'],{input:plain,signal})}
export async function createBackup({config,key,bin,output,codeCommit=null,signal}){
 config=validateLocalConfig(config);await assertTools(bin)
 if(codeCommit!==null&&!/^[a-f0-9]{40}$/.test(codeCommit))throw Error('Invalid code commit')
 const {client,serverVersion}=await connectLocal(config)
 const root=resolve(output),id='backup-'+new Date().toISOString().replace(/[^0-9TZ]/g,'')+'-'+randomUUID(),bundle=join(root,id)
 let owned=false,plain
 try{
  await assertPrivatePath(root)
  await mkdir(bundle,{mode:0o700});owned=true
  const start=performance.now()
  plain=await runTool(toolPath(bin,'pg_dump'),['--format=custom','--no-owner','--no-acl','--no-password','--lock-wait-timeout=10000'],{config,signal,maxBytes:maxSize})
  await archiveCheck(plain,bin,signal)
  const metadata={version:1,id,createdAt:new Date().toISOString(),postgresVersion:serverVersion,clientMajor:17,format:'pg_dump-custom',plainSize:plain.length,plainSha256:checksum(plain),codeCommit,archiveValidation:'structure-checked',restoreTest:'not-tested'}
  const encrypted=encryptBuffer(plain,key,metadata)
  const manifest={metadata,encryptedSize:encrypted.length,encryptedSha256:checksum(encrypted)}
  await writeFile(join(bundle,'archive.tdbackup'),encrypted,{flag:'wx',mode:0o600})
  // Manifest is the completion marker; an interrupted directory without it is not valid.
  await writeFile(join(bundle,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600})
  return {id,bundle,manifest,backupMs:Math.round(performance.now()-start)}
 }catch{
  if(owned&&dirname(resolve(bundle))===root)await rm(bundle,{recursive:true,force:true}).catch(()=>{})
  throw Error('Backup failed; no valid backup published')
 }finally{plain?.fill(0);await client.end()}
}
async function openBackup({bundle,key,bin,signal}){
 const manifest=JSON.parse((await regular(join(bundle,'manifest.json'),16384)).toString())
 if(!manifest.metadata||manifest.metadata.version!==1||manifest.metadata.clientMajor!==17||manifest.metadata.format!=='pg_dump-custom'||manifest.metadata.restoreTest!=='not-tested'||manifest.metadata.archiveValidation!=='structure-checked')throw Error('Invalid backup manifest')
 const encrypted=await regular(join(bundle,'archive.tdbackup'),maxSize+36)
 if(manifest.encryptedSize!==encrypted.length||manifest.encryptedSha256!==checksum(encrypted))throw Error('Encrypted backup checksum mismatch')
 const plain=decryptBuffer(encrypted,key,manifest.metadata)
 try{if(plain.length!==manifest.metadata.plainSize||checksum(plain)!==manifest.metadata.plainSha256)throw Error('Archive checksum mismatch');await archiveCheck(plain,bin,signal);return {plain,manifest}}catch(e){plain.fill(0);throw e}
}
export async function verifyBackup(options){await assertTools(options.bin);const {plain,manifest}=await openBackup(options);try{return {id:manifest.metadata.id,createdAt:manifest.metadata.createdAt,sha256:manifest.metadata.plainSha256,authenticated:true,checksum:true,archiveStructure:true,restoreTest:'not-tested'}}finally{plain.fill(0)}}
export async function catalogBackups({output,key,bin,signal}){
 const root=resolve(output),entries=[]
 const directory=await lstat(root);if(!directory.isDirectory()||directory.isSymbolicLink())throw Error('Invalid catalogue directory')
 for(const name of (await readdir(root)).sort()){
  if(!name.startsWith('backup-'))continue
  const bundle=join(root,name),s=await lstat(bundle);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Invalid catalogue bundle')
  const verified=await verifyBackup({bundle,key,bin,signal});if(verified.id!==name)throw Error('Catalogue identifier mismatch')
  entries.push({id:verified.id,createdAt:verified.createdAt,sha256:verified.sha256,validated:true})
 }
 return {...retentionPlan(entries),validatedBundles:entries.length}
}
export async function restoreBackup(options){
 const config=validateLocalConfig(options.config);await assertTools(options.bin)
 const {client}=await connectLocal(config)
 let plain
 try{
  await assertEmpty(client)
  const archive=await openBackup(options);plain=archive.plain
  // Verify again immediately before the write. No --clean, DROP DATABASE or reset.
  await assertEmpty(client)
  const start=performance.now()
  await runTool(toolPath(options.bin,'pg_restore'),['--no-password','--no-owner','--no-acl','--single-transaction','--exit-on-error','--dbname',config.database],{config,input:plain,signal:options.signal})
  return {id:archive.manifest.metadata.id,restoreMs:Math.round(performance.now()-start),restored:true,dataComparison:'required'}
 }finally{plain?.fill(0);await client.end()}
}

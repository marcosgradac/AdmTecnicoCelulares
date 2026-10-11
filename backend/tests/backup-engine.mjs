import assert from 'node:assert/strict'
import { mkdtemp,rm,readdir,writeFile,mkdir,symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join,dirname,resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createBackup, verifyBackup, restoreBackup } from '../scripts/backup/engine.mjs'
import { noSymlinkAncestors,assertPrivatePath } from '../scripts/backup/safety.mjs'
const root=await mkdtemp(join(tmpdir(),'tecnodesk-backup-unit-'))
try{
 const key=randomBytes(32),remote={host:'db.fake.supabase.co',port:5432,database:'postgres',user:'postgres',password:'secret-never-logged',disposable:true}
 for(const task of [()=>createBackup({config:remote,key,bin:root,output:root}),()=>restoreBackup({config:remote,key,bin:root,bundle:root})])await assert.rejects(task,/Disposable local/)
 assert.deepEqual(await readdir(root),[])
 await writeFile(join(root,'archive.tdbackup'),'truncated')
 await writeFile(join(root,'manifest.json'),JSON.stringify({metadata:{id:'fictitious'},encryptedSha256:'bad',encryptedSize:9}))
 await assert.rejects(()=>verifyBackup({bundle:root,key,bin:root}))
 const target=join(root,'owned-target');await mkdir(target);await writeFile(join(target,'fixture'),'fictitious');const link=join(root,'owned-link');await symlink(target,link,process.platform==='win32'?'junction':'dir');await assert.rejects(()=>noSymlinkAncestors(join(link,'fixture')),/Symbolic links/)
 const repo=join(root,'fictitious-repo');await mkdir(join(repo,'.git'),{recursive:true});const repoKey=join(repo,'fictitious.backup-key');await writeFile(repoKey,key,{mode:0o600});await assert.rejects(()=>assertPrivatePath(repoKey,{key:true}),/outside Git/)
 console.log('PASS engine fails before remote connection and rejects damaged bundle')
}finally{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(root.startsWith(join(resolve(tmpdir()),'tecnodesk-backup-unit-')));await rm(root,{recursive:true,force:true})}

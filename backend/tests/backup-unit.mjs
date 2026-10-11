import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { validateLocalConfig, childEnvironment,assertClientVersion } from '../scripts/backup/safety.mjs'
import { encryptBuffer, decryptBuffer } from '../scripts/backup/crypto.mjs'
import { retentionPlan } from '../scripts/backup/catalog.mjs'
const good={host:'127.0.0.1',port:55440,database:'tecnodesk_backup_test_abc123',user:'postgres',password:'fictitious',disposable:true}
assertClientVersion('pg_dump (PostgreSQL) 17.11')
for(const version of ['pg_dump (PostgreSQL) 16.15','pg_dump (PostgreSQL) 18.6','unrecognized'])assert.throws(()=>assertClientVersion(version))
assert.deepEqual(validateLocalConfig(good),good)
for(const config of [{...good,host:'db.fake.supabase.co'},{...good,host:'tecnodesk-api.onrender.com'},{...good,host:'127.1'},{...good,host:'::1'},{...good,database:'postgres'},{...good,disposable:false},{...good,port:6543},{...good,options:'-c search_path=public'},{...good,database:'tecnodesk_backup_test_abc123;DROP'}]) assert.throws(()=>validateLocalConfig(config))
process.env.DATABASE_URL='postgresql://sensitive@remote/production'
process.env.PGHOST='remote'; process.env.PGSERVICE='production'; process.env.NODE_OPTIONS='--import fake'
const env=childEnvironment(good)
assert.equal(env.DATABASE_URL,undefined);assert.equal(env.PGSERVICE,undefined);assert.equal(env.NODE_OPTIONS,undefined);assert.equal(env.PGHOST,'127.0.0.1');delete process.env.DATABASE_URL;delete process.env.PGHOST;delete process.env.PGSERVICE;delete process.env.NODE_OPTIONS
const key=randomBytes(32),plain=Buffer.from('PGDMP fictitious only'),manifest={id:'synthetic',format:'custom'}
const encrypted=encryptBuffer(plain,key,manifest)
assert.deepEqual(decryptBuffer(encrypted,key,manifest),plain)
assert.throws(()=>decryptBuffer(encrypted,randomBytes(32),manifest))
assert.throws(()=>decryptBuffer(encrypted,key,{...manifest,id:'changed'}))
for(const value of [Buffer.alloc(0),encrypted.subarray(0,20),Buffer.from(encrypted)]) {if(value.length===encrypted.length)value[value.length-20]^=1;assert.throws(()=>decryptBuffer(value,key,manifest))}
const entries=Array.from({length:100},(_,i)=>({id:`backup-${i}`,createdAt:new Date(Date.UTC(2026,9,10-i)).toISOString(),sha256:String(i===99?0:i).padStart(64,'0'),validated:true}))
const plan=retentionPlan(entries)
assert.equal(new Set([...plan.keep,...plan.candidates]).size,100);assert.ok(plan.keep.length>=7);assert.ok(plan.keep.length<=14);assert.equal(plan.deleteAutomatically,false)
assert.equal(plan.duplicates.length,1)
// Daily Oct 10..4; Monday weeks Oct 5, Sep 28, Sep 21, Sep 14;
// latest monthly representatives Oct 10, Sep 30 and Aug 31.
assert.deepEqual(new Set(plan.keep),new Set(['backup-0','backup-1','backup-2','backup-3','backup-4','backup-5','backup-6','backup-13','backup-20','backup-10','backup-40']))
assert.throws(()=>retentionPlan([...entries,entries[0]]))
assert.throws(()=>retentionPlan([{id:'../../unsafe',createdAt:'bad',validated:true}]))
console.log('PASS backup guards, authenticated encryption and retention dry-run')

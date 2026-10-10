import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createOriginAuthMiddleware } from '../src/middlewares/origin-auth'
const secret=randomBytes(32).toString('hex')
for(const flag of ['true','TRUE','1','','unexpected']) {
 for(const value of [undefined,'','short','g'.repeat(64),'a'.repeat(63),'a'.repeat(65),' '+secret,secret+' ',secret+',other']) {
  assert.throws(()=>createOriginAuthMiddleware({ORIGIN_AUTH_ENABLED:flag,ORIGIN_AUTH_SECRET:value}),error=>error instanceof Error && error.message==='Origin authentication configuration is invalid')
 }
}
assert.throws(()=>createOriginAuthMiddleware({ORIGIN_AUTH_ENABLED:'TRUE',ORIGIN_AUTH_SECRET:secret}))
assert.doesNotThrow(()=>createOriginAuthMiddleware({ORIGIN_AUTH_ENABLED:'true',ORIGIN_AUTH_SECRET:secret}))
for(const environment of [{},{ORIGIN_AUTH_ENABLED:'false'},{ORIGIN_AUTH_ENABLED:'false',ORIGIN_AUTH_SECRET:'ignored-invalid-value'}]) {
 const middleware=createOriginAuthMiddleware(environment)
 let passed=false
 middleware({} as any,{} as any,()=>{passed=true})
 assert.equal(passed,true,'Disabled/default must retain previous behavior')
}
console.log('Origin auth configuration: invalid startup rejected; default disabled OK')

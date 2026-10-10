import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createOriginAuthMiddleware } from '../src/middlewares/origin-auth'
const secret=randomBytes(32).toString('hex')
// Capture only the diagnostic output; credentials remain synthetic and local.
const originalInfo = console.info
const diagnostics: unknown[][] = []
console.info = (...args: unknown[]) => { diagnostics.push(args) }
try {
 for (const environment of [
  { ORIGIN_AUTH_ENABLED: 'TRUE', ORIGIN_AUTH_SECRET: secret },
  { ORIGIN_AUTH_ENABLED: 'true', ORIGIN_AUTH_SECRET: 'invalid' },
 ]) {
  assert.throws(() => createOriginAuthMiddleware(environment))
  assert.deepEqual(diagnostics, [], 'Invalid configuration must not emit a state diagnosis')
 }
 for (const [flag, expectedMessage, expectedStatus] of [
  [undefined, '[origin-auth] disabled', 200],
  ['false', '[origin-auth] disabled', 200],
  ['true', '[origin-auth] enabled', 403],
 ] as const) {
  diagnostics.length = 0
  const environment: NodeJS.ProcessEnv = { ORIGIN_AUTH_SECRET: secret }
  if (flag !== undefined) environment.ORIGIN_AUTH_ENABLED = flag
  const middleware = createOriginAuthMiddleware(environment)
  assert.deepEqual(diagnostics, [[expectedMessage]], 'Initialization must emit only the effective state')
  // The diagnostic and enforcement both describe the startup snapshot.
  environment.ORIGIN_AUTH_ENABLED = flag === 'true' ? 'false' : 'true'
  for (const path of ['/health', '/api/health', '/api/health']) {
   let status = 200
   const response = { setHeader() {}, status(value: number) { status = value; return this }, json() {} }
   middleware({ method: 'GET', path, rawHeaders: [], headers: {} } as any, response as any, () => {})
   assert.equal(status, path === '/health' ? 200 : expectedStatus)
  }
  assert.deepEqual(diagnostics, [[expectedMessage]], 'Requests must not repeat the startup diagnosis')
 }
} finally {
 console.info = originalInfo
}
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

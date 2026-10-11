import assert from 'node:assert/strict'
process.env.NODE_ENV='test'
process.env.DOTENV_CONFIG_PATH='security8-no-env'
process.env.JWT_SECRET='security8-local-test-only'
process.env.ORIGIN_AUTH_ENABLED='false'
process.env.CLIENT_IP_MODE='baseline'
process.env.DATABASE_URL='postgresql://local:local@127.0.0.1:1/security8_not_connected'
async function main(){
  const [{app},{prisma},{renderTrackingPreview},{passwordChangeCodeTemplate}]=await Promise.all([
    import('../src/app'),import('../src/lib/prisma'),import('../src/modules/tracking/tracking-preview'),import('../src/services/email/templates/password-change-code.template'),
  ])
  const payload='"><img src=x onerror="globalThis.xss=true"><svg onload="globalThis.xss=true">&\''
  for(const logo of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','https://example.test/logo.png?x=" onerror="alert(1)','https://user:password@example.test/logo.png']){
    const html=renderTrackingPreview({trackingEnabled:true,trackingExpiresAt:null,business:{id:'synthetic',name:payload,logoUrl:logo}},payload,payload,(_id,value)=>value)
    assert.ok(!html.includes('<img')&&!html.includes('<svg'))
    assert.ok(!html.includes('content="javascript:')&&!html.includes('content="data:'))
    assert.ok(!html.includes('user:password'))
    assert.ok(html.includes('&lt;img'))
  }
  const email=passwordChangeCodeTemplate({to:'fictional@example.test',name:payload,code:'123456',expiresInMinutes:10})
  assert.ok(!email.html.includes('<img')&&!email.html.includes('<svg'))
  assert.ok(email.html.includes('&lt;img'))
  assert.ok(email.html.includes('123456')&&email.text.includes('123456'))
  const server=app.listen(0,'127.0.0.1')
  await new Promise<void>(resolve=>server.once('listening',resolve))
  const address=server.address();assert.ok(address&&typeof address==='object')
  try{
    const response=await fetch(`http://127.0.0.1:${address.port}/api/tracking-preview/invalid`)
    assert.equal(response.status,200)
    assert.equal(response.headers.get('x-content-type-options'),'nosniff')
    assert.equal(response.headers.get('referrer-policy'),'no-referrer')
    assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN')
    const csp=response.headers.get('content-security-policy')!
    assert.ok(csp.includes("script-src 'self'"))
    assert.ok(csp.includes("object-src 'none'"))
    assert.ok(!csp.includes('unsafe-eval'))
    assert.ok(response.headers.get('strict-transport-security'))
    assert.ok(!(await response.text()).includes('<script'))
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await prisma.$disconnect()}
  console.log('Browser hardening backend passed: OG escaping, URL protocols, email escaping and actual Helmet headers')
}
main().catch(error=>{console.error(error.message);process.exitCode=1})

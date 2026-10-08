const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { pathToFileURL } = require('node:url')

async function main() {
  const { prepareApiRewrites } = await import(pathToFileURL(path.resolve(__dirname, '../scripts/prepare-api-domain.mjs')).href)
  const current = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8'))
  const before = JSON.stringify(current)
  const prepared = prepareApiRewrites(current, 'https://api.tecnodeskpro.com/')
  assert.equal(JSON.stringify(current), before, 'preparation does not mutate the active config')
  assert.equal(prepared.rewrites[0].destination, 'https://api.tecnodeskpro.com/api/tracking-preview/:token?clientSlug=:clientSlug')
  assert.equal(prepared.rewrites[1].destination, 'https://api.tecnodeskpro.com/api/tracking-preview/:token')
  assert.deepEqual(prepared.rewrites[2], current.rewrites[2])
  assert.deepEqual(prepared.rewrites.map(({ destination, ...rule }) => rule), current.rewrites.map(({ destination, ...rule }) => rule))
  assert.deepEqual(prepared, current, 'committed rewrites use the verified protected API')
  const rollback = prepareApiRewrites(prepared, 'https://tecnodesk-api.onrender.com')
  assert.equal(rollback.rewrites[0].destination, 'https://tecnodesk-api.onrender.com/api/tracking-preview/:token?clientSlug=:clientSlug')
  assert.equal(rollback.rewrites[1].destination, 'https://tecnodesk-api.onrender.com/api/tracking-preview/:token')
  assert.deepEqual(prepareApiRewrites(rollback, 'https://api.tecnodeskpro.com'), current, 'rollback is reversible')
  for (const origin of ['http://api.tecnodeskpro.com', 'https://user:secret@example.test', 'https://example.test/api', 'https://example.test?x=1', 'bad']) {
    assert.throws(() => prepareApiRewrites(current, origin))
  }
  assert.throws(() => prepareApiRewrites({ rewrites: [] }, 'https://api.tecnodeskpro.com'), /preview/)
  const source = fs.readFileSync(path.resolve(__dirname, '../src/config/env.ts'), 'utf8')
  for (const origin of ['https://tecnodesk-api.onrender.com', 'https://api.tecnodeskpro.com']) {
    for (const suffix of ['', '/api']) {
      const code = ts.transpileModule(source.replaceAll('import.meta.env', 'testEnv'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText
      const context = { exports: {}, URL, window: { location: new URL('https://www.tecnodeskpro.com') },
        testEnv: { VITE_API_URL: origin + suffix, DEV: false, VITE_TURNSTILE_SITE_KEY: 'unchanged-test-key' } }
      vm.runInNewContext(code, context)
      assert.equal(context.exports.env.backendUrl, origin)
      assert.equal(context.exports.env.apiUrl, `${origin}/api`)
      assert.equal(context.exports.env.turnstileSiteKey, 'unchanged-test-key')
      assert.equal(new URL('/api/business-logo/local', context.exports.env.backendUrl).href, `${origin}/api/business-logo/local`)
      await checkServices(context.exports.env, origin)
    }
  }
  console.log('API domain preparation: both origins, preview rewrites, SPA, Turnstile and rollback OK (offline).')
}

// Execute the real frontend service modules; only Axios transport/browser storage are mocked.
async function checkServices(env, origin) {
  const calls = []
  let requestInterceptor
  let baseURL
  const repair = { id: 'local-repair', status: 'RECEIVED', client: { id: 'local-client', name: 'Local' },
    createdAt: '2026-01-01T00:00:00Z', business: { name: 'Local', logoUrl: '/api/business-logo/local' } }
  const user = { business: { name: 'Local', logoUrl: '/api/business-logo/local' } }
  const client = { interceptors: { request: { use(fn) { requestInterceptor = fn } }, response: { use() {} } } }
  for (const method of ['get', 'post', 'patch', 'delete']) {
    client[method] = async (url, input, options) => {
      const config = { headers: { has(name) { return Object.hasOwn(this, name) }, ...(method === 'get' ? input?.headers : options?.headers) } }
      requestInterceptor(config)
      calls.push({ method, url: baseURL + url, input, config })
      const data = url === '/health' ? { ok: true }
        : ['/auth/login', '/auth/register'].includes(url) ? { token: 'local-session', user }
        : url === '/repairs' && method === 'get' ? { items: [] }
        : url.startsWith('/tracking/') || url.startsWith('/repairs') ? repair
        : { success: true }
      return { data }
    }
  }
  const load = (file, dependencies) => {
    const exports = {}
    const source = fs.readFileSync(path.resolve(__dirname, '../src/services', file), 'utf8').replaceAll('import.meta.env', 'testEnv')
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    vm.runInNewContext(code, { exports, URL, testEnv: { DEV: false },
      localStorage: { getItem() { return 'local-jwt' } },
      require(name) {
        assert.ok(Object.hasOwn(dependencies, name), `unexpected dependency ${name}`)
        return dependencies[name]
      },
    })
    return exports
  }
  const apiModule = load('api.ts', { axios: { default: { create(config) { baseURL = config.baseURL; return client } } }, '../config/env': { env } })
  assert.equal(baseURL, `${origin}/api`)
  assert.equal(apiModule.apiAssetUrl('/api/business-logo/local'), `${origin}/api/business-logo/local`)
  assert.equal(apiModule.apiAssetUrl('https://images.example.test/logo.png'), 'https://images.example.test/logo.png')
  assert.equal(apiModule.apiAssetUrl(null), undefined)
  assert.equal(await apiModule.checkApiHealth(), true)
  const auth = load('auth.ts', { './api': apiModule })
  const loginInput = { email: 'local@example.test', password: 'local-only', turnstileToken: 'local-turnstile' }
  assert.equal((await auth.login(loginInput)).user.business.logoUrl, `${origin}/api/business-logo/local`)
  assert.equal(calls.at(-1).input, loginInput)
  assert.equal(calls.at(-1).url, `${origin}/api/auth/login`)
  assert.equal((await auth.register(loginInput)).user.business.logoUrl, `${origin}/api/business-logo/local`)
  assert.equal(calls.at(-1).url, `${origin}/api/auth/register`)
  await auth.forgotPassword('local@example.test')
  assert.equal(calls.at(-1).url, `${origin}/api/auth/forgot-password`)
  assert.equal(calls.at(-1).input.email, 'local@example.test')
  await auth.resetPassword('local-reset-token', 'local-new-password')
  assert.equal(calls.at(-1).url, `${origin}/api/auth/reset-password`)
  assert.equal(calls.at(-1).input.token, 'local-reset-token')
  const repairs = load('repairs.ts', { './api': apiModule })
  await repairs.getRepairs()
  assert.equal(calls.at(-1).url, `${origin}/api/repairs`)
  await repairs.editRepair('local-repair', { issue: 'local-only' })
  assert.equal(calls.at(-1).url, `${origin}/api/repairs/local-repair/edit`)
  for (const token of ['AbCdEf012345_-xy', 'a'.repeat(64)]) {
    const tracking = await repairs.getTrackingRepair(token, 'local-turnstile')
    assert.equal(calls.at(-1).url, `${origin}/api/tracking/${token}`)
    assert.equal(calls.at(-1).config.headers['X-Turnstile-Token'], 'local-turnstile')
    assert.equal(tracking.business.logoUrl, `${origin}/api/business-logo/local`)
  }
  for (const call of calls) assert.equal(call.config.headers.Authorization, 'Bearer local-jwt')
}
main().catch(error => { console.error(error); process.exitCode = 1 })

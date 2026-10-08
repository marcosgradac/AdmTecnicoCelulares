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
  assert.deepEqual(prepareApiRewrites(prepared, 'https://tecnodesk-api.onrender.com'), current, 'rollback restores current config')
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
    }
  }
  console.log('API domain preparation: both origins, preview rewrites, SPA, Turnstile and rollback OK (offline).')
}
main().catch(error => { console.error(error); process.exitCode = 1 })

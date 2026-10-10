import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
process.env.NODE_ENV = 'test'
process.env.DOTENV_CONFIG_PATH = 'refactor-no-env-file'
process.env.JWT_SECRET = 'route-registration-local-only'
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/never_connected'
process.env.ORIGIN_AUTH_ENABLED = 'false'
process.env.CLIENT_IP_MODE = 'baseline'
function describe(stack: any[]): unknown[] {
  return stack.map(layer => layer.route
    ? { path: layer.route.path, methods: Object.keys(layer.route.methods), handlers: layer.route.stack.map((handler: any) => handler.name) }
    : { middleware: layer.name, ...(layer.handle.stack ? { children: describe(layer.handle.stack) } : {}) })
}
async function main() {
  const { app } = await import('../src/server')
  const actual = describe((app as any).router.stack)
  const fixture = resolve(__dirname, 'fixtures/route-registration.json')
  assert.deepEqual(actual, JSON.parse(readFileSync(fixture, 'utf8')), 'Endpoint methods, registration order and middleware stack must preserve the pre-refactor contract')
  console.log('Route registration contract: OK')
}
main().catch(error => { console.error(error); process.exitCode = 1 })

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const database = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) && database.pathname.endsWith('_test'), 'Disposable local test database required')
assert.ok(process.env.JWT_SECRET, 'Set a local test JWT secret')
process.env.NODE_ENV = 'test'
process.env.DOTENV_CONFIG_PATH = 'local-api-no-env-file'
process.env.ORIGIN_AUTH_ENABLED = 'false'
const require = createRequire(import.meta.url)
require('tsx/cjs')
const nativeFetch = globalThis.fetch
globalThis.fetch = (input, init) => String(input) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
  ? Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
  : nativeFetch(input, init)

const { app } = require('../../src/app.ts')
const { prisma } = require('../../src/lib/prisma.ts')
const server = app.listen(0, '127.0.0.1')
await new Promise(resolve => server.once('listening', resolve))
process.env.TEST_API_URL = `http://127.0.0.1:${server.address().port}/api`
try {
  await import(pathToFileURL(resolve(process.argv[2])).href)
} finally {
  globalThis.fetch = nativeFetch
  await prisma.$disconnect()
  await new Promise(resolve => server.close(resolve))
}

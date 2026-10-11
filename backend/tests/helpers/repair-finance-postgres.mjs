import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import EmbeddedPostgres from 'embedded-postgres'

// No developer dotenv/configuration can select a remote database for this harness.
const backend = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const root = resolve(tmpdir())
const directory = await mkdtemp(join(root, 'tecnodesk-repair-finance-'))
const reservation = createServer()
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve) })
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: 'postgres', password: 'synthetic-local-only', persistent: true, authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1'], onLog() {}, onError() {} })
const databaseName = 'repair_finance_test'
const database = `postgresql://postgres:synthetic-local-only@127.0.0.1:${port}/${databaseName}`
const env = { ...process.env, NODE_ENV: 'test', DOTENV_CONFIG_PATH: 'no-dotenv-for-repair-finance', DATABASE_URL: database, DIRECT_URL: database, JWT_SECRET: 'local-financial-tests-only', ORIGIN_AUTH_ENABLED: 'false', CLIENT_IP_MODE: 'baseline', RESEND_API_KEY: '', MAIL_MODE: 'console', TURNSTILE_SECRET_KEY: 'synthetic-only', RATE_LIMIT_AUTH_WRITES_MAX: '10000', RATE_LIMIT_API_WRITES_MAX: '10000', RATE_LIMIT_API_MAX: '10000' }
const run = (args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  const timer = setTimeout(() => { child.kill(); output += '\nOwned local test timed out' }, 240000)
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  child.once('error', error => { clearTimeout(timer); reject(error) })
  child.once('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(output)) })
})
try {
  await postgres.initialise()
  await postgres.start()
  const client = postgres.getPgClient('postgres', '127.0.0.1')
  await client.connect()
  try { await client.query(`CREATE DATABASE ${databaseName}`) } finally { await client.end() }
  await run([join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', join(backend, 'prisma/schema.prisma')], directory)
  const suites = process.argv.slice(2).filter(name => name !== '--red')
  const failures = []
  for (const suite of suites.length ? suites : ['repair-cancellation-finance.ts']) {
    assert.match(suite, /^[a-z0-9-]+\.ts$/)
    console.log(`RUN ${suite}`)
    try {
      console.log((await run([join(backend, 'node_modules/tsx/dist/cli.mjs'), `tests/${suite}`, ...(process.argv.includes('--red') ? ['--red'] : [])], backend)).trim())
      console.log(`PASS ${suite}`)
    } catch (error) { failures.push(suite); console.error(`FAIL ${suite}: ${error.message}`) }
  }
  if (failures.length) throw new Error('Failed local suites: ' + failures.join(', '))
} finally {
  await postgres.stop()
  assert.equal(dirname(resolve(directory)), root)
  assert.ok(directory.startsWith(join(root, 'tecnodesk-repair-finance-')))
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

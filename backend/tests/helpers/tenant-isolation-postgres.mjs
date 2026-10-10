import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import EmbeddedPostgres from 'embedded-postgres'

// Ignore any configured DATABASE_URL. This command always owns a fresh loopback cluster.
const backend = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const temporaryRoot = resolve(tmpdir())
const directory = await mkdtemp(join(temporaryRoot, 'tecnodesk-tenant-isolation-'))
const reservation = createServer()
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: 'postgres', password: 'local-tenant-test-only', persistent: true, authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} })
const database = `postgresql://postgres:local-tenant-test-only@127.0.0.1:${port}/tecnodesk_tenant_isolation_test`
const env = { ...process.env, NODE_ENV: 'test', DOTENV_CONFIG_PATH: 'tenant-isolation-no-env-file', DATABASE_URL: database, DIRECT_URL: database, JWT_SECRET: 'tenant-isolation-local-only', ORIGIN_AUTH_ENABLED: 'false', CLIENT_IP_MODE: 'baseline', RESEND_API_KEY: '', MAIL_MODE: 'console' }
const run = (args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  child.on('error', reject)
  child.on('close', code => code === 0 ? resolve(output) : reject(new Error(output)))
})
try {
  await postgres.initialise()
  await postgres.start()
  const client = postgres.getPgClient('postgres', '127.0.0.1')
  await client.connect()
  try { await client.query('CREATE DATABASE tecnodesk_tenant_isolation_test') }
  finally { await client.end() }
  // Temp cwd prevents Prisma CLI from loading the developer's backend/.env.
  await run([join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', join(backend, 'prisma/schema.prisma')], directory)
  console.log((await run([join(backend, 'node_modules/tsx/dist/cli.mjs'), 'tests/tenant-isolation-complete.ts'], backend)).trim())
} finally {
  await postgres.stop()
  assert.equal(dirname(resolve(directory)), temporaryRoot, 'Cleanup must stay in the temporary root')
  assert.ok(directory.startsWith(join(temporaryRoot, 'tecnodesk-tenant-isolation-')))
  await rm(directory, { recursive: true, force: true })
}

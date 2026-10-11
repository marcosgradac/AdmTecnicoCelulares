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
const directory = await mkdtemp(join(temporaryRoot, 'tecnodesk-role-permissions-'))
const reservation = createServer()
const accountDeletion = process.argv.includes('--account-deletion')
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(accountDeletion ? 55439 : 0, '127.0.0.1', resolve) })
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: 'postgres', password: 'local-tenant-test-only', persistent: true, authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} })
const databaseName = accountDeletion ? 'account_deletion_test' : 'tecnodesk_role_permissions_test'
const database = `postgresql://postgres:local-tenant-test-only@127.0.0.1:${port}/${databaseName}`
const env = { ...process.env, NODE_ENV: 'test', DOTENV_CONFIG_PATH: 'tenant-isolation-no-env-file', DATABASE_URL: database, DIRECT_URL: database, JWT_SECRET: 'tenant-isolation-local-only', ORIGIN_AUTH_ENABLED: 'false', CLIENT_IP_MODE: 'baseline', RESEND_API_KEY: '', MAIL_MODE: 'console' }
const run = (args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  const timeout = setTimeout(() => { output += '\nLocal test timed out after 180 seconds'; child.kill() }, 180_000)
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  child.on('error', error => { clearTimeout(timeout); reject(error) })
  child.on('close', code => { clearTimeout(timeout); code === 0 ? resolve(output) : reject(new Error(output)) })
})
try {
  await postgres.initialise()
  await postgres.start()
  const client = postgres.getPgClient('postgres', '127.0.0.1')
  await client.connect()
  try { await client.query(`CREATE DATABASE ${databaseName}`) }
  finally { await client.end() }
  // Temp cwd prevents Prisma CLI from loading the developer's backend/.env.
  await run([join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', join(backend, 'prisma/schema.prisma')], directory)
  const suites = accountDeletion ? ['account-deletion.ts'] : process.argv.includes('--extended') ? [
    'rate-limit-multiuser.ts', 'cash-pagination.ts', 'commerce-stock-race.ts', 'dashboard-overview-contract.ts', 'dashboard.ts',
    'money-concurrency.ts', 'performance-access.ts', 'repair-advance-status.ts', 'repair-creation-finance.ts',
    'repair-edit.ts', 'repair-initial-cost.ts', 'repair-legacy-status-endpoints.ts', 'timezone-cleanup.ts',
  ] : process.argv.includes('--regressions') ? [
    'reports.ts', 'reports-timezone.ts', 'repair-financial-visibility.ts', 'settings-team.ts',
    'team-password-reset.ts', 'expired-owner-renewal.ts', 'billing.ts', 'subscription-fallback.ts',
    'billing-quota-concurrency.ts', 'pending-payment-concurrency.ts', 'platform-admin-user-redaction.ts',
    'platform-admin-customer-metrics.ts', 'platform-admin-subscription-actions.ts', 'manual-payment-review.ts',
    'password-change.ts', 'password-reset.ts', 'repair-cancellation.ts', 'repair-status-concurrency.ts',
    'warranties.ts', 'commerce.ts', 'equipment-sales.ts', 'tenant-isolation-complete.ts',
  ] : process.argv.includes('--sessions') ? ['session-security-complete.ts'] : ['role-permissions-complete.ts']
  for (const suite of suites) {
    console.log(`RUN regression ${suite}`)
    console.log((await run(['--import', 'tsx', `tests/${suite}`], backend)).trim())
    console.log(`PASS regression ${suite}`)
  }
  if (process.argv.includes('--regressions')) {
    for (const suite of ['team-permissions.mjs', 'auth-profile.mjs']) {
      console.log((await run(['tests/helpers/local-api.mjs', `tests/${suite}`], backend)).trim())
      console.log(`PASS regression ${suite}`)
    }
  }
} finally {
  await postgres.stop()
  assert.equal(dirname(resolve(directory)), temporaryRoot, 'Cleanup must stay in the temporary root')
  assert.ok(directory.startsWith(join(temporaryRoot, 'tecnodesk-role-permissions-')))
  // Windows can retain a handle briefly after pg_ctl confirms shutdown.
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

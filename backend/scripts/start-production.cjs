'use strict'
/**
 * Production start: apply pending Prisma migrations, then boot the API.
 *
 * Supabase's transaction pooler (port 6543, PgBouncer in transaction mode) cannot
 * serve `prisma migrate deploy`: the migration needs a real session, so the pooler
 * leaves the migration hanging. We therefore derive a *separate* URL for the
 * migration step only (session pooler, port 5432) and keep the original DATABASE_URL
 * untouched for the API, which is perfectly happy behind the transaction pooler.
 *
 * The rewrite happens in memory on a copy; the original environment is never mutated
 * and neither the URL nor its credentials are ever printed.
 */
const { existsSync } = require('node:fs')
const { spawn } = require('node:child_process')
const path = require('node:path')

const TRANSACTION_POOLER_PORT = '6543'
const SESSION_POOLER_PORT = '5432'
const SUPABASE_POOLER_SUFFIX = '.pooler.supabase.com'

/**
 * Returns the URL that migrations must use, or null when no rewrite is needed.
 * Kept exported-in-shape (pure function) so it can be unit tested without credentials.
 */
function migrationDatabaseUrl(databaseUrl) {
  let url
  try { url = new URL(databaseUrl) } catch { return null }
  if (url.port !== TRANSACTION_POOLER_PORT) return null
  if (!url.hostname.endsWith(SUPABASE_POOLER_SUFFIX)) return null
  url.port = SESSION_POOLER_PORT
  // PgBouncer-only directives would be rejected by the session pooler.
  url.searchParams.delete('pgbouncer')
  return url.toString()
}

function runMigrations(env) {
  return new Promise(resolve => {
    // Use the locally installed Prisma CLI; never download anything at start time.
    // The absolute path keeps working when PATH does not expose node_modules/.bin.
    const binary = process.platform === 'win32' ? 'prisma.cmd' : 'prisma'
    const cli = path.join(__dirname, '..', 'node_modules', '.bin', binary)
    // A .cmd shim cannot be spawned directly on Windows: it needs a shell, and with a shell the
    // whole line is interpreted at once. On Linux the binary is spawned directly with argv.
    const useShell = process.platform === 'win32'
    const command = existsSync(cli) ? cli : binary
    const child = spawn(useShell ? `"${command}" migrate deploy` : command, useShell ? [] : ['migrate', 'deploy'], {
      cwd: path.join(__dirname, '..'),
      env,
      stdio: 'inherit',
      shell: useShell,
    })
    child.on('error', () => resolve(1))
    child.on('close', code => resolve(code === 0 ? 0 : 1))
  })
}

function startServer() {
  return spawn(process.execPath, ['dist/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  })
}

async function main() {
  const original = process.env.DATABASE_URL
  if (!original) {
    console.error('Falta DATABASE_URL: no se puede iniciar el backend.')
    process.exit(1)
  }
  const migrationUrl = migrationDatabaseUrl(original)
  const migrationEnv = { ...process.env }
  if (migrationUrl) migrationEnv.DATABASE_URL = migrationUrl

  const code = await runMigrations(migrationEnv)
  if (code !== 0) {
    // Never boot the API against a schema that was not migrated.
    console.error('Las migraciones fallaron: no se inicia el backend.')
    process.exit(code)
  }

  // The API keeps the original DATABASE_URL (the migration env is discarded here).
  const server = startServer()
  let closing = false
  const forward = signal => () => {
    if (closing) return
    closing = true
    // Give the API the same signal Render would send, then let it shut down cleanly.
    server.kill(signal)
  }
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, forward(signal))
  server.on('exit', (code, signal) => { process.exit(signal ? 0 : code ?? 0) })
}

main().catch(() => process.exit(1))

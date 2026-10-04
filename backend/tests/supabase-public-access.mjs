import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, basename, join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'
import { PrismaClient } from '@prisma/client'

// Never load .env or connect to DATABASE_URL. All roles/data belong to a fresh,
// temporary cluster, bound to loopback, removed after stopping PostgreSQL.
const backend = resolve(fileURLToPath(new URL('..', import.meta.url)))
const migration = await readFile(join(backend, 'prisma/migrations/20261004120000_restrict_supabase_public_roles/migration.sql'), 'utf8')
const reservation = createServer()
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()))
const password = randomBytes(24).toString('hex')
const directory = await mkdtemp(join(tmpdir(), 'tecnodesk-acl-test-'))
const postgres = new EmbeddedPostgres({
  databaseDir: directory, port, user: 'postgres', password, persistent: true,
  authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {}, onError: () => {},
})
let client, prisma
try {
  await postgres.initialise()
  await postgres.start()
  client = postgres.getPgClient('postgres', '127.0.0.1')
  await client.connect()
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres?schema=public`
  prisma = new PrismaClient({ datasourceUrl: url })

  // E: Run the actual complete migration chain using Prisma with API roles absent.
  assert.equal((await client.query("SELECT count(*)::int AS count FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")).rows[0].count, 0)
  await new Promise((resolve, reject) => {
    let output = ''
    const child = spawn(process.execPath, [join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: backend, env: { ...process.env, DATABASE_URL: url }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(output.replaceAll(password, '[redacted]'))))
  })
  console.log('E PASS: Prisma migrate deploy, complete chain, no anon/authenticated roles')

  await client.query(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE TABLE public.acl_existing (id integer PRIMARY KEY, value text);
    INSERT INTO public.acl_existing VALUES (1, 'original');
    CREATE VIEW public.acl_view AS SELECT * FROM public.acl_existing;
    CREATE SEQUENCE public.acl_sequence;
    CREATE FUNCTION public.acl_function() RETURNS integer LANGUAGE sql AS 'SELECT 1';
    REVOKE EXECUTE ON FUNCTION public.acl_function() FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.acl_function() TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  `)
  const privilege = async (role, table, permission) => (await client.query('SELECT has_table_privilege($1, $2, $3) AS allowed', [role, table, permission])).rows[0].allowed
  const crud = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
  const asRole = async (role, sql) => {
    // Fixed test-role names only; never accept a role or SQL from external input.
    assert.ok(['anon', 'authenticated', 'service_role'].includes(role))
    await client.query(`SET ROLE ${role}`)
    try { return await client.query(sql) } finally { await client.query('RESET ROLE') }
  }
  for (const role of ['anon', 'authenticated']) {
    for (const permission of crud) assert.equal(await privilege(role, 'public.acl_existing', permission), true)
    assert.equal((await asRole(role, 'SELECT * FROM public.acl_existing')).rowCount, 1)
  }
  console.log('A PASS: both public roles have CRUD and can read before migration')

  const rls = async () => (await client.query("SELECT oid, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace ORDER BY oid")).rows
  const rlsBefore = await rls()
  await client.query(migration)
  await client.query(migration) // Idempotent.
  assert.deepEqual(await rls(), rlsBefore)
  for (const role of ['anon', 'authenticated']) {
    for (const permission of [...crud, 'TRUNCATE', 'REFERENCES', 'TRIGGER']) assert.equal(await privilege(role, 'public.acl_existing', permission), false)
    assert.equal(await privilege(role, 'public.acl_view', 'SELECT'), false)
    assert.equal(await privilege(role, 'public._prisma_migrations', 'SELECT'), false)
    for (const sql of ['SELECT * FROM public.acl_existing', "INSERT INTO public.acl_existing VALUES (2, 'denied')", "UPDATE public.acl_existing SET value = 'denied'", 'DELETE FROM public.acl_existing']) {
      await assert.rejects(() => asRole(role, sql), error => error.code === '42501')
    }
    assert.equal((await client.query("SELECT has_sequence_privilege($1, 'public.acl_sequence', 'USAGE, SELECT, UPDATE') AS allowed", [role])).rows[0].allowed, false)
    assert.equal((await client.query("SELECT has_function_privilege($1, 'public.acl_function()', 'EXECUTE') AS allowed", [role])).rows[0].allowed, false)
    assert.equal((await client.query("SELECT has_schema_privilege($1, 'public', 'USAGE') AS allowed", [role])).rows[0].allowed, true)
  }
  console.log('B PASS: effective privileges and real CRUD denied; view, sequence, function and migration history protected')

  await prisma.$executeRawUnsafe("INSERT INTO public.acl_existing VALUES (2, 'prisma')")
  assert.equal((await prisma.$queryRawUnsafe('SELECT * FROM public.acl_existing WHERE id = 2')).length, 1)
  assert.equal(await prisma.$executeRawUnsafe("UPDATE public.acl_existing SET value = 'updated' WHERE id = 2"), 1)
  assert.equal(await prisma.$executeRawUnsafe('DELETE FROM public.acl_existing WHERE id = 2'), 1)
  assert.equal((await prisma.$queryRawUnsafe('SELECT value FROM public.acl_existing WHERE id = 1'))[0].value, 'original')
  console.log('C PASS: postgres through Prisma retains real SELECT/INSERT/UPDATE/DELETE; existing data unchanged')

  await client.query('CREATE TABLE public.acl_future (id integer); CREATE SEQUENCE public.acl_future_sequence;')
  for (const role of ['anon', 'authenticated']) {
    for (const permission of crud) assert.equal(await privilege(role, 'public.acl_future', permission), false)
    assert.equal((await client.query("SELECT has_sequence_privilege($1, 'public.acl_future_sequence', 'USAGE, SELECT, UPDATE') AS allowed", [role])).rows[0].allowed, false)
  }
  for (const table of ['public.acl_existing', 'public.acl_future']) {
    for (const permission of crud) assert.equal(await privilege('service_role', table, permission), true)
  }
  assert.equal((await client.query("SELECT has_function_privilege('service_role', 'public.acl_function()', 'EXECUTE') AS allowed")).rows[0].allowed, true)
  assert.equal((await client.query("SELECT has_sequence_privilege('service_role', 'public.acl_future_sequence', 'USAGE') AS allowed")).rows[0].allowed, true)
  console.log('D PASS: new table/sequence do not inherit API grants; service_role grants/defaults and RLS unchanged')

  await client.query('GRANT SELECT (value) ON public.acl_existing TO anon')
  await client.query(migration)
  assert.equal((await client.query("SELECT has_column_privilege('anon', 'public.acl_existing', 'value', 'SELECT') AS allowed")).rows[0].allowed, false)
  console.log('COLUMN PASS: table REVOKE also removes direct column grants')

  // Negative cases: do not silently succeed when targeted REVOKEs cannot suffice.
  for (const setup of [
    'GRANT SELECT ON public.acl_existing TO PUBLIC',
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT SELECT ON TABLES TO anon',
    'GRANT EXECUTE ON FUNCTION public.acl_function() TO PUBLIC',
  ]) {
    await client.query('BEGIN')
    try {
      await client.query(setup)
      await assert.rejects(() => client.query(migration), error => error.code === 'P0001', setup)
    } finally { await client.query('ROLLBACK') }
  }
  console.log('GUARDS PASS: inherited PUBLIC and global-default grants stop the migration atomically')
} finally {
  await prisma?.$disconnect()
  await client?.end()
  await postgres.stop()
  // Windows may briefly retain file handles after taskkill exits.
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
  assert.ok(basename(directory).startsWith('tecnodesk-acl-test-'))
  await rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
}

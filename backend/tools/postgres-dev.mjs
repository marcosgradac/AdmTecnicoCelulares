import 'dotenv/config'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

const databaseDir = resolve(process.env.POSTGRES_DEV_DATA_DIR ?? '.postgres-data')
const port = Number(process.env.POSTGRES_DEV_PORT ?? 55432)
const user = process.env.POSTGRES_DEV_USER ?? 'cellufix'
const password = process.env.POSTGRES_DEV_PASSWORD ?? 'cellufix-local-only'
const database = process.env.POSTGRES_DEV_DATABASE ?? 'cellufix'

const postgres = new EmbeddedPostgres({
  databaseDir,
  port,
  user,
  password,
  authMethod: 'scram-sha-256',
  persistent: true,
})

async function ensureDatabase() {
  const client = postgres.getPgClient()
  await client.connect()
  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])
    if (result.rowCount === 0) {
      await client.query(
        `CREATE DATABASE ${client.escapeIdentifier(database)} WITH OWNER ${client.escapeIdentifier(user)} ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`,
      )
    }
  } finally {
    await client.end()
  }
}

async function shutdown() {
  await postgres.stop()
  process.exit(0)
}

async function main() {
  if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) await postgres.initialise()
  await postgres.start()
  await ensureDatabase()
  console.log(`PostgreSQL de desarrollo listo en localhost:${port}/${database}`)
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch(async (error) => {
  console.error(error)
  await postgres.stop()
  process.exit(1)
})

import { PrismaClient } from '@prisma/client'

// Production talks to Supabase through the transaction pooler, which multiplexes a fixed
// number of backend connections. Prisma's default pool (cpus * 2 + 1) can open more sockets
// than the pooler allows, and the extra ones fail with "too many clients" under load, so the
// limit is explicit and can be tuned per instance size without touching code.
const DEFAULT_CONNECTION_LIMIT = 5
const DEFAULT_POOL_TIMEOUT_SECONDS = 10

/**
 * A typo in an env var must never silently disable the pool: an invalid value falls back to
 * the safe default instead of leaving the connection unbounded, which is the failure this
 * setting exists to prevent.
 */
const positiveInteger = (value: string | undefined, fallback: number) => {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return parsed
}

const withPoolOptions = (url: string | undefined) => {
  if (!url) return undefined
  const tuned = new URL(url)
  tuned.searchParams.set('connection_limit', String(positiveInteger(process.env.DATABASE_CONNECTION_LIMIT, DEFAULT_CONNECTION_LIMIT)))
  tuned.searchParams.set('pool_timeout', String(positiveInteger(process.env.DATABASE_POOL_TIMEOUT_SECONDS, DEFAULT_POOL_TIMEOUT_SECONDS)))
  return tuned.toString()
}

export const prisma = new PrismaClient({ datasourceUrl: withPoolOptions(process.env.DATABASE_URL) })

import { PrismaClient } from '@prisma/client'

// Production talks to Supabase through the transaction pooler, which multiplexes a fixed
// number of backend connections. Prisma's default pool (cpus * 2 + 1) can open more sockets
// than the pooler allows, and the extra ones fail with "too many clients" under load, so the
// limit is explicit and can be tuned per instance size without touching code.
const withPoolOptions = (url: string | undefined) => {
  if (!url) return undefined
  const limit = Number(process.env.DATABASE_CONNECTION_LIMIT ?? 5)
  const timeout = Number(process.env.DATABASE_POOL_TIMEOUT_SECONDS ?? 10)
  if (!Number.isFinite(limit) || limit <= 0) return url
  const tuned = new URL(url)
  tuned.searchParams.set('connection_limit', String(limit))
  tuned.searchParams.set('pool_timeout', String(Number.isFinite(timeout) && timeout > 0 ? timeout : 10))
  return tuned.toString()
}

export const prisma = new PrismaClient({ datasourceUrl: withPoolOptions(process.env.DATABASE_URL) })

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

/** Produces an offline candidate; never writes or activates vercel.json. */
export function prepareApiRewrites(config, origin) {
  let url
  try {
    url = new URL(origin)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/'
      || url.search || url.hash) throw new Error('invalid origin')
  } catch {
    throw new Error('API origin must be HTTPS, without credentials, path, query or fragment')
  }
  const candidate = structuredClone(config)
  const previews = [
    ['/s/:clientSlug/:token', '/api/tracking-preview/:token?clientSlug=:clientSlug'],
    ['/seguimiento/:token', '/api/tracking-preview/:token'],
  ]
  for (const [source, destination] of previews) {
    const matches = candidate.rewrites?.filter(rule => rule.source === source) ?? []
    if (matches.length !== 1 || !matches[0].has?.some(condition =>
      condition.type === 'header' && condition.key === 'user-agent')) {
      throw new Error('Expected exactly two existing bot preview rewrites; review configuration manually')
    }
    matches[0].destination = `${url.origin}${destination}`
  }
  return candidate
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/prepare-api-domain.mjs <https-api-origin>')
    const current = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
    console.log(JSON.stringify(prepareApiRewrites(current, process.argv[2]), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

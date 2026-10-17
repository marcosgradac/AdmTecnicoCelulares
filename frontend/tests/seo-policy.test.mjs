import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { publicPages, privateRoutes, metadataForPath, renderMetadata, matchRoute } from '../scripts/seo-policy.mjs'

assert.deepEqual(Object.keys(publicPages), ['/', '/terminos-y-condiciones', '/politica-de-privacidad'])
for (const pathname of Object.keys(publicPages)) {
  const html = renderMetadata(metadataForPath(pathname))
  assert(html.includes(`https://www.tecnodeskpro.com${pathname}`))
  assert(html.includes('index, follow'))
  assert(html.includes('og:image'))
  assert(!html.includes('noindex'))
}
for (const pathname of ['/login', '/register', '/registro', '/olvide-mi-contrasena', '/restablecer-contrasena?token=secret', '/admin', '/admin/clientes/secret', '/platform-admin', '/s/cliente/secret', '/seguimiento/secret', '/missing']) {
  const html = renderMetadata(metadataForPath(pathname))
  assert(html.includes('noindex'))
  assert(!html.includes('canonical'))
  assert(!html.includes('secret'))
}
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
for (const route of privateRoutes) assert(!route.includes('?'))
assert(app.includes('path="*"'), 'React Router must also render a noindex not-found page')
assert(matchRoute('/admin/equipos/:path*', '/admin/equipos'), 'Preserve the empty legacy wildcard')
console.log('PASS SEO policy: three public pages; default deny indexing; no tokens in metadata')

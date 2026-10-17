import { readFileSync } from 'node:fs'

export const origin = 'https://www.tecnodeskpro.com'
export const publicPages = JSON.parse(readFileSync(new URL('../src/seo/pages.json', import.meta.url), 'utf8'))
export const aliases = { '/terminos': '/terminos-y-condiciones', '/privacidad': '/politica-de-privacidad' }
// Explicit SPA entry points. Unknown URLs must fall through to Vercel's 404.html.
export const privateRoutes = [
  '/login', '/register', '/registro', '/olvide-mi-contrasena', '/restablecer-contrasena',
  '/s/:clientSlug/:token', '/seguimiento/:token', '/platform-admin',
  '/admin', '/admin/reparaciones', '/admin/reparaciones/nueva', '/admin/reparaciones/:id',
  '/admin/clientes', '/admin/clientes/:id', '/admin/comercio', '/admin/punto-de-venta',
  '/admin/venta-equipos', '/admin/caja', '/admin/reportes', '/admin/perfil', '/admin/empleados',
  '/admin/suscripcion', '/admin/equipo', '/admin/equipos/:path*', '/admin/estadisticas',
  '/admin/garantias', '/admin/configuracion', '/admin/configuracion/soporte', '/admin/sin-modulos',
  '/inicio', '/dashboard', '/reparaciones', '/reparaciones/nueva', '/reparaciones/:id',
  '/clientes', '/clientes/:id', '/caja', '/reportes',
]
export function metadataForPath(pathname) {
  const path = new URL(pathname, origin).pathname.replace(/\/$/, '') || '/'
  const canonicalPath = aliases[path] || path
  return publicPages[canonicalPath]
    ? { ...publicPages[canonicalPath], canonical: origin + canonicalPath, robots: 'index, follow' }
    : { title: 'TecnoDesk | Gestión técnica', description: 'Accedé a TecnoDesk.', robots: 'noindex, nofollow' }
}
const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
export function renderMetadata(metadata) {
  const tag = (name, value, property = false) => `<meta data-tecnodesk-seo ${property ? 'property' : 'name'}="${name}" content="${escape(value)}">`
  const tags = [`<title data-tecnodesk-seo>${escape(metadata.title)}</title>`, tag('description', metadata.description), tag('robots', metadata.robots)]
  if (metadata.canonical) tags.push(
    `<link data-tecnodesk-seo rel="canonical" href="${escape(metadata.canonical)}">`,
    tag('og:title', metadata.title, true), tag('og:description', metadata.description, true),
    tag('og:type', 'website', true), tag('og:url', metadata.canonical, true),
    tag('og:site_name', 'TecnoDesk', true), tag('og:locale', 'es_AR', true),
    tag('og:image', origin + '/tecnodesk-512.png', true), tag('og:image:type', 'image/png', true),
    tag('og:image:width', '512', true), tag('og:image:height', '512', true), tag('og:image:alt', 'TecnoDesk', true),
    tag('twitter:card', 'summary'), tag('twitter:title', metadata.title),
    tag('twitter:description', metadata.description), tag('twitter:image', origin + '/tecnodesk-512.png'))
  return tags.join('\n    ')
}
export function withMetadata(html, metadata) {
  return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/gi, '')
    .replace('</head>', `    ${renderMetadata(metadata)}\n  </head>`)
}
export const publicOutput = { '/': 'index.html', '/terminos-y-condiciones': 'terminos-y-condiciones.html', '/politica-de-privacidad': 'politica-de-privacidad.html' }
export function matchRoute(pattern, pathname) {
  const expression = pattern.split('/').map(segment => segment.endsWith('*') ? '.*' : segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/')
  return new RegExp(`^${expression}/?$`).test(pathname) || (pattern.endsWith('/:path*') && pathname === pattern.replace(/\/:path\*$/, ''))
}
export function pageFile(pathname) {
  const path = pathname.replace(/\/$/, '') || '/'
  return publicOutput[aliases[path] || path] || (privateRoutes.some(route => matchRoute(route, pathname)) ? 'app.html' : '404.html')
}

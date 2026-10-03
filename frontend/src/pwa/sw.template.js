/* eslint-env serviceworker */
/**
 * Service worker de TecnoDesk.
 *
 * Objetivo acotado a propósito: que TecnoDesk se pueda instalar y abrir como
 * aplicación, y que arranque rápido. NO es una app offline.
 *
 * REGLA INNEGOCIABLE: nada de `/api/*` se guarda en caché, nunca. TecnoDesk
 * maneja datos de negocio (reparaciones, caja, clientes, usuarios). Si un
 * service worker sirviera una respuesta vieja, la app mostraría información
 * desactualizada creyéndola actual. Por eso las peticiones a la API se dejan
 * pasar de largo sin `respondWith`: nunca entran a la caché.
 *
 * Solo se cachean assets estáticos que sabemos inmutables: los que emite Vite en
 * `/assets/` con el hash del contenido en el nombre, y los archivos de marca
 * listados abajo. No se cachea "cualquier imagen del mismo origen": una imagen
 * subida por el usuario o servida por el backend puede cambiar de contenido sin
 * cambiar de URL, y cache-first serviría una versión vieja para siempre.
 *
 * ESTRATEGIA DE ACTUALIZACIÓN: `skipWaiting` NO se llama solo. El worker queda
 * esperando y la aplicación lo promueve SOLO cuando el usuario pulsa "Actualizar
 * ahora". Nunca hay recarga automática: un `requestIdleCallback` no puede saber
 * si hay una reparación, un cliente o un pago a medio cargar, y perder ese
 * trabajo en silencio sería inaceptable.
 *
 * VERSIONADO (por qué este archivo es un template y no un `public/sw.js`):
 *
 * El navegador solo considera que hay un worker nuevo si el contenido del
 * script cambia. Si `sw.js` fuera idéntico entre dos releases, Vite no lo
 * tocaría, `registration.update()` descargaría el mismo archivo y no habría
 * `updatefound`: el aviso "Hay una nueva versión disponible" nunca aparecería.
 *
 * Por eso `BUILD_ID` no se escribe a mano: el build lo reemplaza por el SHA del
 * commit (ver `scripts/sw-build-id.mjs`). Dos commits, dos `sw.js`, dos
 * workers distintos. Y como el BUILD_ID también nombra las cachés, la versión
 * nueva conserva sus propias cachés y borra las de la anterior.
 */

/**
 * Identificador del release. NO editar a mano.
 *
 * En build se sustituye por el SHA del commit. En desarrollo se sustituye por
 * `dev`, que no cambia nunca: en local no interesa detectar versiones nuevas y
 * un id fijo evita recargas y limpiezas de caché en cada arranque.
 */
const BUILD_ID = '__TECNODESK_BUILD_ID__'
const PRECACHE = `tecnodesk-precache-${BUILD_ID}`
const RUNTIME = `tecnodesk-runtime-${BUILD_ID}`

/**
 * Modo desarrollo: se activa con `/sw.js?dev=1` (ver el registro en la app).
 * El worker sigue manejando los eventos que el navegador exige para que la app
 * sea instalable, pero no guarda nada en caché, para no romper el hot reload
 * de Vite.
 */
const IS_DEV = (() => {
  try {
    return new URL(self.location.href).searchParams.get('dev') === '1'
  } catch {
    return false
  }
})()

/**
 * Todo lo que sea API va directo a la red. Se comparan tanto el pathname
 * relativo al origen como el absoluto, porque el backend puede vivir en otro
 * host (Render) y porque un service worker ve el origen del SW, no el de la
 * página que hizo la petición en el caso de recursos cross-origin.
 */
function isApiRequest(url) {
  const path = url.pathname
  return path === '/api' || path.startsWith('/api/') || path.includes('/api/')
}

/**
 * Rutas que muestran datos de negocio y nunca deben servirse desde la caché.
 *
 * Se comparan segmentos completos, no subcadenas: `/seguimiento/abc123` es la
 * página pública de seguimiento de un cliente, mientras que un asset llamado
 * `tracking-something.js` no tiene por qué quedar fuera de la caché.
 *
 * `s` cubre el formato de enlace nuevo `/s/:clientSlug/:token`. Es el mismo
 * seguimiento público, así que se excluye exactamente igual que el viejo.
 */
const BUSINESS_ROUTE_SEGMENTS = new Set(['seguimiento', 'tracking', 's'])

function isExcluded(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true
  const segments = url.pathname.split('/').filter(Boolean)
  return segments.some(segment => BUSINESS_ROUTE_SEGMENTS.has(segment))
}

/**
 * Archivos de marca que se precachean. Son de `public/`, así que su nombre NO
 * lleva hash: cambian de contenido en el mismo lugar. Aun así se precachean
 * (son pocos y chicos) y no se vuelven a cachear en runtime.
 */
const PRECACHE_URLS = [
  '/site.webmanifest',
  '/apple-touch-icon.png',
  '/tecnodesk-192.png',
  '/tecnodesk-512.png',
  '/tecnodesk-maskable-192.png',
  '/tecnodesk-maskable-512.png',
  '/favicon.ico',
]

/**
 * Assets que el runtime cache puede guardar: SOLO los que sabemos inmutables.
 *
 * Se aceptan dos clases, y ninguna más:
 *
 *  1. Lo que emite Vite en `/assets/` con el hash del contenido en el nombre
 *     (`RepairsPage-BDP-Baqw.js`). Si el contenido cambia, Vite genera otro
 *     nombre, así que la URL identifica una versión exacta.
 *  2. Los `PRECACHE_URLS` de arriba.
 *
 * Lo que antes pasaba: cualquier imagen, fuente o script del mismo origen
 * entraba por extensión. Eso incluía fotos subidas por el usuario y archivos
 * servidos por el backend, que pueden cambiar de contenido sin cambiar de URL.
 * Con cache-first, eso significa servir para siempre una versión vieja. Ahora
 * lo no reconocido pasa de largo a la red, que es siempre lo correcto cuando
 * no sabemos si un recurso puede mutar.
 */
const HASHED_ASSET_PATH = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/

function isStaticAsset(url) {
  if (PRECACHE_URLS.includes(url.pathname)) return true
  return HASHED_ASSET_PATH.test(url.pathname)
}

self.addEventListener('install', event => {
  // No se hace skipWaiting acá: la activación la pide la aplicación.
  // Solo se precachean archivos de marca, que son estáticos y conocidos. La app
  // shell se guarda sola en la primera navegación (ver handler 'navigate').
  if (IS_DEV) return
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      if (IS_DEV) {
        // En desarrollo se limpian las cachés que haya dejado una versión previa.
        const names = await caches.keys()
        await Promise.all(names.map(name => caches.delete(name)))
        await self.clients.claim()
        return
      }
      // Se borran las cachés de versiones anteriores: es lo que libera el
      // espacio de la versión vieja cuando entra la nueva.
      const names = await caches.keys()
      await Promise.all(
        names
          .filter(name => name.startsWith('tecnodesk-') && name !== PRECACHE && name !== RUNTIME)
          .map(name => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // 1) La API nunca se cachea ni se intercepta. Sin respondWith, el navegador
  //    hace su propia petición de red: no existe forma de servirla del caché.
  if (isApiRequest(url) || isExcluded(url)) return

  // 2) En desarrollo no se cachea nada: Vite sirve los módulos con URLs
  //    cambiantes y cachearlos rompería el hot reload. El handler sigue
  //    registrado, que es lo que Chrome exige para ofrecer la instalación.
  if (IS_DEV) return

  // 3) Navegaciones: red primero (para recibir HTML nuevo), con la app shell
  //    como respaldo si no hay conexión.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          const cache = await caches.open(PRECACHE)
          cache.put('/index.html', response.clone())
          return response
        } catch {
          const cached = await caches.match('/index.html', { ignoreSearch: true })
          return cached ?? new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
        }
      })(),
    )
    return
  }

  // 4) Solo assets inmutables: `/assets/` con hash de Vite y los `PRECACHE_URLS`.
  //    Cache-first. Lo que no cae en esa regla sigue por red sin interceptar.
  if (request.url.startsWith(self.location.origin) && isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(RUNTIME)
          cache.put(request, response.clone())
        }
        return response
      })(),
    )
  }
})
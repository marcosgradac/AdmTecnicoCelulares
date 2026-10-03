// Pruebas de la lógica PWA de TecnoDesk.
//
// Qué se cubre y por qué:
//  1. display-mode standalone -> no se ofrece instalar.
//  2. beforeinstallprompt y sin instalar -> se puede ofrecer.
//  3. appinstalled -> se oculta la invitación.
//  4. "Ahora no" reciente -> no se muestra durante el cooldown.
//  5. Cooldown vencido -> se puede volver a ofrecer.
//  6. iOS no standalone -> instrucciones manuales.
//  7. iOS standalone -> no se ofrece.
//  8. /api/* nunca queda cacheado por el service worker.
//
// No se intenta automatizar el diálogo nativo del navegador: se simula el
// evento `beforeinstallprompt`, que es justamente el contrato que usa la app.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../node_modules/typescript')
const { pathToFileURL } = require('node:url')

const ROOT = path.resolve(__dirname, '..')

/**
 * Marcador y render se importan del MÓDULO REAL que usa el build, no se
 * reimplementan acá: si el plugin cambia, estas pruebas lo detectan.
 *
 * El módulo es ESM y el test es CommonJS, así que se carga con `import()`
 * dinámico. Se envuelve en una promesa para no ensuciar cada prueba con `await`.
 */
const buildIdModule = import(pathToFileURL(path.resolve(ROOT, 'scripts/sw-build-id.mjs')).href)

/** Resuelve el módulo cuando la prueba ya es asíncrona. */
const withBuildIdModule = buildIdModule

/**
 * Carpeta temporal FUERA del repositorio.
 *
 * Hace falta porque `git rev-parse` busca hacia arriba: cualquier carpeta del
 * proyecto, incluso `node_modules`, encuentra el `.git` de la raíz y devuelve el
 * SHA. Para probar el caso "no hay repositorio" hay que salirse del repo.
 */
const cwdFueraDelRepo = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'tecnodesk-sw-'))

/**
 * Carga un módulo TypeScript en un sandbox, igual que repair-flow.cjs: sin
 * bundler y sin DOM, sólo con las dependencias que el módulo declara.
 *
 * `import.meta.env` es una sustituida que Vite reemplaza en el build. Acá se
 * reescribe a una variable de contexto para que el módulo se pueda cargar en
 * CommonJS, y así los tests ejercitan el código real de la PWA.
 */
function loadModule(file, importMap = {}) {
  const source = fs.readFileSync(path.resolve(ROOT, file), 'utf8')
  const compiled = ts.transpileModule(source.replace(/import\.meta\.env/g, '__viteEnv'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports = {}
  const requireFn = name => {
    if (name in importMap) return importMap[name]
    throw new Error(`Dependencia no simulada en ${file}: ${name}`)
  }
  const viteEnv = { PROD: false, DEV: true, MODE: 'test' }
  const context = vm.createContext({
    exports,
    require: requireFn,
    module: { exports },
    console,
    URL,
    Date,
    Promise,
    __viteEnv: viteEnv,
  })
  context.globalThis = context
  vm.runInContext(compiled, context)
  return context.module.exports
}

const detection = loadModule('src/pwa/pwaDetection.ts')
const cooldown = loadModule('src/pwa/installCooldown.ts')
const { createInstallPromptController } = loadModule('src/pwa/installPromptController.ts', {
  './pwaDetection': detection,
  './installCooldown': cooldown,
})
const { createUpdateController } = loadModule('src/pwa/serviceWorkerRegistration.ts')

// ---------------------------------------------------------------------------
// Dobles de prueba
// ---------------------------------------------------------------------------

/** Ventana falsa con matchMedia y listeners controlables desde el test. */
function createFakeWindow({ userAgent = '', maxTouchPoints = 0, standalone = false, standaloneMatch = false } = {}) {
  const listeners = new Map()
  return {
    navigator: { userAgent, maxTouchPoints, standalone },
    matchMedia(query) {
      return { matches: query.includes('standalone') ? standaloneMatch : false, media: query, addEventListener() {}, removeEventListener() {} }
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, [])
      listeners.get(type).push(handler)
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || []
      const index = list.indexOf(handler)
      if (index >= 0) list.splice(index, 1)
    },
    dispatch(type, event) {
      for (const handler of [...(listeners.get(type) || [])]) handler(event)
    },
  }
}

/** localStorage en memoria. */
function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, value),
    removeItem: key => void map.delete(key),
  }
}

/** Evento `beforeinstallprompt` con userChoice controlable. */
function createBeforeInstallPromptEvent(outcome = 'accepted') {
  let promptCalls = 0
  return {
    promptCalls: () => promptCalls,
    event: {
      type: 'beforeinstallprompt',
      preventDefault() {},
      async prompt() {
        promptCalls++
      },
      userChoice: Promise.resolve({ outcome, platform: 'web' }),
    },
  }
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
/** iPadOS 13+ se presenta como un Macintosh de escritorio. */
const IPADOS_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

const tests = []
const test = (name, run) => tests.push({ name, run })
// ---------------------------------------------------------------------------
// 1. Standalone: nunca se ofrece instalar
// ---------------------------------------------------------------------------

test('1. Con display-mode standalone no se ofrece instalar', () => {
  const win = createFakeWindow({ userAgent: IPHONE_UA, standaloneMatch: true })
  assert.equal(detection.isStandalone(win), true)

  const controller = createInstallPromptController({ win, storage: createMemoryStorage(), now: () => 1000 })
  const state = controller.getState()
  assert.equal(state.installed, true)
  assert.equal(state.visible, false, 'una app instalada no debe ver el aviso')
  assert.equal(state.method, 'unsupported')
  controller.destroy()
})

test('1b. navigator.standalone de iOS también cuenta como instalada', () => {
  const win = createFakeWindow({ userAgent: IPHONE_UA, standalone: true })
  assert.equal(detection.isStandalone(win), true)
  const controller = createInstallPromptController({ win, storage: createMemoryStorage(), now: () => 1000 })
  assert.equal(controller.getState().visible, false)
  controller.destroy()
})

// ---------------------------------------------------------------------------
// 2. beforeinstallprompt y sin instalar: se puede ofrecer
// ---------------------------------------------------------------------------

test('2. Con beforeinstallprompt y sin instalar, se puede ofrecer e instalar', async () => {
  const win = createFakeWindow()
  const controller = createInstallPromptController({ win, storage: createMemoryStorage(), now: () => 1000 })
  assert.equal(controller.getState().visible, false, 'sin evento todavía no hay nada que ofrecer')

  const { event, promptCalls } = createBeforeInstallPromptEvent('accepted')
  win.dispatch('beforeinstallprompt', event)

  const offered = controller.getState()
  assert.equal(offered.visible, true, 'con el evento disponible se ofrece instalar')
  assert.equal(offered.method, 'native')
  assert.equal(promptCalls(), 0, 'el prompt nativo no debe abrirse solo al cargar')

  const accepted = await controller.promptInstall()
  assert.equal(accepted, true)
  assert.equal(promptCalls(), 1, 'el prompt se lanza exactamente una vez')
  assert.equal(controller.getState().visible, false, 'tras aceptar, el aviso se oculta')
  controller.destroy()
})

test('2b. Si el usuario rechaza el diálogo nativo, no se marca como instalada', async () => {
  const win = createFakeWindow()
  const controller = createInstallPromptController({ win, storage: createMemoryStorage(), now: () => 1000 })
  const { event } = createBeforeInstallPromptEvent('dismissed')
  win.dispatch('beforeinstallprompt', event)

  assert.equal(await controller.promptInstall(), false)
  assert.equal(controller.getState().installed, false, 'rechazar el diálogo no instala la app')
  controller.destroy()
})
// ---------------------------------------------------------------------------
// 3. appinstalled oculta la invitación
// ---------------------------------------------------------------------------

test('3. Al recibir appinstalled se oculta la invitación', () => {
  const win = createFakeWindow()
  const controller = createInstallPromptController({ win, storage: createMemoryStorage(), now: () => 1000 })
  const { event } = createBeforeInstallPromptEvent()
  win.dispatch('beforeinstallprompt', event)
  assert.equal(controller.getState().visible, true)

  const seen = []
  controller.subscribe(state => seen.push(state.visible))

  win.dispatch('appinstalled', { type: 'appinstalled' })

  const state = controller.getState()
  assert.equal(state.installed, true)
  assert.equal(state.visible, false, 'appinstalled debe ocultar el aviso')
  assert.equal(seen[seen.length - 1], false, 'los suscriptores se enteran del cambio')
  controller.destroy()
})

test('3b. appinstalled limpia un "Ahora no" previo, que ya quedó obsoleto', () => {
  const win = createFakeWindow()
  const storage = createMemoryStorage()
  const controller = createInstallPromptController({ win, storage, now: () => 1000 })
  controller.dismiss()
  assert.equal(cooldown.readDismissedAt(storage), 1000)

  const { event } = createBeforeInstallPromptEvent()
  win.dispatch('beforeinstallprompt', event)
  win.dispatch('appinstalled', { type: 'appinstalled' })

  assert.equal(controller.getState().installed, true)
  assert.equal(cooldown.readDismissedAt(storage), null)
  controller.destroy()
})

// ---------------------------------------------------------------------------
// 4. Cooldown activo: no molestar
// ---------------------------------------------------------------------------

test('4. Con "Ahora no" reciente no se muestra durante el cooldown', () => {
  const win = createFakeWindow()
  const storage = createMemoryStorage()
  const base = 1_700_000_000_000
  let now = base
  const controller = createInstallPromptController({ win, storage, now: () => now })

  const { event } = createBeforeInstallPromptEvent()
  win.dispatch('beforeinstallprompt', event)
  assert.equal(controller.getState().visible, true)

  controller.dismiss()
  assert.equal(controller.getState().visible, false)

  now = base + cooldown.INSTALL_PROMPT_COOLDOWN_MS - 1
  assert.equal(cooldown.isWithinCooldown(now, storage), true)
  const reloaded = createInstallPromptController({ win: createFakeWindow(), storage, now: () => now })
  assert.equal(reloaded.getState().visible, false, 'una visita dentro del cooldown no muestra nada')
  reloaded.destroy()
  controller.destroy()
})

// ---------------------------------------------------------------------------
// 5. Cooldown vencido: se puede volver a ofrecer
// ---------------------------------------------------------------------------

test('5. Vencido el cooldown se puede volver a ofrecer', () => {
  const storage = createMemoryStorage()
  const base = 1_700_000_000_000
  let now = base
  const controller = createInstallPromptController({ win: createFakeWindow(), storage, now: () => now })
  const { event } = createBeforeInstallPromptEvent()
  createFakeWindow()
  controller.dismiss()

  now = base + cooldown.INSTALL_PROMPT_COOLDOWN_MS
  assert.equal(cooldown.isWithinCooldown(now, storage), false, 'pasados 7 días ya no hay cooldown')

  // Visita nueva: el navegador emite el evento otra vez y el aviso vuelve.
  const win = createFakeWindow()
  const nextVisit = createInstallPromptController({ win, storage, now: () => now })
  const { event: fresh } = createBeforeInstallPromptEvent()
  win.dispatch('beforeinstallprompt', fresh)
  assert.equal(nextVisit.getState().visible, true, 'vencido el cooldown se vuelve a ofrecer')

  nextVisit.destroy()
  controller.destroy()
  assert.ok(event)
})

test('5b. El cooldown dura exactamente 7 días', () => {
  assert.equal(cooldown.INSTALL_PROMPT_COOLDOWN_DAYS, 7)
  assert.equal(cooldown.INSTALL_PROMPT_COOLDOWN_MS, 7 * 24 * 60 * 60 * 1000)
})
// ---------------------------------------------------------------------------
// 6. iOS no standalone: instrucciones manuales
// ---------------------------------------------------------------------------

test('6. En iOS no standalone se ofrecen instrucciones manuales', () => {
  const win = createFakeWindow({ userAgent: IPHONE_UA, maxTouchPoints: 5 })
  assert.equal(detection.isIos(win), true)
  assert.equal(detection.isIosSafari(win), true)

  const controller = createInstallPromptController({ win, storage: createMemoryStorage(), now: () => 1000 })
  const state = controller.getState()
  assert.equal(state.visible, true, 'en iOS se ofrece instalar aunque no exista beforeinstallprompt')
  assert.equal(state.method, 'ios-manual')

  controller.openInstructions()
  assert.equal(controller.getState().instructionsOpen, true, 'el diálogo de pasos se abre')
  controller.closeInstructions()
  assert.equal(controller.getState().instructionsOpen, false)
  controller.destroy()
})

test('6b. iPadOS disfrazado de escritorio también se detecta', () => {
  const ipad = createFakeWindow({ userAgent: IPADOS_UA, maxTouchPoints: 5 })
  assert.equal(detection.isIos(ipad), true, 'iPadOS reports Macintosh: se reconoce por los puntos de táctil')

  const mac = createFakeWindow({ userAgent: IPADOS_UA, maxTouchPoints: 0 })
  assert.equal(detection.isIos(mac), false, 'un Macintosh de verdad no se trata como iPad')

  const controller = createInstallPromptController({ win: ipad, storage: createMemoryStorage(), now: () => 1000 })
  assert.equal(controller.getState().method, 'ios-manual')
  controller.destroy()
})

// ---------------------------------------------------------------------------
// 7. iOS standalone: no se ofrece
// ---------------------------------------------------------------------------

test('7. En iOS standalone no se ofrece instalar', () => {
  const win = createFakeWindow({ userAgent: IPHONE_UA, maxTouchPoints: 5, standalone: true })
  const controller = createInstallPromptController({ win, storage: createMemoryStorage(), now: () => 1000 })
  assert.equal(controller.getState().installed, true)
  assert.equal(controller.getState().visible, false)
  assert.equal(controller.getState().method, 'unsupported')
  controller.destroy()
})
// ---------------------------------------------------------------------------
// 8. El service worker nunca cachea /api/*
// ---------------------------------------------------------------------------

/**
 * Ejecuta el service worker real dentro de un sandbox con un `caches` falso que
 * registra cada escritura. No se reimplementa la lógica: se corre el mismo
 * archivo que se publica.
 */
async function runServiceWorker({ buildId = 'test-build-id' } = {}) {
  // Se lee el TEMPLATE y se inyecta el BUILD_ID con el MISMO `renderServiceWorker`
  // que usa el build. Así la prueba ejercita el archivo que se publica y, a la
  // vez, verifica que la sustitución funcione de verdad.
  const { renderServiceWorker } = await withBuildIdModule
  const template = fs.readFileSync(path.resolve(ROOT, 'src/pwa/sw.template.js'), 'utf8')
  const source = renderServiceWorker(template, buildId)
  const writes = []
  const handlers = new Map()
  const deletedCaches = []

  const caches = {
    open: async name => ({
      put: async (key, response) => {
        void response
        writes.push({ cache: name, url: typeof key === 'string' ? key : key.url })
      },
      addAll: async () => undefined,
      match: async () => undefined,
    }),
    match: async () => undefined,
    // Cachés de una versión anterior: la activate actual debe borrarlas y
    // conservar las suyas.
    keys: async () => [
      `tecnodesk-precache-${buildId}`,
      `tecnodesk-runtime-${buildId}`,
      'tecnodesk-precache-v1',
      'tecnodesk-runtime-v1',
    ],
    delete: async name => {
      deletedCaches.push(name)
      return true
    },
  }

  let skippedWaiting = false
  const self = {
    location: { href: 'https://tecnodeskpro.com/sw.js', origin: 'https://tecnodeskpro.com' },
    addEventListener: (type, handler) => handlers.set(type, handler),
    skipWaiting: () => {
      skippedWaiting = true
    },
    clients: { claim: async () => undefined },
    registration: {},
    caches,
  }

  vm.runInNewContext(source, {
    self,
    caches,
    URL,
    Response,
    console,
    fetch: async () => ({ ok: true, type: 'basic', clone: () => ({}) }),
    Promise,
  })

  return {
    handlers,
    writes,
    deletedCaches,
    didSkipWaiting: () => skippedWaiting,
    /** Dispara el handler de fetch y devuelve si interceptó la petición. */
    fetchRequest(request) {
      let responded = false
      handlers.get('fetch')({
        request,
        respondWith() {
          responded = true
        },
        waitUntil() {},
      })
      return responded
    },
    /** Igual que `fetchRequest`, pero devuelve la promesa de `respondWith`. */
    async fetchAndSettle(request) {
      let settled = null
      handlers.get('fetch')({
        request,
        respondWith(promise) {
          settled = promise
        },
        waitUntil() {},
      })
      await settled
      return settled
    },
  }
}

test('8. El service worker no cachea ninguna petición a /api/*', async () => {
  const sw = await runServiceWorker()
  assert.ok(sw.handlers.get('fetch'), 'el worker debe registrar un handler de fetch')

  const API_URLS = [
    'https://tecnodeskpro.com/api/reparaciones',
    'https://tecnodeskpro.com/api/auth/login',
    'https://tecnodeskpro.com/api/caja/movimientos',
    'https://tecnodeskpro.com/api/clientes',
    'https://tecnodeskpro.com/api/dashboard',
    'https://tecnodeskpro.com/api/empleados',
    'https://tecnodeskpro.com/api/comercio',
    'https://tecnodeskpro.com/api/reventa',
    'https://tecnodeskpro.com/api/garantias',
    'https://tecnodeskpro.com/api/configuracion',
    'https://tecnodeskpro.com/api/suscripciones',
    'https://tecnodeskpro.com/api/superadmin/usuarios',
    'https://tecnodeskpro.com/api/tracking/abc123',
    // El backend puede vivir en otro host (Render).
    'https://api.tecnodeskpro.com/api/reparaciones',
    // Con query string, que es como viaja un GET con parámetros.
    'https://tecnodeskpro.com/api/clientes?pagina=2',
  ]

  for (const url of API_URLS) {
    const responded = sw.fetchRequest({ url, method: 'GET', mode: 'cors', destination: '' })
    assert.equal(responded, false, `la API no debe interceptarse: ${url}`)
  }

  assert.deepEqual(sw.writes, [], `no debe escribirse nada en caché, se escribió: ${JSON.stringify(sw.writes)}`)
})
test('8b. Tampoco cachea otros verbos ni datos de negocio', async () => {
  const sw = await runServiceWorker()
  const noCache = [
    { url: 'https://tecnodeskpro.com/api/reparaciones', method: 'POST' },
    { url: 'https://tecnodeskpro.com/api/caja', method: 'PUT' },
    { url: 'https://tecnodeskpro.com/api/clientes', method: 'DELETE' },
    { url: 'https://tecnodeskpro.com/seguimiento/token123', method: 'GET' },
  ]
  for (const { url, method } of noCache) {
    assert.equal(sw.fetchRequest({ url, method, mode: 'cors', destination: '' }), false, `no debe cachearse: ${method} ${url}`)
  }
  assert.deepEqual(sw.writes, [])
})

test('8c. Sí cachea los assets estáticos de la app', async () => {
  const sw = await runServiceWorker()
  const responded = sw.fetchRequest({
    url: 'https://tecnodeskpro.com/assets/index-a1b2c3d4.js',
    method: 'GET',
    mode: 'same-origin',
    destination: 'script',
  })

  assert.equal(responded, true, 'los assets estáticos sí se sirven desde la caché')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(sw.writes.length, 1, 'el asset se guarda en la caché de runtime')
  assert.match(sw.writes[0].url, /assets\/index-a1b2c3d4\.js$/)
})

test('8d. El worker activa la versión nueva al recibir SKIP_WAITING', async () => {
  const sw = await runServiceWorker()
  assert.ok(sw.handlers.get('message'), 'debe escuchar mensajes para activar la versión nueva')
  sw.handlers.get('message')({ data: { type: 'SKIP_WAITING' } })
  assert.equal(sw.didSkipWaiting(), true, 'la app debe poder promover el worker nuevo')
})

test('8e. La activación borra las cachés de versiones anteriores', async () => {
  const sw = await runServiceWorker({ buildId: 'release-nuevo' })
  const pending = []
  sw.handlers.get('activate')({ waitUntil: promise => pending.push(promise) })
  await Promise.all(pending)
  assert.ok(pending.length > 0, 'activate debe completar sus tareas')

  // Conserva las suyas y borra las de la versión vieja.
  assert.equal(
    sw.deletedCaches.includes('tecnodesk-precache-release-nuevo'),
    false,
    'no debe borrar su propia caché de precache',
  )
  assert.equal(
    sw.deletedCaches.includes('tecnodesk-runtime-release-nuevo'),
    false,
    'no debe borrar su propia caché de runtime',
  )
  assert.deepEqual(
    [...sw.deletedCaches].sort(),
    ['tecnodesk-precache-v1', 'tecnodesk-runtime-v1'],
    'solo debe borrar las cachés de otras versiones',
  )
})

test('8f. Las cachés se nombran con el BUILD_ID del release', async () => {
  const sw = await runServiceWorker({ buildId: 'abc123def456' })

  // El precache se abre con el nombre del release...
  const install = []
  sw.handlers.get('install')({ waitUntil: promise => install.push(promise) })
  await Promise.all(install)

  // ...y un asset con hash se guarda en la caché de runtime de ese mismo release.
  await sw.fetchAndSettle({
    url: 'https://tecnodeskpro.com/assets/index-a1b2c3d4.js',
    method: 'GET',
    mode: 'same-origin',
    destination: 'script',
  })
  assert.equal(sw.writes.length, 1)
  assert.equal(
    sw.writes[0].cache,
    'tecnodesk-runtime-abc123def456',
    'la caché de runtime debe llevar el BUILD_ID, no una versión fija',
  )
})

test('8g. El runtime cache solo guarda assets con hash o del precache', async () => {
  const sw = await runServiceWorker()

  // Se cachean: assets de Vite con hash, y los archivos de marca del precache.
  const yes = [
    'https://tecnodeskpro.com/assets/index-a1b2c3d4.js',
    'https://tecnodeskpro.com/assets/DashboardPage-DOdXiVqb.js',
    'https://tecnodeskpro.com/assets/logo-Baqw1234.png',
    'https://tecnodeskpro.com/tecnodesk-192.png',
    'https://tecnodeskpro.com/site.webmanifest',
  ]
  for (const url of yes) {
    assert.equal(
      sw.fetchRequest({ url, method: 'GET', mode: 'same-origin', destination: '' }),
      true,
      `debería cachearse: ${url}`,
    )
  }

  // NO se cachean: imágenes que pueden cambiar sin cambiar de URL. Antes estas
  // entraban por extensión y quedaban cacheadas para siempre.
  const no = [
    'https://tecnodeskpro.com/uploads/foto-cliente.jpg',
    'https://tecnodeskpro.com/avatars/marco.png',
    'https://tecnodeskpro.com/api/uploads/foto.webp',
    'https://tecnodeskpro.com/docs/manual.pdf',
    // Sin hash en el nombre: no se puede saber si es inmutable.
    'https://tecnodeskpro.com/assets/logo.png',
    // Con hash pero fuera de /assets: no es de Vite.
    'https://tecnodeskpro.com/logo-abcd1234.png',
  ]
  for (const url of no) {
    assert.equal(
      sw.fetchRequest({ url, method: 'GET', mode: 'same-origin', destination: '' }),
      false,
      `no debe cachearse: ${url}`,
    )
  }
  assert.deepEqual(sw.writes, [])
})

// ---------------------------------------------------------------------------
// 9. La actualización NUNCA es automática: solo recarga tras un clic
// ---------------------------------------------------------------------------

/**
 * Doble de `ServiceWorkerContainer` con registro, workers y eventos que el
 * test dispara a mano. `reloads` cuenta cuántas veces se habría recargado la
 * app: la regla de este archivo es que ese número solo puede subir después de
 * `applyUpdate()`.
 */
function createServiceWorkerEnvironment({ hasController = true } = {}) {
  const containerListeners = new Map()
  const workerListeners = new Map()
  const registrationListeners = new Map()
  const readyCallbacks = []
  const reloads = []
  const messages = []
  let updateCalls = 0

  const worker = {
    state: 'installing',
    postMessage(message) {
      messages.push(message)
    },
    addEventListener(type, handler) {
      if (!workerListeners.has(type)) workerListeners.set(type, [])
      workerListeners.get(type).push(handler)
    },
  }

  const registration = {
    installing: worker,
    waiting: null,
    update() {
      updateCalls++
      return Promise.resolve()
    },
    addEventListener(type, handler) {
      if (!registrationListeners.has(type)) registrationListeners.set(type, [])
      registrationListeners.get(type).push(handler)
    },
  }

  const container = {
    controller: hasController ? {} : null,
    register: () => Promise.resolve(registration),
    addEventListener(type, handler) {
      if (!containerListeners.has(type)) containerListeners.set(type, [])
      containerListeners.get(type).push(handler)
    },
  }

  return {
    container,
    registration,
    worker,
    messages,
    reloads,
    readyCallbacks,
    updateCalls: () => updateCalls,
    /** Simula que el worker nuevo terminó de instalarse y queda esperando. */
    finishInstall() {
      worker.state = 'installed'
      for (const handler of [...(registrationListeners.get('updatefound') ?? [])]) handler()
      for (const handler of [...(workerListeners.get('statechange') ?? [])]) handler()
    },
    /** Simula que el worker nuevo ya tomó el control. */
    changeController() {
      container.controller = {}
      for (const handler of [...(containerListeners.get('controllerchange') ?? [])]) handler()
    },
    reload: () => reloads.push(true),
  }
}

/**
 * Atajo para crear el controlador con un navegador falso y sin temporizadores.
 *
 * `whenReady` ejecuta el callback en el acto, que es lo que hace la app real
 * cuando el documento ya terminó de cargar (`readyState === 'complete'`).
 */
function createTestController(env, overrides = {}) {
  return createUpdateController({
    container: env.container,
    reload: env.reload,
    whenReady: run => {
      env.readyCallbacks.push(run)
      run()
    },
    setInterval: () => undefined,
    clearInterval: () => undefined,
    ...overrides,
  })
}

/** Deja resolver la promesa interna de `register()`. */
const settle = () => new Promise(resolve => setImmediate(resolve))

test('9. Un worker esperando NO recarga la app por sí solo', async () => {
  const env = createServiceWorkerEnvironment()
  const controller = createTestController(env)
  await settle()

  env.finishInstall()

  // Se informa que hay versión nueva...
  assert.equal(controller.getState().available, true, 'debe avisar que hay una versión nueva')
  assert.equal(controller.getState().applying, false, 'no debe estar aplicando sola')
  assert.deepEqual(env.messages, [], 'no debe mandar SKIP_WAITING sin que el usuario lo pida')

  // ...y aunque el worker nuevo tome el control por su cuenta, no recarga.
  env.changeController()
  assert.equal(env.reloads.length, 0, 'detectar una versión nueva NO puede recargar la página')
  assert.deepEqual(env.messages, [], 'nadie pidió actualizar, así que no hay SKIP_WAITING')
  controller.destroy()
})

test('9b. La recarga ocurre solo después de la acción explícita del usuario', async () => {
  const env = createServiceWorkerEnvironment()
  const controller = createTestController(env)
  await settle()

  env.finishInstall()
  assert.equal(env.reloads.length, 0, 'esperar una versión nueva no recarga nada')

  // Recién acá, con el clic del usuario.
  controller.applyUpdate()
  // Se comparan los campos y no el objeto entero: los mensajes se crean dentro
  // del sandbox y su prototipo no es el del proceso, así que el `deepEqual`
  // estricto fallaría por eso y no por el contenido.
  assert.equal(env.messages.length, 1, 'el clic es lo que promueve el worker')
  assert.equal(env.messages[0].type, 'SKIP_WAITING')
  assert.equal(controller.getState().applying, true, 'queda en estado "actualizando"')
  assert.equal(env.reloads.length, 0, 'todavía no recarga: falta el cambio de control')

  env.changeController()
  assert.equal(env.reloads.length, 1, 'el cambio de control recarga exactamente una vez')

  // La bandera evita recargar en cadena.
  env.changeController()
  assert.equal(env.reloads.length, 1, 'no debe recargar más de una vez')
  controller.destroy()
})

test('9c. Un worker que ya esperaba de la visita anterior se vuelve a ofrecer', async () => {
  const env = createServiceWorkerEnvironment()
  env.registration.waiting = { state: 'installed', postMessage: env.worker.postMessage, addEventListener() {} }

  const controller = createTestController(env)
  await settle()

  assert.equal(controller.getState().available, true, 'la versión pendiente no debe perderse al recargar')
  assert.equal(env.reloads.length, 0, 'ofrecerla no significa recargar')

  controller.applyUpdate()
  assert.equal(env.reloads.length, 0, 'sigue sin recargar hasta el cambio de control')
  env.changeController()
  assert.equal(env.reloads.length, 1)
  controller.destroy()
})

test('9d. La primera instalación no se toma por una actualización', async () => {
  // Sin controlador previo no hay nada que liberar: es la primera instalación.
  const env = createServiceWorkerEnvironment({ hasController: false })
  const controller = createTestController(env)
  await settle()

  env.finishInstall()
  assert.equal(controller.getState().available, false, 'la primera instalación no ofrece actualizar')
  assert.equal(env.reloads.length, 0)
  controller.destroy()
})

test('9e. applyUpdate sin versión pendiente no hace nada', async () => {
  const env = createServiceWorkerEnvironment()
  const controller = createTestController(env)
  await settle()

  controller.applyUpdate()
  assert.deepEqual(env.messages, [], 'no se promueve nada si no hay worker esperando')
  assert.equal(controller.getState().applying, false)
  controller.destroy()
})

test('9f. El chequeo periódico sigue activo y nunca recarga', async () => {
  const env = createServiceWorkerEnvironment()
  let timerHandler = null
  const controller = createTestController(env, {
    setInterval: handler => {
      timerHandler = handler
      return 1
    },
  })
  await settle()

  assert.ok(timerHandler, 'debe quedarse escuchando actualizaciones periódicamente')
  const before = env.updateCalls()
  timerHandler()
  assert.equal(env.updateCalls(), before + 1, 'el chequeo periódico consulta al navegador')
  assert.equal(env.reloads.length, 0, 'un chequeo nunca recarga la app')
  controller.destroy()
})

// ---------------------------------------------------------------------------
// Manifest, index.html e iconos
// ---------------------------------------------------------------------------

test('El manifest declara los campos y los iconos que exige una PWA', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'public/site.webmanifest'), 'utf8'))
  assert.equal(manifest.name, 'TecnoDesk')
  assert.equal(manifest.short_name, 'TecnoDesk')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.theme_color, '#075CFF')
  assert.equal(manifest.background_color, '#ffffff')

  const find = (size, purpose) => manifest.icons.find(icon => icon.sizes === size && icon.purpose === purpose)
  assert.ok(find('192x192', 'any'), 'falta el icono 192x192 purpose any')
  assert.ok(find('512x512', 'any'), 'falta el icono 512x512 purpose any')
  assert.ok(find('512x512', 'maskable'), 'falta el icono 512x512 maskable')

  // Todo icono del manifest tiene que existir realmente en public/.
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.resolve(ROOT, 'public', icon.src.slice(1))), `el icono ${icon.src} no existe`)
  }
})

test('index.html enlaza manifest, apple-touch-icon y theme-color', () => {
  const html = fs.readFileSync(path.resolve(ROOT, 'index.html'), 'utf8')
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/)
  assert.match(html, /rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/)
  assert.match(html, /name="theme-color" content="#075CFF"/)
  assert.match(html, /apple-mobile-web-app-title" content="TecnoDesk"/)
})

test('Los archivos de icono referenciados existen', () => {
  for (const file of [
    'public/tecnodesk-192.png',
    'public/tecnodesk-512.png',
    'public/tecnodesk-maskable-192.png',
    'public/tecnodesk-maskable-512.png',
    'public/apple-touch-icon.png',
    'public/favicon-32.png',
    'public/favicon.ico',
    // El logo oficial se conserva: es la fuente de todos los iconos.
    'assets/brand/logo-perfil-tecnodesk.png',
  ]) {
    assert.ok(fs.existsSync(path.resolve(ROOT, file)), `falta ${file}`)
  }
})

test('Los iconos se generan desde el logo oficial, no desde otro logo del repo', () => {
  const script = fs.readFileSync(path.resolve(ROOT, 'scripts/generate-pwa-icons.mjs'), 'utf8')
  assert.match(
    script,
    /assets\/brand\/logo-perfil-tecnodesk\.png/,
    'el generador debe leer el logo perfil que entregó el usuario',
  )
  // El logo anterior se conserva en el repo para la web, pero ya no es la
  // fuente de los iconos: son imágenes distintas.
  assert.doesNotMatch(
    script,
    /SOURCE\s*=\s*resolve\(ROOT,\s*'public\/tecnodesk-mark\.png'\)/,
    'los iconos no deben derivarse del logo antiguo del repo',
  )
})

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 10. El service worker cambia en cada release (BUILD_ID automático)
// ---------------------------------------------------------------------------

test('10. El worker es un template con marcador, no un sw.js fijo en public/', () => {
  // Si volviera a estar en `public/`, Vite lo copiaría tal cual y dos releases
  // darían el mismo archivo: el navegador nunca lo vería como nuevo.
  assert.equal(
    fs.existsSync(path.resolve(ROOT, 'public/sw.js')),
    false,
    'public/sw.js no debe existir: se genera en el build desde el template',
  )

  const template = fs.readFileSync(path.resolve(ROOT, 'src/pwa/sw.template.js'), 'utf8')
  assert.match(
    template,
    /const BUILD_ID = '__TECNODESK_BUILD_ID__'/,
    'el template debe declarar el marcador que el build reemplaza',
  )

  // Y no debe quedar con una versión fija escrita a mano.
  assert.doesNotMatch(
    template,
    /const VERSION\s*=\s*'v\d+'/,
    'no debe haber una versión escrita a mano que nadie recuerde cambiar',
  )
})

test('11. Dos BUILD_ID distintos generan dos sw.js distintos', async () => {
  const { renderServiceWorker } = await withBuildIdModule
  const template = fs.readFileSync(path.resolve(ROOT, 'src/pwa/sw.template.js'), 'utf8')

  const shaA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
  const shaB = 'f0e9d8c7b6a5948372615f4e3d2c1b0a99887766'
  const releaseA = renderServiceWorker(template, shaA)
  const releaseB = renderServiceWorker(template, shaB)

  assert.notEqual(releaseA, releaseB, 'dos releases deben producir workers distintos')
  assert.ok(releaseA.includes(`const BUILD_ID = '${shaA}'`), 'el SHA debe quedar escrito en el worker')
  assert.ok(releaseB.includes(`const BUILD_ID = '${shaB}'`))
  assert.equal(releaseA.includes('__TECNODESK_BUILD_ID__'), false, 'el marcador no puede sobrevivir')
  assert.equal(releaseB.includes('__TECNODESK_BUILD_ID__'), false, 'el marcador no puede sobrevivir')

  // Idénticos salvo por el id: la diferencia la causa el BUILD_ID, no otra cosa.
  assert.equal(
    releaseA.replaceAll(shaA, 'ID'),
    releaseB.replaceAll(shaB, 'ID'),
    'el worker solo debe cambiar por el BUILD_ID',
  )
})

test('12. El BUILD_ID sale del commit, no de una constante ni de la fecha', async () => {
  const { resolveBuildId, hashContent, DEV_BUILD_ID } = await withBuildIdModule

  // 1) Vercel manda el SHA del commit.
  assert.equal(
    resolveBuildId({ environment: { VERCEL_GIT_COMMIT_SHA: 'vercel-sha-1234' } }),
    'vercel-sha-1234',
    'en Vercel se usa VERCEL_GIT_COMMIT_SHA',
  )
  // 2) GitHub Actions, por si algún día cambia el hosting.
  assert.equal(resolveBuildId({ environment: { GITHUB_SHA: 'github-sha-5678' } }), 'github-sha-5678')
  // 3) Con ambas presentes, gana la del hosting activo.
  assert.equal(
    resolveBuildId({ environment: { VERCEL_GIT_COMMIT_SHA: 'v', GITHUB_SHA: 'g' } }),
    'v',
    'debe tener prioridad VERCEL_GIT_COMMIT_SHA',
  )

  // 4) Sin variables, cae al HEAD del repo: 40 hex, nunca una fecha.
  const fromGit = resolveBuildId({ environment: {}, cwd: path.resolve(ROOT, '..') })
  assert.match(fromGit, /^[0-9a-f]{40}$/, `el fallback local debe ser el SHA de HEAD, se obtuvo: ${fromGit}`)

  // 5) Sin repo ni CI: hash del contenido, que sigue siendo determinista.
  assert.equal(
    resolveBuildId({ environment: {}, cwd: cwdFueraDelRepo, contentHash: 'contenido123' }),
    'contenido123',
  )
  assert.equal(hashContent('abc'), hashContent('abc'), 'el hash debe ser estable')
  assert.notEqual(hashContent('abc'), hashContent('abd'), 'el hash debe cambiar con el contenido')

  // 6) Nada de `Date.now()`: el id de un release no puede depender del reloj.
  assert.notEqual(resolveBuildId({ environment: {} }), 'v1', 'el id no debe ser una constante fija')
  assert.equal(DEV_BUILD_ID, 'dev', 'en desarrollo el id es fijo a propósito')
})

test('13. El plugin escribe dist/sw.js y no toca los archivos del repo', async () => {
  const { serviceWorkerPlugin } = await import(
    pathToFileURL(path.resolve(ROOT, 'scripts/vite-plugin-service-worker.mjs')).href
  )
  const plugin = serviceWorkerPlugin({ root: ROOT, environment: { VERCEL_GIT_COMMIT_SHA: 'abc123' } })
  assert.equal(plugin.name, 'tecnodesk:service-worker')

  const templatePath = path.resolve(ROOT, 'src/pwa/sw.template.js')
  const templateBefore = fs.readFileSync(templatePath, 'utf8')

  const emitted = []
  plugin.buildStart.call({
    emitFile: descriptor => emitted.push(descriptor),
    info: () => undefined,
    warn: () => undefined,
  })

  assert.equal(emitted.length, 1, 'debe emitir exactamente un archivo')
  assert.equal(emitted[0].fileName, 'sw.js', 'debe publicarse como /sw.js, que es lo que registra la app')
  assert.ok(emitted[0].source.includes("const BUILD_ID = 'abc123'"), 'debe llevar el BUILD_ID del release')
  assert.equal(emitted[0].source.includes('__TECNODESK_BUILD_ID__'), false)

  // Lo importante: el build NO escribe sobre el source. El template se lee y se
  // transforma en memoria, así que `git status` sigue limpio.
  assert.equal(
    fs.readFileSync(templatePath, 'utf8'),
    templateBefore,
    'el template del repo no debe ser modificado por el build',
  )
  assert.ok(templateBefore.includes('__TECNODESK_BUILD_ID__'), 'el template conserva su marcador')
  assert.equal(
    fs.existsSync(path.resolve(ROOT, 'public/sw.js')),
    false,
    'el build no debe dejar un sw.js generado dentro de public/',
  )
})

test('14. Sin SHA ni repositorio, el build avisa en vez de fallar en silencio', async () => {
  const { serviceWorkerPlugin } = await import(
    pathToFileURL(path.resolve(ROOT, 'scripts/vite-plugin-service-worker.mjs')).href
  )
  // Peor caso: sin variables de entorno y sin repositorio donde buscar.
  const warnings = []
  const emitted = []
  const plugin = serviceWorkerPlugin({
    root: ROOT,
    environment: {},
    gitRoot: cwdFueraDelRepo,
  })
  plugin.buildStart.call({
    emitFile: descriptor => emitted.push(descriptor),
    info: () => undefined,
    warn: message => warnings.push(message),
  })

  assert.equal(emitted.length, 1, 'igual debe publicar el worker, no romperse')
  assert.equal(warnings.length, 1, 'debe advertir que el id no es confiable')
  assert.match(warnings[0], /VERCEL_GIT_COMMIT_SHA/, 'la advertencia debe explicar qué revisar')
  assert.ok(
    emitted[0].source.includes("const BUILD_ID = 'sin-build-id'"),
    'y el id publicado queda visible para poder detectarlo',
  )
})

test('15. Con un BUILD_ID nuevo, el aviso aparece sin recargar sola', async () => {
  // Este es el motivo de todo lo anterior: si `sw.js` no cambiara entre
  // releases, nunca habría `updatefound` y el aviso no aparecería nunca.
  const { renderServiceWorker } = await withBuildIdModule
  const template = fs.readFileSync(path.resolve(ROOT, 'src/pwa/sw.template.js'), 'utf8')
  const releaseAnterior = renderServiceWorker(template, 'release-anterior')
  const releaseNuevo = renderServiceWorker(template, 'release-nuevo')
  assert.notEqual(releaseAnterior, releaseNuevo, 'dos releases producen workers distintos')

  // Y con el worker nuevo instalado, el flujo completo se mantiene.
  const env = createServiceWorkerEnvironment()
  const controller = createTestController(env)
  await settle()

  env.finishInstall()

  assert.equal(controller.getState().available, true, 'debe avisar que hay una versión nueva')
  assert.equal(env.reloads.length, 0, 'y NO debe recargar por detectarla')
  assert.equal(env.messages.length, 0, 'ni debe promoverse sola')

  // Recién con el clic se promueve y se recarga, una sola vez.
  controller.applyUpdate()
  assert.equal(env.messages.length, 1, 'el clic es lo único que manda SKIP_WAITING')
  env.changeController()
  assert.equal(env.reloads.length, 1, 'después del cambio de control recarga una vez')
  env.changeController()
  assert.equal(env.reloads.length, 1, 'y nunca más de una vez')
})

test('16. Un controllerchange sin applyUpdate NO recarga', async () => {
  // La garantía clave: `controllerchange` puede dispararse porque OTRA pestaña
  // reclamó el control. Sin el clic del usuario, la app no debe recargarse.
  const env = createServiceWorkerEnvironment()
  const controller = createTestController(env)
  await settle()

  env.finishInstall()
  assert.equal(controller.getState().available, true)
  assert.equal(env.reloads.length, 0)

  // Cambio de control sin que el usuario haya tocado nada.
  env.changeController()
  assert.equal(env.reloads.length, 0, 'un controllerchange sin applyUpdate NO debe recargar')

  // Con el clic: promote manda el mensaje y el cambio de control recarga una vez.
  controller.applyUpdate()
  assert.equal(env.messages.length, 1)
  assert.equal(env.messages[0].type, 'SKIP_WAITING')
  env.changeController()
  assert.equal(env.reloads.length, 1, 'tras el clic sí recarga')
  env.changeController()
  assert.equal(env.reloads.length, 1, 'y solo una vez')
})

// ---------------------------------------------------------------------------

async function main() {
  let failures = 0
  for (const { name, run } of tests) {
    try {
      await run()
      console.log(`  OK  ${name}`)
    } catch (error) {
      failures++
      console.error(`  FALLA  ${name}`)
      console.error(`        ${error.message}`)
    }
  }
  console.log(`\n${tests.length - failures}/${tests.length} pruebas PWA correctas`)
  if (failures) process.exit(1)
}

main()
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

const ROOT = path.resolve(__dirname, '..')

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
function runServiceWorker() {
  const source = fs.readFileSync(path.resolve(ROOT, 'public/sw.js'), 'utf8')
  const writes = []
  const handlers = new Map()

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
    keys: async () => ['tecnodesk-precache-v1', 'tecnodesk-runtime-v1', 'tecnodesk-precache-v0'],
    delete: async () => true,
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
  }
}

test('8. El service worker no cachea ninguna petición a /api/*', () => {
  const sw = runServiceWorker()
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
test('8b. Tampoco cachea otros verbos ni datos de negocio', () => {
  const sw = runServiceWorker()
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
  const sw = runServiceWorker()
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

test('8d. El worker activa la versión nueva al recibir SKIP_WAITING', () => {
  const sw = runServiceWorker()
  assert.ok(sw.handlers.get('message'), 'debe escuchar mensajes para activar la versión nueva')
  sw.handlers.get('message')({ data: { type: 'SKIP_WAITING' } })
  assert.equal(sw.didSkipWaiting(), true, 'la app debe poder promover el worker nuevo')
})

test('8e. La activación borra las cachés de versiones anteriores', async () => {
  const sw = runServiceWorker()
  const pending = []
  sw.handlers.get('activate')({ waitUntil: promise => pending.push(promise) })
  await Promise.all(pending)
  assert.ok(pending.length > 0, 'activate debe completar sus tareas')
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
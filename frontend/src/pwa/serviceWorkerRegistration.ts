/**
 * Registro y actualización del service worker.
 *
 * ESTRATEGIA DE ACTUALIZACIÓN (la parte importante de esto):
 *
 * 1. El service worker NO se auto-activa al instalarse. Espera.
 * 2. La aplicación registra el worker y, cuando aparece una versión nueva
 *    esperando (`updatefound` -> `installed` con un controlador ya activo),
 *    NO hace nada: solo informa que hay una versión disponible.
 * 3. Se muestra un aviso discreto con un botón "Actualizar ahora". Solo si el
 *    usuario lo toca se le manda `SKIP_WAITING` al worker, y únicamente entonces
 *    la app recarga una sola vez al cambiar el controlador.
 *
 * POR QUÉ NO HAY RECARGA AUTOMÁTICA NUNCA:
 *
 * `requestIdleCallback` -> `skipWaiting` -> `controllerchange` -> `reload()`
 * parece prudente, pero `requestIdleCallback` no sabe qué hay en pantalla: no
 * distingue "la app está quieta" de "alguien lleva diez minutos escribiendo una
 * reparación". En TecnoDesk eso significa perder en silencio:
 *
 *   - una reparación en carga (cliente, equipo, falla, diagnóstico);
 *   - los datos de un cliente;
 *   - un pago o un gasto de caja;
 *   - la configuración del sistema;
 *   - cualquier formulario administrativo a medio completar.
 *
 * Perder ese trabajo por una recarga automática es inaceptable, así que la
 * recarga solo existe detrás de un clic. Mientras tanto la app sigue con la
 * versión actual: es un inconvenience menor y reversible (se recarga y se toma
 * la versión nueva), mientras que perder un formulario es irreversible.
 *
 * La versión nueva no se pierde: el worker queda esperando, así que el aviso
 * vuelve a ofrecerse en la próxima carga o al volver a la pestaña. Y como el
 * chequeo es periódico y también ocurre al recuperar el foco, tampoco queda
 * nadie atrapado con un bundle viejo.
 */

/** Cada cuánto se le pregunta al navegador si hay una versión nueva. */
export const SW_UPDATE_INTERVAL_MS = 60 * 60 * 1000

/**
 * El service worker se sirve siempre desde `public/`, sin build.
 *
 * En desarrollo se le pasa `?dev=1` para que el worker NO guarde nada en caché:
 * si cacheara los módulos que sirve Vite, rompería el hot reload. Aun así
 * registra un handler de `fetch`, que es lo que Chrome exige para considerar
 * instalable la app, así el aviso de instalación se puede probar en local.
 */
export const SERVICE_WORKER_URL = import.meta.env.PROD ? '/sw.js' : '/sw.js?dev=1'

interface WorkerLike {
  state: string
  postMessage: (message: unknown) => void
  addEventListener: (type: string, listener: () => void) => void
}

interface RegistrationLike {
  installing: WorkerLike | null
  waiting: WorkerLike | null
  update: () => Promise<void>
  addEventListener: (type: string, listener: () => void) => void
}

/** Lo mínimo del `ServiceWorkerContainer` que usa este módulo. */
export interface ContainerLike {
  controller: unknown
  register: (url: string, options?: { scope?: string }) => Promise<RegistrationLike>
  addEventListener: (type: string, listener: () => void) => void
}

/**
 * Estado del aviso de actualización.
 *
 * `available` significa "hay una versión nueva esperando". No implica que vaya
 * a pasar nada por sí solo: la app sigue funcionando con la versión actual
 * hasta que el usuario pulse "Actualizar ahora".
 */
export interface UpdateState {
  available: boolean
  /** El usuario ya pidió actualizar y se está esperando el cambio de control. */
  applying: boolean
}

export interface UpdateController {
  getState(): UpdateState
  subscribe(listener: (state: UpdateState) => void): () => void
  /** Acción del usuario: recién aquí se promueve el worker y se recarga. */
  applyUpdate(): void
  destroy(): void
}


export interface ControllerEnvironment {
  container: ContainerLike
  /** Inyectable para poder probar la recarga sin tocar `window` de verdad. */
  reload: () => void
  url?: string
  scope?: string
  intervalMs?: number
  setInterval?: (handler: () => void, ms: number) => unknown
  clearInterval?: (handle: unknown) => void
  /** Se llama al registrar, o al hacer `load` si la página todavía no cargó. */
  whenReady: (run: () => void) => void
}

/**
 * Crea el controlador de actualización del service worker.
 *
 * Es una máquina de estados sin React y con el navegador inyectado, para que la
 * regla central de este archivo se pueda probar en Node: que un worker en
 * espera NO recargue nada por sí solo, y que la recarga ocurra únicamente
 * después de una acción explícita del usuario.
 */
export function createUpdateController({
  container,
  reload,
  url = SERVICE_WORKER_URL,
  scope = '/',
  intervalMs = SW_UPDATE_INTERVAL_MS,
  setInterval: setTimer = (handler, ms) => setInterval(handler, ms),
  clearInterval: clearTimer = handle => clearInterval(handle as ReturnType<typeof setInterval>),
  whenReady,
}: ControllerEnvironment): UpdateController {
  let state: UpdateState = { available: false, applying: false }
  let disposed = false
  let reloading = false
  let pendingWorker: WorkerLike | null = null
  let timer: unknown
  const listeners = new Set<(state: UpdateState) => void>()

  const setState = (next: UpdateState) => {
    if (next.available === state.available && next.applying === state.applying) return
    state = next
    for (const listener of listeners) listener(state)
  }

  const stopChecks = () => {
    if (timer !== undefined) clearTimer(timer)
    timer = undefined
  }

  /**
   * Se registra un worker nuevo esperando. Solo se informa; no se promueve.
   * Que ya exista un controlador distingue "actualización" de la primera
   * instalación, en la que no hay nada que liberar.
   */
  const announceUpdate = (worker: WorkerLike) => {
    if (disposed || !container.controller) return
    pendingWorker = worker
    setState({ available: true, applying: false })
  }

  /** Acción del usuario: recién aquí se promueve el worker. */
  const promote = () => {
    if (disposed || reloading) return
    const worker = pendingWorker
    if (!worker) return
    setState({ available: true, applying: true })
    worker.postMessage({ type: 'SKIP_WAITING' })
  }

  const register = () => {
    if (disposed) return
    container
      .register(url, { scope })
      .then(registration => {
        if (disposed) return

        // Un worker que quedó esperando de una visita anterior se ofrece
        // apenas se entra: así la actualización no se pierde al recargar.
        if (registration.waiting && container.controller) {
          pendingWorker = registration.waiting
          setState({ available: true, applying: false })
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state !== 'installed') return
            announceUpdate(installing)
          })
        })

        // ÚNICO punto donde se recarga, y solo si el usuario ya lo pidió.
        // La condición `state.applying` es la garantía: sin ella, cualquier
        // `controllerchange` (por ejemplo, otra pestaña que reclame el control)
        // recargaría la app sin que nadie lo haya pedido.
        container.addEventListener('controllerchange', () => {
          if (disposed || reloading) return
          if (!state.applying) return
          reloading = true
          reload()
        })

        // Pregunta periódica: cubre al usuario que deja la app abierta días.
        timer = setTimer(() => {
          if (disposed) return
          // Si ya hay un worker esperando, no hay nada nuevo que buscar.
          if (registration.waiting) return
          void registration.update().catch(() => undefined)
        }, intervalMs)

        // Volver a la pestaña o recuperar el foco también consulta.
        whenReady(() => void registration.update().catch(() => undefined))
      })
      .catch(() => {
        // Sin service worker la app sigue siendo una web normal.
      })
  }

  // Registrar después de cargar para no competir con el primer render.
  whenReady(register)

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    applyUpdate: promote,
    destroy() {
      disposed = true
      stopChecks()
      listeners.clear()
    },
  }
}

/**
 * Registra el worker y devuelve su controlador de actualización.
 *
 * Devuelve `undefined` cuando el entorno no soporta service workers: en ese
 * caso la app sigue funcionando como web normal y, en iOS, la instalación
 * manual se sigue ofreciendo igual.
 */
export function registerServiceWorker(win: Window = window): UpdateController | undefined {
  if (!('serviceWorker' in win.navigator)) return undefined

  return createUpdateController({
    container: win.navigator.serviceWorker as unknown as ContainerLike,
    reload: () => win.location.reload(),
    whenReady: run => {
      if (win.document?.readyState === 'complete') run()
      else win.addEventListener('load', run, { once: true })
    },
  })
}


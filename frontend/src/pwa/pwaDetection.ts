/**
 * Detección del entorno de instalación.
 *
 * Todo lo que depende del navegador entra por parámetro con valores por
 * defecto, así que estas funciones se pueden ejercitar en Node sin DOM ni
 * window. Ninguna toca `window` en el momento de ser importada.
 */

/** Atributo no estándar que Safari iOS expone en la app instalada. */
type IosStandaloneNavigator = Navigator & { standalone?: boolean }

/**
 * ¿La app se está ejecutando ya como aplicación instalada?
 *
 * La fuente de verdad es el estado real del navegador (`display-mode`), no un
 * booleano guardado: si el usuario desinstala la app, esta función vuelve a
 * `false` sin que nadie tenga que limpiar nada.
 */
export function isStandalone(win: Window = window): boolean {
  const displayMode = win.matchMedia?.('(display-mode: standalone)')
  if (displayMode?.matches) return true
  // Chrome/Edge en algunos modos de ventana y Firefox en some versiones.
  if (win.matchMedia?.('(display-mode: window-controls-overlay)')?.matches) return true
  if (win.matchMedia?.('(display-mode: fullscreen)')?.matches) return true
  // Safari iOS: solo existe cuando corre desde la pantalla de inicio.
  return (win.navigator as IosStandaloneNavigator | undefined)?.standalone === true
}

/**
 * ¿Estamos en iOS o iPadOS?
 *
 * No se busca una cadena rígida de user agent. iPadOS desde la versión 13 se
 * presenta como un Macintosh de escritorio, así que se distingue por la
 * cantidad de puntos de táctil, que en un iPad es mayor que 1.
 */
export function isIos(win: Window = window): boolean {
  const nav = win.navigator
  if (!nav) return false
  const userAgent = nav.userAgent ?? ''
  if (/iPad|iPhone|iPod/i.test(userAgent)) return true
  // iPadOS disfrazado de escritorio: user agent "Macintosh" y puntos de táctil > 1.
  if (/Macintosh/i.test(userAgent) && (nav.maxTouchPoints ?? 0) > 1) return true
  return false
}

/** Safari en iOS es el único que puede pedir "Añadir a pantalla de inicio". */
export function isIosSafari(win: Window = window): boolean {
  const nav = win.navigator
  if (!nav) return false
  const userAgent = nav.userAgent ?? ''
  return /iPad|iPhone|iPod/i.test(userAgent) && /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(userAgent)
}

/**
 * ¿El navegador soporta el diálogo nativo de instalación?
 *
 * Se deduce de que exista el evento, no de la marca del navegador: es la
 * única comprobación fiable y cubre Chrome, Edge, Samsung Internet y Opera.
 */
export function supportsNativePrompt(beforeInstallPrompt: unknown): boolean {
  return typeof beforeInstallPrompt === 'object' && beforeInstallPrompt !== null
}

/**
 * ¿Tiene sentido ofrecer instalar?
 *
 * Nunca si ya está instalada. En iOS se ofrece siempre el flujo manual porque
 * Safari no dispara `beforeinstallprompt`.
 */
export function shouldOfferInstall({ installed, beforeInstallPrompt, ios }: {
  installed: boolean
  beforeInstallPrompt: unknown
  ios: boolean
}): boolean {
  if (installed) return false
  if (supportsNativePrompt(beforeInstallPrompt)) return true
  return ios
}

/** ¿Cómo debe realizarse la instalación en este dispositivo? */
export type InstallMethod = 'native' | 'ios-manual' | 'unsupported'

export function resolveInstallMethod({ installed, beforeInstallPrompt, ios }: {
  installed: boolean
  beforeInstallPrompt: unknown
  ios: boolean
}): InstallMethod {
  if (installed) return 'unsupported'
  if (supportsNativePrompt(beforeInstallPrompt)) return 'native'
  if (ios) return 'ios-manual'
  return 'unsupported'
}

/**
 * `beforeinstallprompt` puede llegar en cualquier momento (típicamente después
 * de que la página carga y el worker registra). Se escucha lo antes posible.
 */
export function onBeforeInstallPrompt(
  win: Window,
  handler: (event: BeforeInstallPromptEvent) => void,
): () => void {
  win.addEventListener('beforeinstallprompt', handler as EventListener)
  return () => win.removeEventListener('beforeinstallprompt', handler as EventListener)
}

/**
 * Evento `beforeinstallprompt`.
 *
 * Chrome lo expone en `window` pero no está en los tipos de TypeScript, y
 * además no es estándar: se define acá para no castear a `any` por todo el
 * código.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function onAppInstalled(win: Window, handler: () => void): () => void {
  win.addEventListener('appinstalled', handler)
  return () => win.removeEventListener('appinstalled', handler)
}

/**
 * Escucha los cambios de `display-mode` para reaccionar a que el usuario
 * abra o cierre la app instalada sin tener que recargar.
 */
export function onDisplayModeChange(win: Window, handler: (standalone: boolean) => void): () => void {
  const queries = ['(display-mode: standalone)', '(display-mode: window-controls-overlay)', '(display-mode: fullscreen)']
  const lists = queries.map(query => win.matchMedia?.(query)).filter(Boolean) as MediaQueryList[]
  const listener = () => handler(isStandalone(win))
  for (const list of lists) list.addEventListener?.('change', listener)
  return () => {
    for (const list of lists) list.removeEventListener?.('change', listener)
  }
}
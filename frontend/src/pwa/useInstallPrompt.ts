/**
 * Puente entre el controlador de instalación y React.
 *
 * El componente no conoce la lógica: solo se suscribe al estado. Si el
 * controlador cambia (por ejemplo en los tests) el hook se reconecta.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  createInstallPromptController,
  type InstallPromptController,
  type InstallPromptState,
} from './installPromptController'
import { safeLocalStorage } from './safeStorage'

const INITIAL_STATE: InstallPromptState = {
  installed: false,
  method: 'unsupported',
  visible: false,
  instructionsOpen: false,
}

/**
 * Crea el controlador una sola vez por sesión.
 *
 * Vive fuera del ciclo de render para no reiniciarse en cadaStrictMode double
 * mount, que en desarrollo dispararía dos veces los listeners del navegador.
 */
let controller: InstallPromptController | null = null

function getController(): InstallPromptController {
  if (!controller) {
    controller = createInstallPromptController({ win: window, storage: safeLocalStorage() })
  }
  return controller
}

/** Libera el singleton. Lo usan los tests para partir de un estado limpio. */
export function resetInstallPromptController(): void {
  controller?.destroy()
  controller = null
}

export function useInstallPrompt(): {
  state: InstallPromptState
  controller: InstallPromptController
} {
  const controllerRef = useRef<InstallPromptController | null>(null)
  if (controllerRef.current === null && typeof window !== 'undefined') {
    controllerRef.current = getController()
  }

  const instance = controllerRef.current
  const subscribe = useRef<(listener: () => void) => () => void>(() => () => undefined)
  const getSnapshot = useRef<() => InstallPromptState>(() => INITIAL_STATE)

  if (instance) {
    subscribe.current = (listener: () => void) => instance.subscribe(() => listener())
    getSnapshot.current = () => instance.getState()
  }

  const state = useSyncExternalStore(subscribe.current, getSnapshot.current, () => INITIAL_STATE)

  useEffect(() => () => {
    // El controlador es un singleton de sesión: no se destruye al desmontar el
    // componente, porque puede volver a montarse en otra ruta.
  }, [])

  return { state, controller: instance as InstallPromptController }
}
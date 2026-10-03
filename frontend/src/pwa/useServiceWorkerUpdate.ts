/**
 * Puente entre el controlador de actualización del service worker y React.
 *
 * El controlador vive fuera de React (ver `serviceWorkerRegistration.ts`) para
 * que la regla de "nunca recargar solo" se pueda probar en Node. Acá solo se
 * guarda su referencia y se expone el estado a los componentes.
 */
import { useSyncExternalStore } from 'react'
import type { UpdateController, UpdateState } from './serviceWorkerRegistration'

const INITIAL_STATE: UpdateState = { available: false, applying: false }

let controller: UpdateController | null = null

/**
 * Guarda el controlador que devuelve `registerServiceWorker`.
 *
 * Puede recibir `undefined` (navegador sin soporte): en ese caso no hay aviso
 * de actualización, que es exactamente lo que corresponde.
 */
export function setServiceWorkerUpdateController(next: UpdateController | undefined): void {
  controller = next ?? null
}

const subscribe = (listener: () => void) => controller?.subscribe(() => listener()) ?? (() => undefined)
const getSnapshot = () => controller?.getState() ?? INITIAL_STATE

/** Estado de la actualización: si hay versión nueva y si ya se pidió aplicar. */
export function useServiceWorkerUpdate(): UpdateState {
  return useSyncExternalStore(subscribe, getSnapshot, () => INITIAL_STATE)
}

/**
 * Acción del usuario para tomar la versión nueva.
 *
 * Es el ÚNICO camino hacia `SKIP_WAITING` y hacia la recarga. Si no hay versión
 * nueva esperando, no hace nada.
 */
export function applyServiceWorkerUpdate(): void {
  controller?.applyUpdate()
}
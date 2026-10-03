/**
 * Controlador del aviso de instalación.
 *
 * Es una máquina de estados sin React: recibe el entorno como dependencias y
 * expone un estado observable. Así la lógica de `standalone`, el cooldown, iOS
 * y `beforeinstallprompt` se puede probar en Node sin montar componentes ni
 * simular el diálogo nativo del navegador. El componente React solo lee este
 * estado y dibuja.
 */
import {
  isIos,
  isStandalone,
  onAppInstalled,
  onBeforeInstallPrompt,
  onDisplayModeChange,
  resolveInstallMethod,
  type BeforeInstallPromptEvent,
  type InstallMethod,
} from './pwaDetection'
import { clearDismissedAt, isWithinCooldown, rememberDismissal, type StorageLike } from './installCooldown'

export interface InstallPromptState {
  /** ¿Se está ejecutando ya como app instalada? Fuente: estado real del navegador. */
  installed: boolean
  /** Método de instalación disponible en este dispositivo. */
  method: InstallMethod
  /** ¿Corresponde mostrar el aviso ahora mismo? */
  visible: boolean
  /** ¿El usuario está mirando el diálogo manual de iOS? */
  instructionsOpen: boolean
}

export interface InstallPromptEnvironment {
  win: Window
  storage?: StorageLike
  now?: () => number
}

type Listener = (state: InstallPromptState) => void

export interface InstallPromptController {
  getState(): InstallPromptState
  subscribe(listener: Listener): () => void
  /** Lanza el diálogo nativo. Devuelve si el usuario aceptó. */
  promptInstall(): Promise<boolean>
  /** "Ahora no": silencia el aviso durante el período de cooldown. */
  dismiss(): void
  openInstructions(): void
  closeInstructions(): void
  destroy(): void
}

export function createInstallPromptController({ win, storage, now = Date.now }: InstallPromptEnvironment): InstallPromptController {
  let installed = isStandalone(win)
  let beforeInstallPrompt: BeforeInstallPromptEvent | null = null
  let dismissed = isWithinCooldown(now(), storage)
  let instructionsOpen = false
  const listeners = new Set<Listener>()

  const compute = (): InstallPromptState => {
    const method = resolveInstallMethod({ installed, beforeInstallPrompt, ios: isIos(win) })
    const visible = !installed && !dismissed && method !== 'unsupported'
    return { installed, method, visible, instructionsOpen }
  }

  let state = compute()
  const emit = () => {
    const next = compute()
    if (
      next.installed === state.installed &&
      next.method === state.method &&
      next.visible === state.visible &&
      next.instructionsOpen === state.instructionsOpen
    ) {
      return
    }
    state = next
    for (const listener of listeners) listener(state)
  }

  // Se guarda el evento sin abrir el prompt: el nativo solo puede mostrarse
  // desde un gesto del usuario, así que se lanza recién al tocar "Instalar".
  const offBeforeInstallPrompt = onBeforeInstallPrompt(win, event => {
    event.preventDefault()
    beforeInstallPrompt = event
    emit()
  })

  // `appinstalled` es la confirmación real de que quedó instalada: se limpia
  // cualquier estado pendiente y el aviso no vuelve a aparecer en la sesión.
  const offAppInstalled = onAppInstalled(win, () => {
    installed = true
    beforeInstallPrompt = null
    dismissed = false
    instructionsOpen = false
    // Si terminó instalada, el "Ahora no" anterior ya no significa nada: se
    // limpia para que una desinstalación futura vuelva a ofrecer sin esperar.
    clearDismissedAt(storage)
    emit()
  })

  const offDisplayModeChange = onDisplayModeChange(win, standalone => {
    installed = standalone
    if (installed) {
      beforeInstallPrompt = null
      instructionsOpen = false
    }
    emit()
  })

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async promptInstall() {
      const event = beforeInstallPrompt
      if (!event) return false
      try {
        await event.prompt()
        const choice = await event.userChoice
        const accepted = choice.outcome === 'accepted'
        if (accepted) {
          // La confirmación real llega en `appinstalled`; igual se oculta ya
          // para que la interfaz reaccione al instante.
          installed = true
        }
        emit()
        return accepted
      } catch {
        // Un prompt que falla no debe romper la app: se trata como no aceptado.
        return false
      } finally {
        // El evento es de un solo uso: se suelta siempre la referencia.
        beforeInstallPrompt = null
        emit()
      }
    },
    dismiss() {
      dismissed = true
      instructionsOpen = false
      rememberDismissal(now(), storage)
      emit()
    },
    openInstructions() {
      instructionsOpen = true
      emit()
    },
    closeInstructions() {
      instructionsOpen = false
      emit()
    },
    destroy() {
      offBeforeInstallPrompt()
      offAppInstalled()
      offDisplayModeChange()
      listeners.clear()
    },
  }
}
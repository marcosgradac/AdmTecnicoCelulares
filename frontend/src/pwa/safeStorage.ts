/**
 * Acceso defensivo a localStorage.
 *
 * En modo privado o con cookies bloqueadas, `localStorage` puede lanzar al
 * incluso leer `window.localStorage`. Se aísla en un solo lugar para que el
 * resto del código PWA no tenga que repetirse el `try/catch`.
 */
import type { StorageLike } from './installCooldown'

export function safeLocalStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
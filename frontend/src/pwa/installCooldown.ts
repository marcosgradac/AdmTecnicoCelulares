/**
 * Cooldown de la invitación de instalación.
 *
 * Cuando el usuario elige "Ahora no" no queremos molestarlo en cada visita,
 * pero tampoco se abandona la instalación para siempre. Se guarda el momento del
 * rechazo y la invitación vuelve a estar disponible cuando pasa el período.
 *
 * El período vive en una constante con nombre (`INSTALL_PROMPT_COOLDOWN_DAYS`)
 * en lugar de un 604800000 suelto por el código: es la decisión de producto y
 * tiene que poder leerse y cambiarse en un solo lugar.
 */

/**
 * Días que TecnoDesk espera después de un "Ahora no" antes de volver a ofrecer.
 * Si hay que cambiarlo, se cambia acá y en ningún otro lugar.
 */
export const INSTALL_PROMPT_COOLDOWN_DAYS = 7

/** Milisegundos del período de espera, derivados de la constante de días. */
export const INSTALL_PROMPT_COOLDOWN_MS = INSTALL_PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

/** Clave de localStorage. Versionada por si alguna vez cambia el formato. */
export const INSTALL_DISMISSED_KEY = 'tecnodesk:install-dismissed-at'

/** Interfaz mínima de almacenamiento, para poder probarlo con un doble en memoria. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * Momento en que el usuario rechazó la instalación, o `null` si nunca lo hizo
 * (o si el valor guardado no es un timestamp válido).
 */
export function readDismissedAt(storage: StorageLike | undefined = safeStorage()): number | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(INSTALL_DISMISSED_KEY)
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    // localStorage puede estar bloqueado (modo privado, cookies deactivated).
    return null
  }
}

export function writeDismissedAt(timestamp: number, storage: StorageLike | undefined = safeStorage()): void {
  if (!storage) return
  try {
    storage.setItem(INSTALL_DISMISSED_KEY, String(timestamp))
  } catch {
    // Sin almacenamiento disponible el aviso simplemente se vuelve a offerer.
  }
}

export function clearDismissedAt(storage: StorageLike | undefined = safeStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(INSTALL_DISMISSED_KEY)
  } catch {
    // Ver writeDismissedAt.
  }
}

/**
 * ¿Estamos dentro del período de espera?
 *
 * `now` es inyectable para que el vencimiento del cooldown se pueda probar
 * sin esperar siete días.
 */
export function isWithinCooldown(
  now: number = Date.now(),
  storage: StorageLike | undefined = safeStorage(),
): boolean {
  const dismissedAt = readDismissedAt(storage)
  if (dismissedAt === null) return false
  return now - dismissedAt < INSTALL_PROMPT_COOLDOWN_MS
}

/** Registra el rechazo de ahora y devuelve el timestamp guardado. */
export function rememberDismissal(now: number = Date.now(), storage: StorageLike | undefined = safeStorage()): number {
  writeDismissedAt(now, storage)
  return now
}

/** localStorage del navegador, o `undefined` si no existe o está bloqueado. */
function safeStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
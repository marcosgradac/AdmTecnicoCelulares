/**
 * Tokens visuales sin dependencias. Vive aparte de `theme.ts` a propósito: al no
 * tener imports no puede entrar en un ciclo con los componentes que lo consumen,
 * que es lo que rompe los imports en runtime.
 */
export const TABLE_BORDER = '#EEF0F5'

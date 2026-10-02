/**
 * Tokens visuales sin dependencias. Vive aparte de `theme.ts` a propósito: al no
 * tener imports no puede entrar en un ciclo con los componentes que lo consumen,
 * que es lo que rompe los imports en runtime.
 */
export const TABLE_BORDER = '#EEF0F5'

/**
 * Degradé de títulos TecnoDesk: oscuro → violeta → azul.
 *
 * Referencia visual: #171A23 → #4327B7 → #5B3FD6 → #2F9BFF.
 *
 * Se aplica SOLO a títulos (h1/h2/h3 reales) para marcar jerarquía, nunca a
 * body, captions, botones, chips o tablas: un degradé repetido en todo el
 * sistema deja de señalar nada.
 *
 * Fallback: `color` pinta violeta en motores sin `background-clip: text`, y
 * `WebkitTextFillColor: transparent` solo tiene efecto donde el clip funciona.
 * Si el clip se aplica pero el degradado no llega a cubrir el glifo, el texto
 * queda invisible: por eso `width: fit-content` mantiene la caja ajustada al
 * contenido en lugar de estirar el fondo más allá de las letras.
 */
export const GRADIENT_TEXT_SX = {
  background: 'linear-gradient(90deg, #171A23 0%, #4327B7 38%, #5B3FD6 62%, #2F9BFF 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: '#5B3FD6',
  width: 'fit-content',
}

import { Children, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Box, IconButton, Stack } from '@mui/material'
import { ChevronLeftRounded, ChevronRightRounded } from '@mui/icons-material'

interface Props {
  /** Ancho de card esperado. Solo se usa como valor inicial hasta medir la card real. */
  cardWidth: number
  label: string
  children: ReactNode
  /** Separación entre cards; se usa como fallback si no se puede leer el `gap` real. */
  gap?: number
}

/** Tolerancia en px para detectar que el scroll ya entró en la zona de clones. */
const ZONE_EPSILON = 1.5

/**
 * Carrusel horizontal circular, una card por pulsación.
 *
 * Bucle real, sin fade ni salto visible:
 * - Se renderiza `[clones izq] [cards reales] [clones der]`. Los clones son el mismo
 *   elemento React marcado `inert` + `aria-hidden`: no reciben foco, no son clickeables,
 *   no aparecen en el árbol de accesibilidad y no duplican el menú ⋮. Existen solo como
 *   continuidad visual para poder pasar de la última a la primera sin recargar.
 * - Cuando el scroll entra en una zona de clones se reposiciona en silencio a la card
 *   real equivalente. El contenido en esos offsets es idéntico, así que el salto no se
 *   ve: el píxel que se mueve es el mismo que ya se estaba mirando.
 * - Cada pulsación avanza EXACTAMENTE una card: se trabaja con un índice, nunca con
 *   páginas completas.
 *
 * Cards siempre completas: sin degradados que las tapen, `scroll-snap-align: start` en
 * cada card y `scroll-snap-type: x mandatory`, así el scroll siempre cae en un borde de
 * card y nunca a mitad de camino.
 */
export function CardCarousel({ cardWidth, label, children, gap = 16 }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Array<HTMLDivElement | null>>([])
  const [count, setCount] = useState(0)
  const [step, setStep] = useState(cardWidth + gap)
  const [clones, setClones] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  // Último offset ya normalizado, para no entrar en un bucle de reposicionado.
  const lastNormalized = useRef<number | null>(null)

  const items = Children.toArray(children)

  /**
   * Mide el paso real (card + gap) y cuántas cards entran completas.
   * Se lee del DOM en lugar de confiar en el ancho declarado.
   */
  const measure = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const first = itemRefs.current[0]
    if (!first) return

    const style = window.getComputedStyle(track)
    const measuredGap = Number.parseFloat(style.columnGap || style.gap)
    const realGap = Number.isFinite(measuredGap) ? measuredGap : gap
    const cardSize = first.getBoundingClientRect().width
    const nextStep = (cardSize > 0 ? cardSize : cardWidth) + realGap

    setStep(nextStep)
    // Clones por lado: alcanzan para cubrir un swipe entero en cualquier viewport.
    setClones(Math.max(1, Math.min(Math.floor((track.clientWidth + realGap) / nextStep), Children.count(children))))
  }, [cardWidth, gap, children])

  /**
   * Reposiciona en silencio cuando el scroll cae en una zona de clones.
   * El contenido a ambos lados es idéntico, así que no hay salto perceptible.
   */
  const normalizeZone = useCallback((left: number) => {
    const cycle = count * step
    if (cycle <= 0) return null
    if (lastNormalized.current === left) return null

    const minReal = clones * step
    const maxReal = (clones + count - 1) * step
    if (left > maxReal + ZONE_EPSILON) return left - cycle
    if (left < minReal - ZONE_EPSILON) return left + cycle
    return null
  }, [count, step, clones])

  const applyScroll = useCallback((left: number, behavior: ScrollBehavior) => {
    const track = trackRef.current
    if (!track) return
    // El snap se apaga durante el salto silencioso para que el navegador no lo revierta.
    track.style.scrollSnapType = 'none'
    track.scrollTo({ left, behavior })
    requestAnimationFrame(() => { track.style.scrollSnapType = '' })
  }, [])

  const handleScroll = useCallback(() => {
    const track = trackRef.current
    if (!track || step <= 0 || count === 0) return
    const left = track.scrollLeft
    const snapped = normalizeZone(left)
    if (snapped !== null) {
      lastNormalized.current = snapped
      applyScroll(snapped, 'auto')
      return
    }
    // Índice lógico de la card visible, ya normalizado al rango real.
    const position = Math.round(left / step)
    setActiveIndex((((position - clones) % count) + count) % count)
  }, [applyScroll, normalizeZone, step, clones, count])

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    for (const node of itemRefs.current) if (node) observer.observe(node)
    return () => observer.disconnect()
  }, [measure])

  /**
   * Posiciona el track sobre la primera card real. Sin esto arrancaría en `scrollLeft: 0`,
   * que es donde viven los clones de cola, y se vería la última categoría en vez de la primera.
   * Se corre en cuanto se conocen `clones` y `step`, y se repite al cambiar el ancho.
   */
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track || count === 0 || clones === 0 || step <= 0) return
    const target = clones * step
    if (Math.abs(track.scrollLeft - target) > 1) {
      lastNormalized.current = target
      applyScroll(target, 'auto')
    }
    setActiveIndex(0)
  }, [applyScroll, count, clones, step])

  // Al cambiar la cantidad de items se recalcula el ciclo y se vuelve al inicio.
  useEffect(() => {
    const track = trackRef.current
    setCount(items.length)
    lastNormalized.current = null
    if (!track || items.length === 0) return
    track.scrollTo({ left: 0, behavior: 'auto' })
    setActiveIndex(0)
  }, [items.length])

  useEffect(() => () => { lastNormalized.current = null }, [])

  const canScroll = count > 1 && clones > 0

  /**
   * Avanza o retrocede EXACTAMENTE una card, con loop circular.
   *
   * Al envolver no saltamos: nos movemos hacia el lado del clon que ya está pintado
   * en pantalla (una sola card más allá) y dejamos que `handleScroll` nos reancle a la
   * card real equivalente. Así la última → primera avanza hacia la derecha, y la
   * primera → última retrocede hacia la izquierda, sin recorrer el track entero.
   */
  const move = (direction: -1 | 1) => {
    const track = trackRef.current
    if (!track || !canScroll) return
    const nextIndex = (activeIndex + direction + count) % count
    setActiveIndex(nextIndex)

    // Posición de la card real destino.
    const realTarget = (clones + nextIndex) * step
    // Si hay que dar la vuelta, pasamos primero por el clon contiguo de ese lado.
    const wrapsForward = direction === 1 && nextIndex === 0 && activeIndex === count - 1
    const wrapsBack = direction === -1 && nextIndex === count - 1 && activeIndex === 0
    const throughClone = wrapsForward ? realTarget + count * step : wrapsBack ? realTarget - count * step : realTarget

    applyScroll(throughClone, 'smooth')
  }

  const arrowSx = {
    flexShrink: 0,
    border: 1,
    borderColor: 'divider',
    bgcolor: 'background.paper',
    transition: 'border-color .18s ease, background-color .18s ease',
    '&:hover': { bgcolor: 'background.paper', borderColor: 'primary.main' },
  } as const

  /** Card real, con su ref para poder medirla. */
  const realCards = items.map((item, index) => (
    <Box
      key={`real-${index}`}
      ref={(node: HTMLDivElement | null) => { itemRefs.current[index] = node }}
      sx={{ flex: '0 0 auto', scrollSnapAlign: 'start', display: 'flex' }}
    >
      {item}
    </Box>
  ))

  /**
   * Clones de continuidad. Van `inert` + `aria-hidden`: no son focusables, no reciben
   * clicks y no se anuncian, así que no duplican eventos ni el menú ⋮. Cada clon
   * referencia la card real por índice, sin IDs propios.
   */
  const cloneCards = (from: number[], suffix: string) => from.map(index => (
    <Box
      key={`clone-${suffix}-${index}`}
      inert
      aria-hidden
      sx={{ flex: '0 0 auto', scrollSnapAlign: 'start', display: 'flex', userSelect: 'none' }}
    >
      {items[index]}
    </Box>
  ))

  // Últimas `clones` cards arriba y primeras `clones` abajo, para cerrar el círculo.
  const tailIndexes = Array.from({ length: clones }, (_, i) => (count - clones + i) % count).filter(i => i >= 0)
  const headIndexes = Array.from({ length: clones }, (_, i) => i % Math.max(count, 1))

  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
      {canScroll && (
        <IconButton
          aria-label={`Ver la categoría anterior de ${label}`}
          onClick={() => move(-1)}
          sx={{ ...arrowSx, display: { xs: 'none', md: 'inline-flex' } }}
        >
          <ChevronLeftRounded />
        </IconButton>
      )}
      <Box
        ref={trackRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          gap: `${gap}px`,
          py: 0.5,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          overscrollBehaviorX: 'contain',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {canScroll && cloneCards(tailIndexes, 'tail')}
        {realCards}
        {canScroll && cloneCards(headIndexes, 'head')}
      </Box>
      {canScroll && (
        <IconButton
          aria-label={`Ver la categoría siguiente de ${label}`}
          onClick={() => move(1)}
          sx={{ ...arrowSx, display: { xs: 'none', md: 'inline-flex' } }}
        >
          <ChevronRightRounded />
        </IconButton>
      )}
    </Stack>
  )
}
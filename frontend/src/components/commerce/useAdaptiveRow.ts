import { useEffect, useRef, useState } from 'react'

interface Options {
  /** Ancho mínimo cómodo de una card. Si el contenedor no entra a alojar dos, conviene el carrusel. */
  minCardWidth: number
  /** Desde esta cantidad de items el carrusel es siempre la mejor lectura. */
  carouselFrom?: number
  /** Cuántas cards deben entrar cómodas para quedarse en grid. Por defecto, dos. */
  columns?: number
}

/**
 * Decide si una fila de cards va en grid o en carrusel horizontal.
 * Pasa a carrusel cuando hay suficientes items o cuando el ancho disponible
 * ya no alcanza para las cards cómodas (por ejemplo en mobile angosto),
 * evitando que las cards se interponen, se corten o bajen de forma irregular.
 */
export function useAdaptiveRow(itemCount: number, { minCardWidth, carouselFrom = 5, columns = 2 }: Options) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const measure = () => setContainerWidth(node.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const useCarousel = itemCount >= carouselFrom || (containerWidth > 0 && containerWidth < minCardWidth * columns)
  return { containerRef, containerWidth, useCarousel }
}

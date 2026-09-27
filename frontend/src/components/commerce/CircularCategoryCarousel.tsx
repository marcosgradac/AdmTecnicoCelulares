import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Box, Card, CardContent, IconButton, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { keyframes } from '@emotion/react'
import {
  ChevronLeftRounded, ChevronRightRounded, DeleteOutlineRounded,
  EditRounded, Inventory2Rounded,
} from '@mui/icons-material'
import type { CommerceCategory } from '../../services/commerce'
import { RowActionsMenu } from '../common/RowActionsMenu'
import { categoryIcon } from './categoryIcons'

interface Props {
  categories: CommerceCategory[]
  canManage: boolean
  onSelectCategory: (category: CommerceCategory) => void
  onEditCategory: (category: CommerceCategory) => void
  onDeleteCategory: (category: CommerceCategory) => void
}

/** Ancho de referencia de una card: define cuántas entran completas en el viewport. */
const CARD_WIDTH = 216
const GAP = 16
/** Desplazamiento horizontal mínimo (px) para tomar un gesto como swipe. */
const SWIPE_THRESHOLD = 48

/**
 * Espacio vertical reservado para el hover.
 * El viewport recorta con `overflow: hidden`, así que la sombra y el `translateY` del
 * hover necesitan aire. El padding se compensa con un margin negativo para que la
 * fila conserve exactamente la misma altura y el layout no se mueva al hacer hover.
 * SOLO vertical: agregar padding horizontal reduciría el ancho útil y cambiaría
 * `visibleCount`, que acá no se toca.
 */
const HOVER_SPACE_TOP = 8
const HOVER_SPACE_BOTTOM = 28

// El desplazamiento horizontal del entrance se mantiene dentro del ancho de la card
// (12px < la mitad de cualquier card) para no depender de padding lateral.
const enterFromRight = keyframes`
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: translateX(0); }
`
const enterFromLeft = keyframes`
  from { opacity: 0; transform: translateX(-12px); }
  to   { opacity: 1; transform: translateX(0); }
`

/**
 * Carrusel CIRCULAR por índice.
 *
 * No hay scroll horizontal: el scroll nativo queda completamente afuera. La fuente de
 * verdad es `startIndex`, y las cards visibles se arman por módulo. Cada flecha mueve
 * EXACTAMENTE una categoría y el ciclo no tiene fin: nunca hay un "final muerto" ni una
 * flecha deshabilitada.
 *
 * Solo se renderizan cards COMPLETAS: el viewport es un grid de `visibleCount` columnas
 * `minmax(0, 1fr)`, sin overflow, sin clones y sin degradados que tapen contenido.
 */
export function CircularCategoryCarousel({ categories, canManage, onSelectCategory, onEditCategory, onDeleteCategory }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  const [startIndex, setStartIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)

  const total = categories.length

  // Cuántas cards COMPLETAS entran en el ancho disponible. Nunca menos de 1,
  // nunca más que la cantidad de categorías existentes.
  const visibleCount = total === 0
    ? 0
    : Math.max(1, Math.min(total, Math.floor((availableWidth + GAP) / (CARD_WIDTH + GAP))))

  const isCircular = total > visibleCount

  useLayoutEffect(() => {
    const node = viewportRef.current
    if (!node) return
    const measure = () => setAvailableWidth(node.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Si cambia el conjunto, el índice se mantiene dentro del rango válido.
  useEffect(() => {
    setStartIndex(current => (total === 0 ? 0 : current % total))
  }, [total])

  const next = useCallback(() => {
    if (total === 0) return
    setDirection(1)
    setStartIndex(index => (index + 1) % total)
  }, [total])

  const previous = useCallback(() => {
    if (total === 0) return
    setDirection(-1)
    setStartIndex(index => (index - 1 + total) % total)
  }, [total])

  /** Gesto horizontal simple: no usa scroll nativo, solo pointer events. */
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isCircular) return
    pointerStart.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = pointerStart.current
    pointerStart.current = null
    if (!origin || !isCircular) return
    const deltaX = event.clientX - origin.x
    const deltaY = event.clientY - origin.y
    // Solo cuenta como swipe si es claramente horizontal.
    if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) <= Math.abs(deltaY)) return
    if (deltaX < 0) next(); else previous()
  }

  // Orden circular: se leen `visibleCount` items a partir de `startIndex`, dando la vuelta con módulo.
  const visibleCategories = Array.from(
    { length: visibleCount },
    (_, offset) => categories[(startIndex + offset) % total],
  ).filter((category): category is CommerceCategory => Boolean(category))

  const card = (category: CommerceCategory) => {
    const Icon = categoryIcon(category.iconKey)
    return (
      <Card
        key={category.id}
        variant="outlined"
        onClick={() => onSelectCategory(category)}
        sx={{
          width: '100%',
          minWidth: 0,
          height: '100%',
          cursor: 'pointer',
          borderRadius: 2,
          transition: 'border-color .18s ease, box-shadow .18s ease, transform .18s ease',
          '&:hover': {
            borderColor: 'primary.main',
            boxShadow: theme => `0 6px 18px ${alpha(theme.palette.primary.main, 0.12)}`,
            transform: 'translateY(-2px)',
          },
        }}
      >
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, height: '100%' }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
            <Box sx={{ width: 38, height: 38, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, bgcolor: theme => alpha(theme.palette.primary.main, 0.1), color: 'primary.main' }}>
              <Icon sx={{ fontSize: 20 }} />
            </Box>
            {canManage && (
              // stopPropagation: abrir el menú ⋮ NO debe abrir la categoría.
              <Box onClick={event => event.stopPropagation()} sx={{ flexShrink: 0, mr: -0.75, mt: -0.75, opacity: { xs: 1, md: 0.55 }, transition: 'opacity .15s ease', '&:hover, &:focus-within': { opacity: 1 } }}>
                <RowActionsMenu label={`Acciones de categoría ${category.name}`} actions={[
                  { label: 'Editar nombre', icon: <EditRounded />, onClick: () => onEditCategory(category) },
                  { label: 'Eliminar', icon: <DeleteOutlineRounded />, destructive: true, onClick: () => onDeleteCategory(category) },
                ]} />
              </Box>
            )}
          </Stack>
          <Box sx={{ mt: 1.5, minWidth: 0 }}>
            <Typography fontWeight={750} title={category.name} sx={{ fontSize: '.95rem', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{category.name}</Typography>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25, color: 'text.secondary' }}>
              <Inventory2Rounded sx={{ fontSize: 14 }} />
              <Typography variant="caption">{category.productCount} {category.productCount === 1 ? 'producto activo' : 'productos activos'}</Typography>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    )
  }

  return (
    <Stack direction="row" alignItems="stretch" spacing={1} sx={{ minWidth: 0 }}>
      {isCircular && (
        <IconButton
          aria-label={`Ver la categoría anterior`}
          onClick={previous}
          sx={{
            alignSelf: 'center',
            flexShrink: 0,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            transition: 'border-color .18s ease, background-color .18s ease',
            '&:hover': { bgcolor: 'background.paper', borderColor: 'primary.main' },
          }}
        >
          <ChevronLeftRounded />
        </IconButton>
      )}

      <Box
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerStart.current = null }}
        sx={{
          flex: 1,
          minWidth: 0,
          // Recorte solo para que nada desborde en horizontal; en vertical hay aire
          // reservado para que la sombra y el `translateY` del hover no se corten.
          overflow: 'hidden',
          paddingTop: `${HOVER_SPACE_TOP}px`,
          paddingBottom: `${HOVER_SPACE_BOTTOM}px`,
          // Compensa el padding: la fila mantiene exactamente la misma altura.
          marginTop: `${-HOVER_SPACE_TOP}px`,
          marginBottom: `${-HOVER_SPACE_BOTTOM}px`,
          // El gesto vertical sigue haciendo scroll de página; el horizontal lo manejamos nosotros.
          touchAction: 'pan-y',
          userSelect: 'none',
        }}
      >
        <Box
          key={startIndex}
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(visibleCount, 1)}, minmax(0, 1fr))`,
            gap: `${GAP}px`,
            animation: `${(direction === 1 ? enterFromRight : enterFromLeft)} 220ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
          }}
        >
          {visibleCategories.map(card)}
        </Box>
      </Box>

      {isCircular && (
        <IconButton
          aria-label={`Ver la categoría siguiente`}
          onClick={next}
          sx={{
            alignSelf: 'center',
            flexShrink: 0,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            transition: 'border-color .18s ease, background-color .18s ease',
            '&:hover': { bgcolor: 'background.paper', borderColor: 'primary.main' },
          }}
        >
          <ChevronRightRounded />
        </IconButton>
      )}
    </Stack>
  )
}
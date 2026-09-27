import { Box, Card, CardContent, Stack, Typography } from '@mui/material'
import {
  AccountBalanceWalletRounded, PaidRounded, PriceChangeRounded,
  ReceiptLongRounded, TrendingUpRounded,
} from '@mui/icons-material'
import type { SvgIconComponent } from '@mui/icons-material'
import { CardCarousel } from './CardCarousel'
import { useAdaptiveRow } from './useAdaptiveRow'

export interface CommerceMetric {
  label: string
  value: string
  tone: 'primary' | 'success' | 'strongSuccess' | 'warning' | 'expense'
  icon: SvgIconComponent
}

interface Props {
  metrics: CommerceMetric[]
}

const CARD_WIDTH = 200
const GAP = 1.5
/** Ancho mínimo por card para que label y valor se lean sin truncarse. */
const MIN_CARD_WIDTH = 176

// Mismos tonos semánticos que StatCard (primary / success / warning), ampliados para el comercio.
const tones = {
  primary: { color: '#5B3FD6', background: '#EEE9FF' },
  success: { color: '#1F8E55', background: '#E9F8F0' },
  strongSuccess: { color: '#14713F', background: '#DCF3E6' },
  warning: { color: '#B26A00', background: '#FFF3DC' },
  expense: { color: '#C0463C', background: '#FDECEA' },
} as const

function MetricCard({ metric, width }: { metric: CommerceMetric; width: number | string }) {
  const { color, background } = tones[metric.tone]
  const Icon = metric.icon
  const solid = metric.tone === 'strongSuccess'
  return (
    <Card sx={{ width, minWidth: 0, height: '100%', scrollSnapAlign: 'start', ...(width !== '100%' && { flex: '0 0 auto' }) }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" alignItems="center" gap={1} mb={1.25} sx={{ minWidth: 0 }}>
          <Box sx={{ width: 30, height: 30, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 2, color, bgcolor: background, '& svg': { fontSize: 17 } }}><Icon /></Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600} lineHeight={1.35} noWrap title={metric.label}>{metric.label}</Typography>
        </Stack>
        <Typography sx={{ fontSize: '1.45rem', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-.035em', fontVariantNumeric: 'tabular-nums', color: solid ? color : 'text.primary', overflowWrap: 'anywhere' }}>{metric.value}</Typography>
      </CardContent>
    </Card>
  )
}

/**
 * Fila de métricas de Comercio: las cinco conviven en una sola fila cuando el ancho alcanza
 * y, si no entran cómodas, se convierten en carrusel horizontal. Nunca envuelven a una segunda fila.
 */
export function CommerceMetricsRow({ metrics }: Props) {
  // Se exige el ancho de las cinco cards para mantener la fila; en cualquier otro caso, carrusel.
  const { containerRef, useCarousel } = useAdaptiveRow(metrics.length, { minCardWidth: MIN_CARD_WIDTH, carouselFrom: Number.POSITIVE_INFINITY, columns: metrics.length })

  return (
    <Box ref={containerRef} sx={{ minWidth: 0, mb: 3 }}>
      {useCarousel ? (
        <CardCarousel cardWidth={CARD_WIDTH} label="métricas">
          {metrics.map(metric => <MetricCard key={metric.label} metric={metric} width={CARD_WIDTH} />)}
        </CardCarousel>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))`, gap: GAP }}>
          {metrics.map(metric => <MetricCard key={metric.label} metric={metric} width="100%" />)}
        </Box>
      )}
    </Box>
  )
}

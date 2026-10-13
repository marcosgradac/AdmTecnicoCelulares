import { FINANCIAL_COLORS } from '../../theme/tokens'
import type { ReactNode } from 'react'
import { Box, Card, CardContent, Stack, Typography } from '@mui/material'
import { useAdminVisual } from '../admin/AdminVisualScope'

export function StatCard({ label, value, icon, helper, tone = 'primary', valueColor }: { label: string; value: string; icon: ReactNode; helper?: string; tone?: 'primary' | 'info' | 'success' | 'warning' | 'error'; valueColor?: 'success.main' | 'error.main' | 'text.primary' }) {
  const tones = { error: ['var(--td-error, #D32F2F)', 'var(--td-error-soft, #FDECEC)'], primary: ['var(--td-primary, #5B3FD6)', 'var(--td-primary-soft, #EEE9FF)'], info: ['var(--td-accent, #2F9BFF)', 'var(--td-info-soft, #EAF5FF)'], success: ['var(--td-success, #28B76B)', 'var(--td-success-soft, #E9F8F0)'], warning: ['var(--td-warning, #D48700)', 'var(--td-warning-soft, #FFF5DF)'] }
  const [color, background] = tones[tone]
  const financialColor = valueColor === 'success.main' ? FINANCIAL_COLORS.income : valueColor === 'error.main' ? FINANCIAL_COLORS.expense : valueColor
  const modern = useAdminVisual()
  if (modern) return <Card sx={{ height: '100%' }}><CardContent sx={{ p: { xs: 1.75, sm: 2.25 }, '&:last-child': { pb: { xs: 1.75, sm: 2.25 } } }}>
    <Stack direction="row" alignItems="center" gap={1} mb={1.5}><Box sx={{ display: 'grid', placeItems: 'center', width: 30, height: 30, flexShrink: 0, borderRadius: 2, color, bgcolor: background, '& svg': { fontSize: 18 } }}>{icon}</Box><Typography variant="caption" color="text.secondary" fontWeight={650} lineHeight={1.35}>{label}</Typography></Stack>
    <Typography fontSize={{ xs: 20, sm: 26 }} fontWeight={800} color={financialColor} lineHeight={1.2} sx={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-.04em', overflowWrap: 'anywhere' }}>{value}</Typography>{helper && <Typography variant="caption" color="text.secondary" display="block" mt={.75}>{helper}</Typography>}
  </CardContent></Card>
  return (
    <Card sx={{ height: '100%' }}><CardContent>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box><Typography variant="body2" color="text.secondary" fontWeight={600}>{label}</Typography><Typography fontSize={{ xs: 24, lg: 28 }} fontWeight={800} color={financialColor} mt={0.7}>{value}</Typography>{helper && <Typography variant="caption" color="text.secondary">{helper}</Typography>}</Box>
        <Box width={44} height={44} borderRadius={3} display="grid" sx={{ placeItems: 'center', color, bgcolor: background }}>{icon}</Box>
      </Stack>
    </CardContent></Card>
  )
}

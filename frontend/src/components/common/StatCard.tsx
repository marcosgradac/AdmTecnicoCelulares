import type { ReactNode } from 'react'
import { Box, Card, CardContent, Stack, Typography } from '@mui/material'

export function StatCard({ label, value, icon, helper, tone = 'primary' }: { label: string; value: string; icon: ReactNode; helper?: string; tone?: 'primary' | 'info' | 'success' | 'warning' }) {
  const tones = { primary: ['#5B3FD6', '#EEE9FF'], info: ['#2F9BFF', '#EAF5FF'], success: ['#28B76B', '#E9F8F0'], warning: ['#D48700', '#FFF5DF'] }
  const [color, background] = tones[tone]
  return (
    <Card sx={{ height: '100%' }}><CardContent>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box><Typography variant="body2" color="text.secondary" fontWeight={600}>{label}</Typography><Typography fontSize={{ xs: 24, lg: 28 }} fontWeight={800} mt={0.7}>{value}</Typography>{helper && <Typography variant="caption" color="text.secondary">{helper}</Typography>}</Box>
        <Box width={44} height={44} borderRadius={3} display="grid" sx={{ placeItems: 'center', color, bgcolor: background }}>{icon}</Box>
      </Stack>
    </CardContent></Card>
  )
}

import type { ReactNode } from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { InboxRounded, RefreshRounded } from '@mui/icons-material'
import { useAdminVisual } from '../admin/AdminVisualScope'

export function UiState({ title = 'Todavía no hay información', description = 'Cuando haya datos, los vas a ver acá.', loading, action, actionLabel = 'Reintentar', icon }: { title?: string; description?: string; loading?: boolean; action?: () => void; actionLabel?: string; icon?: ReactNode }) {
  const modern = useAdminVisual()
  return (
    <Box role="status" aria-live="polite" textAlign="center" py={6} px={2} sx={modern ? { borderRadius: 3, bgcolor: '#FAFBFE', '& > .MuiSvgIcon-root': { color: 'primary.main', bgcolor: '#EEE9FF', p: 1.5, width: 64, height: 64, borderRadius: '50%' }, '& > .MuiTypography-root': { maxWidth: 460, mx: 'auto' } } : undefined}>
      {loading ? <CircularProgress size={30} /> : icon ?? <InboxRounded sx={{ fontSize: 40, color: 'text.disabled' }} />}
      <Typography variant="h6" mt={1.5}>{loading ? 'Cargando información…' : title}</Typography>
      {!loading && <Typography color="text.secondary" mt={0.5}>{description}</Typography>}
      {action && <Button variant={modern ? 'outlined' : 'text'} startIcon={!modern || actionLabel.startsWith('Reintentar') ? <RefreshRounded /> : undefined} onClick={action} sx={{ mt: 2 }}>{actionLabel}</Button>}
    </Box>
  )
}

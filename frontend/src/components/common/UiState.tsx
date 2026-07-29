import type { ReactNode } from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { InboxRounded, RefreshRounded } from '@mui/icons-material'

export function UiState({ title = 'Todavía no hay información', description = 'Cuando haya datos, los vas a ver acá.', loading, action, icon }: { title?: string; description?: string; loading?: boolean; action?: () => void; icon?: ReactNode }) {
  return (
    <Box role="status" textAlign="center" py={6} px={2}>
      {loading ? <CircularProgress size={30} /> : icon ?? <InboxRounded sx={{ fontSize: 40, color: 'text.disabled' }} />}
      <Typography variant="h6" mt={1.5}>{loading ? 'Cargando información…' : title}</Typography>
      {!loading && <Typography color="text.secondary" mt={0.5}>{description}</Typography>}
      {action && <Button startIcon={<RefreshRounded />} onClick={action} sx={{ mt: 2 }}>Reintentar</Button>}
    </Box>
  )
}

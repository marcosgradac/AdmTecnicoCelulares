import type { ReactNode } from 'react'
import { Box, Button, Divider, Drawer, IconButton, Stack, Typography } from '@mui/material'
import { CloseRounded } from '@mui/icons-material'
import { useAdminVisual } from '../admin/AdminVisualScope'

/** `eyebrow` y `context` se mantienen en la API por compatibilidad con los callers, pero ya no se renderizan. */
export function FormDrawer({ open, title, children, saving, submitLabel, submitDisabled, onClose, onSubmit }: { open: boolean; eyebrow?: string; context?: string; title: string; children: ReactNode; saving?: boolean; submitLabel: string; submitDisabled?: boolean; onClose: () => void; onSubmit: () => void }) {
  const modern = useAdminVisual()
  return <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 520, md: 580 }, maxWidth: '100vw' } }}>
    <Box display="flex" flexDirection="column" height="100%" minWidth={0}>
      <Stack direction="row" alignItems="center" gap={1} px={{ xs: 2, sm: 3 }} py={{ xs: 1.75, sm: 2 }} sx={{ bgcolor: 'background.paper', flexShrink: 0 }}><Typography variant="h1" color="primary.main" fontSize={modern ? { xs: 21, sm: 24 } : { xs: 24, sm: 28 }} sx={{ flex: 1, minWidth: 0, letterSpacing: '-0.025em', overflowWrap: 'anywhere' }}>{title}</Typography><IconButton aria-label="Cerrar" onClick={onClose} sx={{ flexShrink: 0 }}><CloseRounded/></IconButton></Stack>
      <Divider/><Stack spacing={2.2} px={{ xs: 2, sm: 3 }} py={2.5} sx={{ overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0, ...(modern && { bgcolor: '#F7F8FC', '& > .MuiTypography-h2': { fontSize: '1rem', color: 'text.primary' } }) }}>{children}</Stack>
      <Divider/><Stack direction="row" justifyContent="flex-end" spacing={1.5} px={{ xs: 2, sm: 3 }} py={2} sx={{ bgcolor: 'background.paper', flexShrink: 0, pb: 'max(16px, env(safe-area-inset-bottom))', '& > button': { flex: { xs: 1, sm: 'initial' } } }}><Button onClick={onClose} disabled={saving}>Cancelar</Button><Button variant="contained" disabled={saving || submitDisabled} onClick={onSubmit}>{saving ? 'Guardando…' : submitLabel}</Button></Stack>
    </Box>
  </Drawer>
}

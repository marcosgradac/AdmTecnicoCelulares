import type { ReactNode } from 'react'
import { Box, Button, Divider, Drawer, IconButton, Stack, Typography } from '@mui/material'
import { CloseRounded } from '@mui/icons-material'
import { useAdminVisual } from '../admin/AdminVisualScope'

export function FormDrawer({ open, context, eyebrow, title, children, saving, submitLabel, submitDisabled, onClose, onSubmit }: { open: boolean; eyebrow?: string; context?: string; title: string; children: ReactNode; saving?: boolean; submitLabel: string; submitDisabled?: boolean; onClose: () => void; onSubmit: () => void }) {
  const modern = useAdminVisual()
  return <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 520, md: 580 }, maxWidth: '100vw' } }}>
    <Box display="flex" flexDirection="column" height="100%" minWidth={0}>
      <Stack direction="row" alignItems="center" px={{ xs: 2, sm: 3 }} py={2}><Box flex={1} minWidth={0}>{(context || modern && eyebrow) && <Typography variant="overline" color="primary.main">{context || eyebrow}</Typography>}<Typography variant="h1" fontSize={modern ? 24 : 28} color={modern ? 'text.primary' : 'primary.main'}>{title}</Typography></Box><IconButton aria-label="Cerrar" onClick={onClose}><CloseRounded/></IconButton></Stack>
      <Divider/><Stack spacing={2.2} px={{ xs: 2, sm: 3 }} py={2.5} sx={{ overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0, ...(modern && { bgcolor: '#F7F8FC', '& > .MuiTypography-h2': { fontSize: '1rem', color: 'text.primary' } }) }}>{children}</Stack>
      <Divider/><Stack direction="row" justifyContent="flex-end" spacing={1.5} px={{ xs: 2, sm: 3 }} py={2} sx={modern ? { pb: 'max(16px, env(safe-area-inset-bottom))', '& > button': { flex: { xs: 1, sm: 'initial' } } } : undefined}><Button onClick={onClose} disabled={saving}>Cancelar</Button><Button variant="contained" disabled={saving || submitDisabled} onClick={onSubmit}>{saving ? 'Guardando…' : submitLabel}</Button></Stack>
    </Box>
  </Drawer>
}

import type { ReactNode } from 'react'
import { Box, Button, Divider, Drawer, IconButton, Stack, Typography } from '@mui/material'
import { CloseRounded } from '@mui/icons-material'

export function FormDrawer({ open, eyebrow, title, children, saving, submitLabel, submitDisabled, onClose, onSubmit }: { open: boolean; eyebrow: string; title: string; children: ReactNode; saving?: boolean; submitLabel: string; submitDisabled?: boolean; onClose: () => void; onSubmit: () => void }) {
  return <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 520, md: 580 }, maxWidth: '100vw' } }}>
    <Box display="flex" flexDirection="column" height="100%" minWidth={0}>
      <Stack direction="row" alignItems="center" px={{ xs: 2, sm: 3 }} py={2}><Box flex={1}><Typography variant="overline" color="primary.main">{eyebrow}</Typography><Typography variant="h1" fontSize={28}>{title}</Typography></Box><IconButton aria-label="Cerrar" onClick={onClose}><CloseRounded/></IconButton></Stack>
      <Divider/><Stack spacing={2.2} px={{ xs: 2, sm: 3 }} py={2.5} sx={{ overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>{children}</Stack>
      <Divider/><Stack direction="row" justifyContent="flex-end" spacing={1.5} px={{ xs: 2, sm: 3 }} py={2}><Button onClick={onClose} disabled={saving}>Cancelar</Button><Button variant="contained" disabled={saving || submitDisabled} onClick={onSubmit}>{saving ? 'Guardando…' : submitLabel}</Button></Stack>
    </Box>
  </Drawer>
}

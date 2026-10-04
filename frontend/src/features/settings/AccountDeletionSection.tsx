import { useState } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded'
import { useAuth } from '../../auth/AuthContext'
import { GRADIENT_TEXT_SX } from '../../theme/tokens'
import { AccountDeletionDialog, accountDeletionDescription } from './AccountDeletionDialog'

export function AccountDeletionSection() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  if (user?.role !== 'OWNER' || user.platformRole === 'SUPER_ADMIN') return null
  return <Box sx={theme => ({
    border: '1px solid',
    borderColor: alpha(theme.palette.error.main, 0.16),
    backgroundColor: alpha(theme.palette.error.main, 0.025),
    borderRadius: 2,
    p: { xs: 2, sm: 3 },
    minWidth: 0,
  })}>
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="overline" color="error.main" sx={{ fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.08em', lineHeight: 1.5 }}>Zona de peligro</Typography>
        <Typography variant="h6" component="h3" sx={{ ...GRADIENT_TEXT_SX, mt: 0.75, fontWeight: 800, lineHeight: 1.35, maxWidth: '100%' }}>Eliminar mi cuenta y negocio</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25, lineHeight: 1.75, maxWidth: '65ch' }}>{accountDeletionDescription}</Typography>
      </Box>
      <Button color="error" variant="contained" disableElevation startIcon={<DeleteOutlineRounded />} sx={{
        alignSelf: { xs: 'stretch', sm: 'flex-start' },
        width: { xs: '100%', sm: 'auto' },
        minHeight: 44,
        px: 2.5,
        py: 1.25,
        borderRadius: 2,
        fontWeight: 700,
        lineHeight: 1.5,
        textAlign: 'center',
      }} onClick={() => setOpen(true)}>Eliminar mi cuenta y negocio</Button>
    </Stack>
    <AccountDeletionDialog open={open} onClose={() => setOpen(false)} />
  </Box>
}

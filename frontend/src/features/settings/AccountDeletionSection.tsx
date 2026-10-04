import { useState } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import { useAuth } from '../../auth/AuthContext'
import { AccountDeletionDialog, accountDeletionDescription } from './AccountDeletionDialog'

export function AccountDeletionSection() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  if (user?.role !== 'OWNER' || user.platformRole === 'SUPER_ADMIN') return null
  return <Box sx={{ border: 1, borderColor: 'error.main', borderRadius: 2, p: 2.5 }}>
    <Stack spacing={1.5}>
      <Typography variant="overline" color="error.main">Zona de peligro</Typography>
      <Typography variant="h6">Eliminar mi cuenta y negocio</Typography>
      <Typography color="text.secondary">{accountDeletionDescription}</Typography>
      <Button color="error" variant="contained" sx={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Eliminar mi cuenta y negocio</Button>
    </Stack>
    <AccountDeletionDialog open={open} onClose={() => setOpen(false)} />
  </Box>
}

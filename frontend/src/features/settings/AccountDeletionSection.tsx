import { useRef, useState, type FormEvent } from 'react'
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { deleteAccount } from './settings.api'

const confirmationText = 'ELIMINAR MI CUENTA'
const description = 'Esta acción es permanente. Se eliminarán tu cuenta y todos los datos del negocio, incluidos clientes, reparaciones, caja, garantías, inventario, comercio y equipo. No podrás recuperarlos.'

export function AccountDeletionSection() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  if (user?.role !== 'OWNER' || user.platformRole === 'SUPER_ADMIN') return null

  const close = () => {
    if (submitting.current) return
    setOpen(false); setPassword(''); setConfirmation(''); setError('')
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current || !password || confirmation !== confirmationText) return
    submitting.current = true
    setBusy(true); setError('')
    try {
      await deleteAccount(password, confirmation)
      // Local logout only: the User and tenant no longer exist after the successful response.
      localStorage.removeItem(`tecnodesk_tutorial_premium-v2_${user.id}`)
      sessionStorage.removeItem('tecnodesk_trial_started')
      // Survives a ProtectedRoute redirect while AuthContext clears the deleted user.
      sessionStorage.setItem('tecnodesk_account_deleted', 'true')
      logout()
      navigate('/login', { replace: true, state: { accountDeleted: true } })
    } catch (requestError) {
      setError((requestError as { response?: { data?: { message?: string } } }).response?.data?.message || 'No pudimos eliminar el negocio. Intentá nuevamente.')
    } finally { submitting.current = false; setBusy(false) }
  }
  return <Box sx={{ border: 1, borderColor: 'error.main', borderRadius: 2, p: 2.5 }}>
    <Stack spacing={1.5}>
      <Typography variant="overline" color="error.main">Zona de peligro</Typography>
      <Typography variant="h6">Eliminar mi cuenta y negocio</Typography>
      <Typography color="text.secondary">{description}</Typography>
      <Button color="error" variant="contained" sx={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Eliminar mi cuenta y negocio</Button>
    </Stack>
    <Dialog open={open} onClose={close} disableEscapeKeyDown={busy} fullWidth maxWidth="sm" aria-labelledby="account-deletion-title">
      <Box component="form" onSubmit={submit}>
        <DialogTitle id="account-deletion-title">Eliminar mi cuenta y negocio</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="error">Esta acción no se puede deshacer.</Alert>
            <Typography>{description}</Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField autoFocus required fullWidth label="Contraseña actual" type="password" autoComplete="current-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
            <TextField required fullWidth label="Escribí ELIMINAR MI CUENTA para continuar" value={confirmation} disabled={busy} autoComplete="off" onChange={event => setConfirmation(event.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={close}>Cancelar</Button>
          <Button type="submit" color="error" variant="contained" disabled={busy || !password || confirmation !== confirmationText} startIcon={busy ? <CircularProgress color="inherit" size={16} /> : undefined}>Eliminar permanentemente</Button>
        </DialogActions>
      </Box>
    </Dialog>
  </Box>
}

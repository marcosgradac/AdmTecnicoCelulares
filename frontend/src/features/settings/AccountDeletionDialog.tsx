import { useRef, useState, type FormEvent } from 'react'
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { deleteAccount } from './settings.api'

const confirmationText = 'ELIMINAR MI CUENTA'
export const accountDeletionDescription = 'Esta acción es permanente. Se eliminarán tu cuenta y todos los datos del negocio, incluidos clientes, reparaciones, caja, garantías, inventario, comercio y equipo. No podrás recuperarlos.'

export function AccountDeletionDialog({ open, onClose, deletionToken, onDeleted }: {
  open: boolean; onClose: () => void; deletionToken?: string; onDeleted?: () => void
}) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)

  const close = () => {
    if (submitting.current) return
    setPassword(''); setConfirmation(''); setError(''); onClose()
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current || !password || confirmation !== confirmationText) return
    submitting.current = true
    setBusy(true); setError('')
    try {
      await deleteAccount(password, confirmation, deletionToken)
      // Local logout only: the User and tenant no longer exist after the successful response.
      for (let index = localStorage.length - 1; index >= 0; index--) {
        const key = localStorage.key(index)
        if (key?.startsWith('tecnodesk_tutorial_')) localStorage.removeItem(key)
      }
      sessionStorage.removeItem('tecnodesk_trial_started')
      // Survives a ProtectedRoute redirect while AuthContext clears the deleted user.
      sessionStorage.setItem('tecnodesk_account_deleted', 'true')
      logout()
      setPassword(''); setConfirmation(''); setError('')
      onDeleted?.()
      navigate('/login', { replace: true, state: { accountDeleted: true } })
    } catch (requestError) {
      setError((requestError as { response?: { data?: { message?: string } } }).response?.data?.message || 'No pudimos eliminar el negocio. Intentá nuevamente.')
    } finally { submitting.current = false; setBusy(false) }
  }
  return <Dialog open={open} onClose={close} disableEscapeKeyDown={busy} fullWidth maxWidth="sm" aria-labelledby="account-deletion-title">
      <Box component="form" onSubmit={submit}>
        <DialogTitle id="account-deletion-title">Eliminar mi cuenta y negocio</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="error">Esta acción no se puede deshacer.</Alert>
            <Typography>{accountDeletionDescription}</Typography>
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
}

import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { DeleteOutlineRounded } from '@mui/icons-material'
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import { deleteClient, type ClientOption } from '../../services/operations'

export function DeleteClientDialog({ client, onClose, onDeleted }: {
  client: Pick<ClientOption, 'id' | 'name'> | null
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false), [error, setError] = useState('')
  const submitting = useRef(false)
  useEffect(() => { setError('') }, [client?.id])
  const close = () => { if (!submitting.current) onClose() }
  const confirm = async () => {
    if (!client || submitting.current) return
    submitting.current = true
    setDeleting(true); setError('')
    try {
      await deleteClient(client.id)
      onDeleted()
    } catch (deleteError) {
      setError(axios.isAxiosError<{ message?: string }>(deleteError)
        ? deleteError.response?.data?.message ?? 'No pudimos eliminar el cliente. Intentá nuevamente.'
        : 'No pudimos eliminar el cliente. Intentá nuevamente.')
    } finally { submitting.current = false; setDeleting(false) }
  }
  return <Dialog open={Boolean(client)} onClose={close} fullWidth maxWidth="sm" aria-labelledby="delete-client-title" aria-describedby="delete-client-description">
    <DialogTitle id="delete-client-title">Eliminar cliente</DialogTitle>
    <DialogContent><Stack spacing={2} mt={1}>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography sx={{ overflowWrap: 'anywhere' }}>Vas a eliminar a <strong>{client?.name}</strong>.</Typography>
      <Typography id="delete-client-description">Este cliente dejará de aparecer entre los clientes activos y no podrá usarse para nuevas reparaciones. Sus reparaciones, pagos, movimientos de Caja y demás historial se conservarán.</Typography>
    </Stack></DialogContent>
    <DialogActions>
      <Button onClick={close} disabled={deleting}>Cancelar</Button>
      <Button color="error" variant="contained" disabled={deleting} onClick={() => void confirm()} startIcon={deleting ? <CircularProgress color="inherit" size={16} /> : <DeleteOutlineRounded />}>{deleting ? 'Eliminando…' : 'Eliminar cliente'}</Button>
    </DialogActions>
  </Dialog>
}

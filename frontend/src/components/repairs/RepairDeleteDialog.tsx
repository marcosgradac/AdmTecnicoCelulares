import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import axios from 'axios'
import { deleteRepair } from '../../services/repairs'
import type { Repair } from '../../types'

export function RepairDeleteDialog({ repair, onClose, onDeleted }: { repair?: Repair; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (repair) setError('') }, [repair])

  const confirm = async () => {
    if (!repair || deleting) return
    setDeleting(true); setError('')
    try { await deleteRepair(repair.id); onDeleted() }
    catch (cause) {
      const message = axios.isAxiosError<{ message?: string }>(cause) ? cause.response?.data?.message ?? 'No pudimos eliminar la reparación.' : 'No pudimos eliminar la reparación.'
      const details = axios.isAxiosError<{ details?: string[] }>(cause) ? cause.response?.data?.details ?? [] : []
      setError(details.length ? `${message} (${details.join(', ')})` : message)
    } finally { setDeleting(false) }
  }

  return <Dialog open={Boolean(repair)} onClose={deleting ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle>Eliminar reparación #{repair?.number}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} mt={1}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography color="text.secondary">
          {repair && repair.paid > 0
            ? 'Esta reparación tiene pagos registrados. Cancelala en lugar de eliminarla para conservar el historial.'
            : 'Esta reparación no tiene pagos ni movimientos asociados. Se eliminará definitivamente.'}
        </Typography>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={deleting}>Cancelar</Button>
      <Button variant="contained" color="error" disabled={deleting} onClick={() => void confirm()}>{deleting ? 'Eliminando…' : 'Eliminar reparación'}</Button>
    </DialogActions>
  </Dialog>
}

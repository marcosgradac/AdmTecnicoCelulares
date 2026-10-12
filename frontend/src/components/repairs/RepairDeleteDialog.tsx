import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import axios from 'axios'
import { deleteRepair } from '../../services/repairs'
import type { Repair } from '../../types'

export function RepairDeleteDialog({ repair, onClose, onDeleted }: { repair?: Repair; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState('')
  useEffect(() => { if (repair) setError('') }, [repair])

  const confirm = async () => {
    if (!repair || inFlight.current) return
    inFlight.current = true
    setDeleting(true); setError('')
    try { await deleteRepair(repair.id); onDeleted() }
    catch (cause) {
      const message = axios.isAxiosError<{ message?: string }>(cause) ? cause.response?.data?.message ?? 'No pudimos eliminar la reparación.' : 'No pudimos eliminar la reparación.'
      const details = axios.isAxiosError<{ details?: string[] }>(cause) ? cause.response?.data?.details ?? [] : []
      setError(details.length ? `${message} (${details.join(', ')})` : message)
    } finally { inFlight.current = false; setDeleting(false) }
  }

  return <Dialog open={Boolean(repair)} onClose={deleting ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle>¿Eliminar definitivamente esta reparación?</DialogTitle>
    <DialogContent>
      <Stack spacing={2} mt={1}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography color="text.secondary">
          Se eliminará permanentemente esta reparación y toda su información asociada, incluyendo pagos, adelantos, ingresos, egresos, devoluciones, historial y movimientos de Caja.
        </Typography>
        <Typography color="text.secondary">El saldo de Caja se recalculará automáticamente como si esta reparación nunca hubiera existido.</Typography>
        <Typography color="error.main" fontWeight={700}>Esta acción es irreversible.</Typography>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={deleting}>Volver</Button>
      <Button variant="contained" color="error" disabled={deleting} onClick={() => void confirm()}>{deleting ? 'Eliminando…' : 'Eliminar definitivamente'}</Button>
    </DialogActions>
  </Dialog>
}

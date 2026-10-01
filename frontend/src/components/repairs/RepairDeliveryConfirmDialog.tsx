import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack } from '@mui/material'
import { TaskAltRounded } from '@mui/icons-material'
import axios from 'axios'
import { advanceRepairStatus } from '../../services/repairs'
import type { Repair } from '../../types'

/**
 * Confirmación de Listo → Entregado.
 *
 * Entregar cierra el flujo normal: después no se puede volver atrás desde el seguimiento y
 * puede iniciar el período de garantía. El diálogo avisa de las dos consecuencias y sólo
 * cambia el estado cuando el usuario confirma; si cancela, no ocurre absolutamente nada.
 */
export function RepairDeliveryConfirmDialog({ repair, onClose, onDelivered }: { repair?: Repair; onClose: () => void; onDelivered: (repair: Repair) => void }) {
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  useEffect(() => { if (repair) setError('') }, [repair])
  const confirm = async () => {
    if (!repair) return
    setSaving(true); setError('')
    try { onDelivered(await advanceRepairStatus(repair.id)) }
    catch (cause) { setError(axios.isAxiosError<{ message?: string }>(cause) ? cause.response?.data?.message ?? 'No pudimos registrar la entrega.' : 'No pudimos registrar la entrega.') }
    finally { setSaving(false) }
  }
  return <Dialog open={Boolean(repair)} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle>¿Confirmar entrega del dispositivo?</DialogTitle>
    <DialogContent>
      <Stack spacing={2} mt={1}>
        {error && <Alert severity="error">{error}</Alert>}
        <DialogContentText>Una vez que marques esta reparación como Entregada, no vas a poder volver a un estado anterior desde el seguimiento normal. También puede comenzar el período de garantía.</DialogContentText>
        {repair?.warrantyEnabled && <Alert severity="info">Esta reparación tiene garantía de {repair.warrantyDurationDays ?? 0} días: el período se calcula desde el momento de la entrega.</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={saving}>Cancelar</Button>
      <Button variant="contained" startIcon={<TaskAltRounded />} onClick={() => void confirm()} disabled={saving}>{saving ? 'Registrando…' : 'Confirmar entrega'}</Button>
    </DialogActions>
  </Dialog>
}
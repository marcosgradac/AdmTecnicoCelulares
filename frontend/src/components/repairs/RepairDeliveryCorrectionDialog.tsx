import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, TextField } from '@mui/material'
import { ReplayRounded } from '@mui/icons-material'
import axios from 'axios'
import { correctRepairDelivery } from '../../services/repairs'
import type { Repair } from '../../types'

/**
 * Acción administrativa para una entrega cargada por error.
 *
 * No es navegación de estado: no aparece junto a «Estado siguiente» ni como botón de flujo.
 * Exige confirmación, motivo escrito y sólo la puede usar el propietario. Si existe un reclamo
 * de garantía asociado, el backend bloquea la operación y se explica el motivo.
 */
export function RepairDeliveryCorrectionDialog({ repair, onClose, onCorrected }: { repair?: Repair; onClose: () => void; onCorrected: (repair: Repair) => void }) {
  const [reason, setReason] = useState(''), [saving, setSaving] = useState(false), [error, setError] = useState('')
  useEffect(() => { if (repair) { setReason(''); setError('') } }, [repair])
  const submit = async () => {
    if (!repair) return
    if (reason.trim().length < 5) return setError('Describí brevemente por qué se corrige la entrega')
    setSaving(true); setError('')
    try { onCorrected(await correctRepairDelivery(repair.id, reason.trim())) }
    catch (cause) { setError(axios.isAxiosError<{ message?: string }>(cause) ? cause.response?.data?.message ?? 'No pudimos corregir la entrega.' : 'No pudimos corregir la entrega.') }
    finally { setSaving(false) }
  }
  return <Dialog open={Boolean(repair)} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle>Corregir entrega</DialogTitle>
    <DialogContent>
      <Stack spacing={2} mt={1}>
        {error && <Alert severity="error">{error}</Alert>}
        <DialogContentText>La reparación volverá a «Listo para retirar» y se borrarán la fecha de entrega y las fechas de garantía. Los pagos y el saldo no cambian. Esta acción queda registrada en el historial.</DialogContentText>
        <TextField required autoFocus fullWidth multiline minRows={2} label="Motivo de la corrección" value={reason} onChange={event => setReason(event.target.value)} helperText="Queda guardado en el historial interno de la reparación."/>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={saving}>Cancelar</Button>
      <Button variant="outlined" color="warning" startIcon={<ReplayRounded />} onClick={() => void submit()} disabled={saving}>{saving ? 'Corrigiendo…' : 'Corregir entrega'}</Button>
    </DialogActions>
  </Dialog>
}
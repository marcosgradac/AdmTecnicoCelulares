import { useEffect, useState } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, MenuItem, Radio, RadioGroup, Stack, TextField, Typography } from '@mui/material'
import axios from 'axios'
import { cancelRepair } from '../../services/repairs'
import type { Repair } from '../../types'
import { formatMoney } from '../../utils/format'
import { CurrencyField } from '../common/CurrencyField'

type Method = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'

export function RepairCancellationDialog({ repair, onClose, onCancelled }: { repair?: Repair; onClose: () => void; onCancelled: (repair: Repair) => void }) {
  const [charge, setCharge] = useState<'no' | 'yes'>('no')
  const [reviewFee, setReviewFee] = useState<number | null>(null)
  const [refundMethod, setRefundMethod] = useState<Method>('CASH')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (repair) { setCharge('no'); setReviewFee(null); setRefundMethod('CASH'); setError('') } }, [repair])

  const paid = repair?.paid ?? 0
  const fee = charge === 'yes' ? reviewFee ?? 0 : 0
  // Sólo uno de los dos puede ser positivo: nunca hay devolución y saldo a la vez.
  const refundAmount = Math.max(0, paid - fee)
  const reviewBalance = Math.max(0, fee - paid)

  const confirm = async () => {
    if (!repair || saving) return
    if (charge === 'yes' && reviewFee == null) return setError('Ingresá el costo de revisión')
    if (refundAmount > 0 && !refundMethod) return setError('Elegí el medio de devolución')
    setSaving(true); setError('')
    try {
      onCancelled(await cancelRepair(repair.id, { reviewFee: fee, ...(refundAmount > 0 ? { refundMethod } : {}) }))
    } catch (cause) {
      setError(axios.isAxiosError<{ message?: string }>(cause) ? cause.response?.data?.message ?? 'No pudimos cancelar la reparación.' : 'No pudimos cancelar la reparación.')
    } finally { setSaving(false) }
  }

  const row = (label: string, value: string, tone?: string) =>
    <Stack direction="row" justifyContent="space-between" gap={2}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={800} color={tone} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</Typography></Stack>

  const summary = <Stack spacing={0.75} mt={2}>
    {row('Abonado anteriormente', formatMoney(paid))}
    <Divider sx={{ my: 0.5 }}/>
    {row('Costo de revisión', formatMoney(fee), 'success.main')}
    {refundAmount > 0 && row('A devolver', formatMoney(refundAmount), 'warning.main')}
    {reviewBalance > 0 && row('Falta cobrar', formatMoney(reviewBalance), 'warning.main')}
  </Stack>

  const confirmLabel = refundAmount > 0 ? `Cancelar y devolver ${formatMoney(refundAmount)}`
    : reviewBalance > 0 ? `Cancelar con ${formatMoney(reviewBalance)} por cobrar`
      : 'Confirmar cancelación'

  return <Dialog open={Boolean(repair)} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle>Cancelar reparación #{repair?.number}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} mt={1}>
        {error && <Alert severity="error">{error}</Alert>}
        {paid === 0 && charge === 'no' && <Typography color="text.secondary">Esta reparación no tiene pagos registrados.</Typography>}
        {paid > 0 && charge === 'no' && <Typography color="text.secondary">El cliente abonó {formatMoney(paid)}.</Typography>}
        <Box>
          <Typography fontWeight={700} mb={0.5}>¿Vas a cobrar por la revisión del equipo?</Typography>
          <RadioGroup value={charge} onChange={event => { setCharge(event.target.value as 'no' | 'yes'); setError('') }}>
            <FormControlLabel value="no" control={<Radio/>} label="No cobrar revisión" disabled={saving}/>
            <FormControlLabel value="yes" control={<Radio/>} label="Cobrar revisión" disabled={saving}/>
          </RadioGroup>
        </Box>
        {charge === 'yes' && <CurrencyField required label="Costo de revisión" value={reviewFee} onValueChange={value => { setReviewFee(value); setError('') }} onEmpty={() => setReviewFee(null)} error={Boolean(error) && reviewFee == null} helperText="Puede ser menor, igual o mayor que lo abonado." disabled={saving}/>}
        {(charge === 'yes' || refundAmount > 0) && summary}
        {refundAmount > 0 && <TextField select fullWidth label="Medio de devolución" value={refundMethod} onChange={event => setRefundMethod(event.target.value as Method)} disabled={saving}>
          <MenuItem value="CASH">Efectivo</MenuItem>
          <MenuItem value="TRANSFER">Transferencia</MenuItem>
          <MenuItem value="CARD">Tarjeta</MenuItem>
          <MenuItem value="OTHER">Otro</MenuItem>
        </TextField>}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={saving}>Volver</Button>
      <Button variant="contained" color="error" disabled={saving || charge === 'yes' && reviewFee == null} onClick={() => void confirm()}>
        {saving ? 'Cancelando…' : confirmLabel}
      </Button>
    </DialogActions>
  </Dialog>
}

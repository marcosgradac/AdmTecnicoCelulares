import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material'
import axios from 'axios'
import { registerCancellationPayment } from '../../services/repairs'
import { cancellationReviewBalance, type Repair } from '../../types'
import { formatMoney } from '../../utils/format'
import { CurrencyField } from '../common/CurrencyField'

type Method = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'

export function RepairReviewPaymentDialog({ repair, onClose, onRegistered }: { repair?: Repair; onClose: () => void; onRegistered: (repair: Repair) => void }) {
  const balance = repair ? cancellationReviewBalance(repair) : 0
  const [amount, setAmount] = useState<number | null>(null)
  const [method, setMethod] = useState<Method>('CASH')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (repair) { setAmount(balance); setMethod('CASH'); setError('') } }, [repair]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!repair || saving) return
    if (amount == null) return setError('Ingresá el monto a cobrar')
    if (amount <= 0) return setError('El monto debe ser mayor que cero')
    if (amount > balance) return setError(`No podés cobrar más que ${formatMoney(balance)}`)
    setSaving(true); setError('')
    try { onRegistered(await registerCancellationPayment(repair.id, { amount, method })) }
    catch (cause) { setError(axios.isAxiosError<{ message?: string }>(cause) ? cause.response?.data?.message ?? 'No pudimos registrar el cobro.' : 'No pudimos registrar el cobro.') }
    finally { setSaving(false) }
  }

  return <Dialog open={Boolean(repair)} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle>Cobrar revisión #{repair?.number}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} mt={1}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography color="text.secondary">Pendiente de cobro por revisión: <strong>{formatMoney(balance)}</strong></Typography>
        <CurrencyField required label="Importe" value={amount} onValueChange={value => { setAmount(value); setError('') }} onEmpty={() => setAmount(null)} error={Boolean(error) && amount == null} helperText={Boolean(error) && amount == null ? 'Ingresá un monto' : undefined} disabled={saving}/>
        <TextField select fullWidth label="Método" value={method} onChange={event => setMethod(event.target.value as Method)} disabled={saving}>
          <MenuItem value="CASH">Efectivo</MenuItem>
          <MenuItem value="TRANSFER">Transferencia</MenuItem>
          <MenuItem value="CARD">Tarjeta</MenuItem>
          <MenuItem value="OTHER">Otro</MenuItem>
        </TextField>
        <Divider/>
        <Stack direction="row" justifyContent="space-between"><Typography variant="caption" color="text.secondary">Quedará pendiente</Typography><Typography variant="body2" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(Math.max(0, balance - (amount ?? 0)))}</Typography></Stack>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={saving}>Cancelar</Button>
      <Button variant="contained" disabled={saving || amount == null || amount <= 0 || amount > balance} onClick={() => void save()}>{saving ? 'Registrando…' : 'Registrar cobro'}</Button>
    </DialogActions>
  </Dialog>
}

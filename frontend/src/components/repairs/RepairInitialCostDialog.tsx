import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { SaveRounded } from '@mui/icons-material'
import axios from 'axios'
import { updateRepairInitialCost } from '../../services/repairs'
import type { Repair } from '../../types'
import { CurrencyField } from '../common/CurrencyField'
import { formatMoney } from '../../utils/format'

type Method = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'

export function RepairInitialCostDialog({ repair, onClose, onUpdated }: { repair?: Repair; onClose: () => void; onUpdated: (repair: Repair) => void }) {
  const [amount, setAmount] = useState<number | null>(0)
  const [method, setMethod] = useState<Method | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (repair) { setAmount(repair.partsCost ?? 0); setMethod(''); setError('') }
  }, [repair])
  if (!repair) return null
  const current = repair.partsCost ?? 0
  const invalidAmount = amount == null || !Number.isInteger(amount) || amount < 0 || amount > 2_147_483_647
  const needsMethod = (amount ?? 0) > 0 && current === 0 && !method
  const save = async () => {
    if (invalidAmount) return setError('Ingresá un importe entero entre $0 y $2.147.483.647')
    if (needsMethod) return setError('Seleccioná el medio de pago del gasto')
    setSaving(true); setError('')
    try { onUpdated(await updateRepairInitialCost(repair.id, { amount: amount!, ...((amount ?? 0) > 0 && method ? { method } : {}) })) }
    catch (cause) { setError(axios.isAxiosError<{ message?: string }>(cause) ? cause.response?.data?.message ?? 'No pudimos corregir el costo/gasto.' : 'No pudimos corregir el costo/gasto.') }
    finally { setSaving(false) }
  }
  return <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle>Corregir costo/gasto</DialogTitle>
    <DialogContent>
      <Stack spacing={2} mt={1}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography>Costo/gasto actual: <strong>{formatMoney(current)}</strong></Typography>
        <DialogContentText>Este importe corresponde al gasto del taller y se refleja como un egreso en Caja.</DialogContentText>
        <CurrencyField required label="Nuevo costo/gasto" value={amount} onValueChange={setAmount} onEmpty={() => setAmount(null)}
          error={invalidAmount} helperText={invalidAmount ? 'Ingresá un importe entero entre $0 y $2.147.483.647.' : undefined} disabled={saving}/>
        {(amount ?? 0) > 0 && <TextField select required={current === 0} label="Medio de pago del gasto" value={method}
          onChange={event => setMethod(event.target.value as Method | '')} disabled={saving}
          helperText={current > 0 ? 'Si ya existe el egreso, podés conservar su medio actual. Para crear uno nuevo, seleccioná un medio.' : 'Seleccioná cómo se pagó el gasto del taller.'}>
          <MenuItem value="">{current > 0 ? 'Conservar medio actual' : 'Seleccionar medio'}</MenuItem>
          <MenuItem value="CASH">Efectivo</MenuItem><MenuItem value="TRANSFER">Transferencia</MenuItem>
          <MenuItem value="CARD">Tarjeta</MenuItem><MenuItem value="OTHER">Otro</MenuItem>
        </TextField>}
        {amount === 0 && current > 0 && <Alert severity="warning">Al guardar $0 se eliminará de Caja el egreso inicial asociado a esta reparación.</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={saving}>Cancelar</Button>
      <Button variant="contained" startIcon={<SaveRounded/>} onClick={() => void save()} disabled={saving || invalidAmount || needsMethod}>{saving ? 'Guardando…' : 'Guardar costo/gasto'}</Button>
    </DialogActions>
  </Dialog>
}

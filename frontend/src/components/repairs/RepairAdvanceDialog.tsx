import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { SaveRounded } from '@mui/icons-material'
import axios from 'axios'
import { updateRepairAdvance } from '../../services/repairs'
import type { Repair } from '../../types'
import { CurrencyField } from '../common/CurrencyField'
import { formatMoney } from '../../utils/format'

type Method = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'

/**
 * Corrige el adelanto inicial de una reparación ya creada.
 *
 * El backend actualiza en una sola transacción el pago del adelanto, el ingreso de Caja,
 * el total pagado y el historial. No se crea un segundo adelanto ni se duplica la caja: los
 * pagos posteriores que ya existen se conservan y el saldo se recalcula sobre la suma real.
 */
export function RepairAdvanceDialog({ repair, onClose, onUpdated }: { repair?: Repair; onClose: () => void; onUpdated: (repair: Repair) => void }) {
  const [amount, setAmount] = useState<number | null>(0), [method, setMethod] = useState<Method>('TRANSFER'), [saving, setSaving] = useState(false), [error, setError] = useState('')
  useEffect(() => { if (repair) { setAmount(currentAdvance(repair)); setMethod('TRANSFER'); setError('') } }, [repair])
  if (!repair) return null
  const current = currentAdvance(repair)
  const otherPaid = repair.paid - current
  // El adelanto nunca puede dejar el total pagado por encima del presupuesto.
  const maxAdvance = repair.total - otherPaid
  const exceedsTotal = amount != null && amount > maxAdvance
  const needsMethod = (amount ?? 0) > 0 && !method
  const save = async () => {
    const value = amount ?? 0
    if (value < 0) return setError('El monto no puede ser negativo')
    if (exceedsTotal) return setError(`El total pagado no puede superar el presupuesto. Hay ${formatMoney(otherPaid)} en otros pagos.`)
    if (needsMethod) return setError('Seleccioná el medio de pago del adelanto')
    if (value === current) return onClose()
    setSaving(true); setError('')
    try { onUpdated(await updateRepairAdvance(repair.id, { amount: value, ...(value > 0 ? { method } : {}) })) }
    catch (cause) { setError(axios.isAxiosError<{ message?: string }>(cause) ? cause.response?.data?.message ?? 'No pudimos corregir el adelanto.' : 'No pudimos corregir el adelanto.') }
    finally { setSaving(false) }
  }
  return <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
    <DialogTitle>Corregir adelanto inicial</DialogTitle>
    <DialogContent>
      <Stack spacing={2} mt={1}>
        {error && <Alert severity="error">{error}</Alert>}
        <DialogContentText>
          Se actualiza el adelanto ya registrado, su ingreso en Caja y el saldo pendiente. Los demás pagos no se modifican.
        </DialogContentText>
        <CurrencyField required label="Adelanto inicial" value={amount} onValueChange={setAmount} onEmpty={() => setAmount(0)} error={exceedsTotal} helperText={exceedsTotal ? `Máximo ${formatMoney(maxAdvance)}: el total pagado no puede superar el presupuesto.` : `Adelanto actual: ${formatMoney(current)}. Dejalo en $0 para quitarlo.`}/>
        {(amount ?? 0) > 0 && <TextField required select label="Medio de pago" value={method} onChange={event => setMethod(event.target.value as Method)}>
          <MenuItem value="CASH">Efectivo</MenuItem><MenuItem value="TRANSFER">Transferencia</MenuItem><MenuItem value="CARD">Tarjeta</MenuItem><MenuItem value="OTHER">Otro</MenuItem>
        </TextField>}
        <Divider/>
        <Stack spacing={1}>
          <SummaryRow label="Presupuesto" value={formatMoney(repair.total)}/>
          <SummaryRow label="Otros pagos" value={formatMoney(otherPaid)}/>
          <SummaryRow label="Nuevo total pagado" value={formatMoney(otherPaid + (amount ?? 0))}/>
          <SummaryRow label="Saldo pendiente" value={formatMoney(Math.max(0, repair.total - otherPaid - (amount ?? 0)))} color={otherPaid + (amount ?? 0) >= repair.total ? 'success.main' : 'warning.main'}/>
        </Stack>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={saving}>Cancelar</Button>
      <Button variant="contained" startIcon={<SaveRounded />} onClick={() => void save()} disabled={saving || exceedsTotal}>{saving ? 'Guardando…' : 'Guardar adelanto'}</Button>
    </DialogActions>
  </Dialog>
}

/** El adelanto es el único pago marcado como inicial; los cobros de revisión no cuentan. */
const currentAdvance = (repair: Repair) =>
  (repair.payments ?? []).filter(payment => payment.isAdvance && !payment.cancellationReview).reduce((sum, payment) => sum + payment.amount, 0)

const SummaryRow = ({ label, value, color }: { label: string; value: string; color?: string }) =>
  <Stack direction="row" justifyContent="space-between" gap={2}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={750} color={color}>{value}</Typography></Stack>
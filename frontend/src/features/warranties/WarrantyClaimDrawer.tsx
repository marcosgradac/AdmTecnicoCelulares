import { Alert, Checkbox, Collapse, Divider, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { isAxiosError } from 'axios'
import { FormDrawer } from '../../components/common/FormDrawer'
import { IntegerField } from '../../components/common/IntegerField'
import { createWarrantyClaim, type WarrantyClaim, type WarrantyPaymentMethod } from './warranties.api'

const methods: Record<WarrantyPaymentMethod, string> = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', OTHER: 'Otro' }

export function WarrantyClaimDrawer({ open, repairId, onClose, onCreated }: { open: boolean; repairId?: string; onClose: () => void; onCreated: (claim: WarrantyClaim) => void }) {
  const [description, setDescription] = useState('')
  const [withExpense, setWithExpense] = useState(false)
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState<WarrantyPaymentMethod>('CASH')
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Al activar el casillero se genera la clave: si el envío falla, el reintento conserva la misma
  // y el backend reconoce la operación en lugar de generar un segundo egreso.
  const toggleExpense = () => setWithExpense(value => { if (!value) setKey(crypto.randomUUID()); return !value })
  const reset = () => { setDescription(''); setWithExpense(false); setConcept(''); setAmount(0); setMethod('CASH'); setKey('') }
  const expenseIncomplete = withExpense && (concept.trim().length < 2 || amount < 1 || amount > 2147483647)
  const save = async () => {
    if (!repairId) return
    setSaving(true); setError('')
    try {
      const claim = await createWarrantyClaim(repairId, description.trim(), withExpense ? { concept: concept.trim(), amount, method, idempotencyKey: key } : undefined)
      reset(); onCreated(claim)
    } catch (err) { setError(isAxiosError(err) ? err.response?.data?.message ?? 'No pudimos registrar el reclamo.' : 'No pudimos registrar el reclamo. Verificá que la garantía esté activa.') }
    finally { setSaving(false) }
  }
  return <FormDrawer open={open} eyebrow="GARANTÍAS" title="Nuevo reclamo" saving={saving} submitLabel="Registrar reclamo" submitDisabled={!repairId || description.trim().length < 5 || expenseIncomplete} onClose={onClose} onSubmit={() => void save()}>
    {error && <Alert severity="error">{error}</Alert>}
    <TextField multiline minRows={5} label="Descripción del problema" required value={description} onChange={event => setDescription(event.target.value)} helperText="Indicá qué falla reapareció y en qué condiciones." />
    <Divider />
    <Stack spacing={1.5}>
      <FormControlLabel control={<Checkbox checked={withExpense} onChange={toggleExpense} />} label={<Typography variant="body2" fontWeight={650}>Registrar un gasto con este reclamo</Typography>} />
      <Typography variant="caption" color="text.secondary">Opcional. Podés agregar más gastos después desde el reclamo.</Typography>
    </Stack>
    <Collapse in={withExpense} unmountOnExit>
      <Stack spacing={2.2} sx={{ pt: .5 }}>
        <Alert severity="info">Es un costo del negocio, no un cobro al cliente. Genera un egreso en Caja → Reparaciones.</Alert>
        <TextField label="Concepto del gasto" required value={concept} onChange={event => setConcept(event.target.value)} inputProps={{ maxLength: 200 }} placeholder="Módulo nuevo" />
        <IntegerField label="Importe ($)" value={amount} onValueChange={setAmount} min={1} max={2147483647} />
        <TextField select label="Medio de pago" value={method} onChange={event => setMethod(event.target.value as WarrantyPaymentMethod)}>{Object.entries(methods).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
      </Stack>
    </Collapse>
  </FormDrawer>
}

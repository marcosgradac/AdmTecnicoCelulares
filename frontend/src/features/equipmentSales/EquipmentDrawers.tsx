import { useRef, useState } from 'react'
import { Alert, Box, Button, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { FormDrawer } from '../../components/common/FormDrawer'
import { createEquipment, sellEquipment, updateEquipment, type EquipmentPaymentMethod, type EquipmentStatus, type ResaleDevice } from '../../services/equipmentSales'
import { formatMoney } from '../../utils/format'
import { equipmentError, isEquipmentConflict, localDateTime, paymentLabels, statusLabels, validAmount } from './equipmentPresentation'

type DrawerProps = { onClose: () => void; onSaved: () => void; onRefresh: () => void }

function ConflictNotice({ conflict, onRefresh }: { conflict: boolean; onRefresh: () => void }) {
  return conflict ? <Button variant="outlined" onClick={onRefresh}>Cerrar y actualizar listado</Button> : null
}

export function EquipmentEditor({ device, onClose, onSaved, onRefresh }: DrawerProps & { device: ResaleDevice | null }) {
  const [form, setForm] = useState({
    brand: device?.brand ?? '', model: device?.model ?? '', purchasePrice: device ? String(device.purchasePrice) : '',
    repairExpenses: device ? String(device.repairExpenses) : '', estimatedSalePrice: device ? String(device.estimatedSalePrice) : '',
    status: (device?.status ?? 'PURCHASED') as Exclude<EquipmentStatus, 'SOLD'>,
  })
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false)
  const submitting = useRef(false)
  const totalCost = Number(form.purchasePrice) + Number(form.repairExpenses)
  const validRepairExpenses = !device && form.repairExpenses.trim() === '' || validAmount(form.repairExpenses)
  const valid = !!form.brand.trim() && !!form.model.trim() && [form.purchasePrice, form.estimatedSalePrice].every(value => validAmount(value)) && validRepairExpenses && totalCost <= 2147483647
  const profit = Number(form.estimatedSalePrice) - totalCost
  const field = (name: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(current => ({ ...current, [name]: event.target.value }))
  const close = () => { if (!submitting.current) onClose() }
  const save = async () => {
    if (!valid || submitting.current || conflict) return
    submitting.current = true; setSaving(true); setError('')
    const input = { brand: form.brand.trim(), model: form.model.trim(), purchasePrice: Number(form.purchasePrice), repairExpenses: Number(form.repairExpenses), estimatedSalePrice: Number(form.estimatedSalePrice) }
    try {
      if (device) await updateEquipment(device.id, { ...input, status: form.status, expectedVersion: device.version })
      else await createEquipment(input)
      onSaved()
    } catch (error) { setError(equipmentError(error, 'No pudimos guardar el equipo.')); setConflict(isEquipmentConflict(error)) }
    finally { submitting.current = false; setSaving(false) }
  }
  return <FormDrawer open context="VENTA DE EQUIPOS" title={device ? 'Editar equipo' : 'Nuevo equipo'} saving={saving} submitLabel={device ? 'Guardar cambios' : 'Registrar compra'} submitDisabled={!valid || conflict} onClose={close} onSubmit={() => void save()}>
    {error && <Alert severity="error">{error}</Alert>}<ConflictNotice conflict={conflict} onRefresh={onRefresh} />
    <TextField autoFocus required label="Marca" value={form.brand} onChange={field('brand')} disabled={saving} slotProps={{ htmlInput: { maxLength: 80 } }} />
    <TextField required label="Modelo" value={form.model} onChange={field('model')} disabled={saving} slotProps={{ htmlInput: { maxLength: 120 } }} />
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField fullWidth required type="number" label="Precio de compra" value={form.purchasePrice} onChange={field('purchasePrice')} disabled={saving} slotProps={{ htmlInput: { min: 0, step: 1 } }} />
      <TextField fullWidth required={Boolean(device)} type="number" label="Gastos de reparación" value={form.repairExpenses} onChange={field('repairExpenses')} disabled={saving} slotProps={{ htmlInput: { min: 0, step: 1 } }} helperText={device ? 'Importe total acumulado' : 'Opcional. Vacío equivale a $0; podés cargarlo después.'} />
    </Stack>
    <TextField required type="number" label="Precio estimado de venta" value={form.estimatedSalePrice} onChange={field('estimatedSalePrice')} disabled={saving} slotProps={{ htmlInput: { min: 0, step: 1 } }} />
    {device ? <TextField select label="Estado" value={form.status} onChange={field('status')} disabled={saving}>{(['PURCHASED', 'REPAIRING', 'READY_FOR_SALE'] as const).map(status => <MenuItem key={status} value={status}>{statusLabels[status]}</MenuItem>)}</TextField> : <Typography variant="body2" color="text.secondary">El equipo se registra como Comprado.</Typography>}
    <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}><Stack direction="row" justifyContent="space-between"><Typography>Costo total</Typography><Typography fontWeight={800}>{valid ? formatMoney(totalCost) : '—'}</Typography></Stack><Stack direction="row" justifyContent="space-between" mt={1}><Typography>Ganancia estimada</Typography><Typography fontWeight={800} color={profit < 0 ? 'error.main' : 'success.main'}>{valid ? formatMoney(profit) : '—'}</Typography></Stack></Box>
    {valid && profit < 0 && <Alert severity="warning">El precio estimado no cubre la inversión.</Alert>}
    <Typography variant="body2" color="text.secondary">{device ? 'Al aumentar compra o gastos, se registra sólo la diferencia en Caja. Una reducción genera un ingreso compensatorio; el historial se conserva.' : 'La compra y los gastos iniciales se registran como egresos en Caja → Venta de equipos.'}</Typography>
  </FormDrawer>
}

export function EquipmentSaleDrawer({ device, onClose, onSaved, onRefresh }: DrawerProps & { device: ResaleDevice }) {
  const [price, setPrice] = useState(String(device.estimatedSalePrice))
  const [method, setMethod] = useState<EquipmentPaymentMethod>('CASH')
  const [date, setDate] = useState(localDateTime)
  const [dateMode, setDateMode] = useState('NOW')
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false)
  const submitting = useRef(false)
  const timestamp = new Date(date).getTime()
  const validDate = dateMode === 'NOW' || Number.isFinite(timestamp) && timestamp >= new Date(device.createdAt).getTime() && timestamp <= Date.now()
  const valid = validAmount(price, 1) && validDate
  const save = async () => {
    if (!valid || submitting.current || conflict) return
    submitting.current = true; setSaving(true); setError('')
    try {
      await sellEquipment(device.id, { actualSalePrice: Number(price), salePaymentMethod: method, ...(dateMode === 'CUSTOM' ? { soldAt: new Date(date).toISOString() } : {}), expectedVersion: device.version })
      onSaved()
    } catch (error) { setError(equipmentError(error, 'No pudimos confirmar la venta. Si la respuesta se perdió, cerrá y actualizá el listado antes de reintentar.')); setConflict(isEquipmentConflict(error)) }
    finally { submitting.current = false; setSaving(false) }
  }
  return <FormDrawer open context="VENTA DE EQUIPOS" title="Registrar venta" saving={saving} submitLabel="Confirmar venta" submitDisabled={!valid || conflict} onClose={() => { if (!submitting.current) onClose() }} onSubmit={() => void save()}>
    {error && <Alert severity="error">{error}</Alert>}<ConflictNotice conflict={conflict} onRefresh={onRefresh} />
    <Box><Typography variant="h2">{device.brand} {device.model}</Typography><Typography variant="body2" color="text.secondary">Listo para vender · costo total {formatMoney(device.totalCost)}</Typography></Box>
    <TextField autoFocus required type="number" label="Precio real de venta" value={price} onChange={event => setPrice(event.target.value)} disabled={saving} slotProps={{ htmlInput: { min: 1, step: 1 } }} />
    <TextField select label="Medio de pago" value={method} onChange={event => setMethod(event.target.value as EquipmentPaymentMethod)} disabled={saving}>{Object.entries(paymentLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
    <TextField select label="Fecha de venta" value={dateMode} onChange={event => setDateMode(event.target.value)} disabled={saving}><MenuItem value="NOW">Ahora, al confirmar</MenuItem><MenuItem value="CUSTOM">Otra fecha efectiva</MenuItem></TextField>
    {dateMode === 'CUSTOM' && <TextField required type="datetime-local" label="Fecha efectiva de venta" value={date} onChange={event => setDate(event.target.value)} disabled={saving} error={!validDate} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: localDateTime(new Date(device.createdAt)), max: localDateTime(), step: 0.001 } }} helperText="Debe ser posterior o igual a la compra y no futura." />}
    <Typography variant="body2" color="text.secondary">Caja registra siempre la fecha y hora real de confirmación. Una fecha efectiva distinta sólo identifica cuándo ocurrió la venta.</Typography>
    <Divider /><Stack direction="row" justifyContent="space-between"><Typography fontWeight={700}>Ganancia real</Typography><Typography fontWeight={800} color={Number(price) < device.totalCost ? 'error.main' : 'success.main'}>{validAmount(price, 1) ? formatMoney(Number(price) - device.totalCost) : '—'}</Typography></Stack>
    <Alert severity={Number(price) < device.totalCost ? 'warning' : 'info'}>{Number(price) < device.totalCost ? 'Esta venta tendrá una pérdida. ' : ''}Al confirmar se registra el ingreso en Caja y el equipo queda vendido, sin edición posterior.</Alert>
  </FormDrawer>
}

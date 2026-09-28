import { useState } from 'react'
import { Alert, Box, Button, Chip, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { AddRounded, LocalShippingOutlined } from '@mui/icons-material'
import { isAxiosError } from 'axios'
import { FormDrawer } from '../../components/common/FormDrawer'
import { IntegerField } from '../../components/common/IntegerField'
import { useAuth } from '../../auth/AuthContext'
import { canAccess } from '../../auth/permissions'
import { formatDate, formatMoney } from '../../utils/format'
import { addWarrantyExpense, deliverWarrantyClaim, updateWarrantyClaim, type WarrantyClaim, type WarrantyClaimStatus, type WarrantyPaymentMethod } from './warranties.api'

const labels: Record<WarrantyClaimStatus, string> = { OPEN: 'Abierto', IN_REVIEW: 'En revisión', RESOLVED: 'Resuelto', REJECTED: 'Rechazado' }
const methods: Record<WarrantyPaymentMethod, string> = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', OTHER: 'Otro' }
type Action = 'status' | 'expense' | 'delivery'

export function WarrantyClaimDetails({ claim, currentWarrantyStartedAt, onSaved }: { claim: WarrantyClaim; currentWarrantyStartedAt: string | null; onSaved: () => void }) {
  const { user } = useAuth()
  const canEdit = canAccess(user, 'repairs.update')
  const canReadCosts = canAccess(user, 'cash.view') || canAccess(user, 'cash.create') || canAccess(user, 'repairs.viewFinancials')
  const [action, setAction] = useState<Action | null>(null)
  const [status, setStatus] = useState<WarrantyClaimStatus>(claim.status)
  const [resolution, setResolution] = useState(claim.resolution ?? '')
  const [concept, setConcept] = useState(''), [amount, setAmount] = useState(0)
  const [method, setMethod] = useState<WarrantyPaymentMethod>('CASH')
  const [key, setKey] = useState(''), [newWarranty, setNewWarranty] = useState('none'), [days, setDays] = useState(7)
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const open = (next: Action) => {
    setError(''); setStatus(claim.status); setResolution(claim.resolution ?? '')
    if (next === 'expense') { setConcept(''); setAmount(0); setMethod('CASH'); setKey(crypto.randomUUID()) }
    if (next === 'delivery') { setNewWarranty('none'); setDays(7) }
    setAction(next)
  }
  const save = async () => {
    if (saving) return
    setSaving(true); setError('')
    try {
      if (action === 'expense') await addWarrantyExpense(claim.id, { concept: concept.trim(), amount, method, idempotencyKey: key })
      if (action === 'status') await updateWarrantyClaim(claim.id, { status, resolution: resolution.trim() })
      if (action === 'delivery') await deliverWarrantyClaim(claim.id, newWarranty === 'none' ? 0 : days)
      setAction(null); onSaved()
    } catch (err) { setError(isAxiosError(err) ? err.response?.data?.message ?? 'No pudimos guardar. Podés reintentar sin duplicar el gasto.' : 'No pudimos guardar los cambios.') }
    finally { setSaving(false) }
  }
  const title = action === 'expense' ? 'Agregar gasto del reclamo' : action === 'delivery' ? 'Registrar nueva entrega' : 'Actualizar reclamo'
  const coverageStatus = claim.newWarrantyStartedAt !== currentWarrantyStartedAt ? 'Reemplazada por otra entrega' : new Date(claim.newWarrantyExpiresAt!).getTime() < Date.now() ? 'Vencida' : 'Activa'
  const invalid = action === 'expense' ? concept.trim().length < 2 || amount < 1 || amount > 2147483647 : action === 'delivery' ? newWarranty !== 'none' && (days < 1 || days > 365) : false
  return <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', minWidth: 0, overflowWrap: 'anywhere' }}>
    <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center" mb={1}><Chip size="small" variant="outlined" label={labels[claim.status]} /><Typography variant="caption" color="text.secondary">{formatDate(claim.createdAt)}</Typography></Stack>
    <Typography variant="body2" fontWeight={650}>{claim.description}</Typography>
    {claim.coveredWarrantyStartedAt && <Typography variant="caption" color="text.secondary" display="block" mt={.75}>Garantía del reclamo: {claim.coveredWarrantyDurationDays} días · {formatDate(claim.coveredWarrantyStartedAt)} a {formatDate(claim.coveredWarrantyExpiresAt!)}{claim.coveredWarrantyConditions ? ` · ${claim.coveredWarrantyConditions}` : ''}</Typography>}
    {claim.resolution && <Typography variant="body2" mt={1}><strong>Resolución:</strong> {claim.resolution}</Typography>}
    {claim.resolvedAt && <Typography variant="caption" color="text.secondary">Cierre: {formatDate(claim.resolvedAt)}</Typography>}
    {canReadCosts && <Box mt={1}>
      <Typography variant="body2" fontWeight={650}>Costo del reclamo: {formatMoney(claim.expenses.reduce((total, expense) => total + expense.cashMovement.amount, 0))}</Typography>
      {claim.expenses.map(expense => <Box key={expense.id} mt={.75}>
        <Typography variant="body2">{expense.concept} · {formatMoney(expense.cashMovement.amount)} · {methods[expense.cashMovement.method]}</Typography>
        <Typography variant="caption" color="text.secondary" display="block">{formatDate(expense.createdAt)} · Movimiento de Caja: {expense.cashMovementId}</Typography>
      </Box>)}
    </Box>}
    {claim.deliveredAt ? <Box mt={1}>
      <Typography variant="body2">Nueva entrega: {formatDate(claim.deliveredAt)}</Typography>
      <Typography variant="body2" color="text.secondary">{claim.newWarrantyDurationDays ? `Nueva garantía: ${claim.newWarrantyDurationDays} días · vence ${formatDate(claim.newWarrantyExpiresAt!)} · ${coverageStatus}` : 'Nueva entrega sin garantía'}</Typography>
    </Box> : claim.status === 'RESOLVED' && <Typography variant="body2" color="text.secondary" mt={1}>Resuelto · pendiente de nueva entrega</Typography>}
    {!claim.deliveredAt && <Stack direction="row" flexWrap="wrap" gap={1} mt={1.5}>
      {canEdit && <Button size="small" onClick={() => open('status')}>Actualizar reclamo</Button>}
      {canEdit && canAccess(user, 'cash.create') && claim.status !== 'REJECTED' && <Button size="small" startIcon={<AddRounded />} onClick={() => open('expense')}>Agregar gasto</Button>}
      {canAccess(user, 'repairs.changeStatus') && claim.status === 'RESOLVED' && <Button size="small" startIcon={<LocalShippingOutlined />} onClick={() => open('delivery')}>Registrar nueva entrega</Button>}
    </Stack>}
    <FormDrawer open={action !== null} title={title} saving={saving} submitLabel={action === 'expense' ? 'Registrar gasto' : action === 'delivery' ? 'Confirmar entrega' : 'Guardar cambios'} submitDisabled={invalid} onClose={() => { if (!saving) setAction(null) }} onSubmit={() => void save()}>
      <Typography variant="body2" color="text.secondary">{claim.description}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {action === 'status' && <>
        <TextField select label="Estado" value={status} onChange={event => setStatus(event.target.value as WarrantyClaimStatus)}>{Object.entries(labels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
        <TextField label="Resolución / observaciones" multiline minRows={4} value={resolution} onChange={event => setResolution(event.target.value)} inputProps={{ maxLength: 1500 }} />
        {status === 'RESOLVED' && <Alert severity="info">Al guardar, podrás registrar la nueva entrega y elegir su garantía.</Alert>}
      </>}
      {action === 'expense' && <>
        <Alert severity="info">Es un costo del negocio, no un cobro al cliente. Genera un único egreso en Caja → Reparaciones.</Alert>
        <TextField label="Concepto del gasto" required value={concept} onChange={event => setConcept(event.target.value)} inputProps={{ maxLength: 200 }} placeholder="Módulo nuevo" />
        <IntegerField label="Importe ($)" value={amount} onValueChange={setAmount} min={1} max={2147483647} />
        <TextField select label="Medio de pago" value={method} onChange={event => setMethod(event.target.value as WarrantyPaymentMethod)}>{Object.entries(methods).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
      </>}
      {action === 'delivery' && <>
        <Typography variant="body2">La nueva entrega se registrará con la fecha y hora de confirmación.</Typography><Divider />
        <TextField select label="¿Querés dar una nueva garantía?" value={newWarranty} onChange={event => setNewWarranty(event.target.value)}><MenuItem value="none">Sin garantía</MenuItem><MenuItem value="days">Elegir cantidad de días</MenuItem></TextField>
        {newWarranty === 'days' && <IntegerField label="Días de nueva garantía" value={days} onValueChange={setDays} min={1} max={365} helperText="Comienza desde esta nueva entrega. La garantía anterior queda en el historial." />}
      </>}
    </FormDrawer>
  </Box>
}

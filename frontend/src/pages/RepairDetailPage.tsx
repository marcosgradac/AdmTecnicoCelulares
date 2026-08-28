import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { ContentCopyRounded, EditRounded, PaymentsRounded, VerifiedRounded, WhatsApp } from '@mui/icons-material'
import type { Repair } from '../types'
import { repairStatusConfig, repairStatuses } from '../config/repairStatus'
import { StatusChip } from '../components/common/StatusChip'
import { PageHeader } from '../components/common/PageHeader'
import { UiState } from '../components/common/UiState'
import { formatDate, formatMoney } from '../utils/format'
import { getRepair, updateRepair, updateRepairStatus, type UpdateRepairInput } from '../services/repairs'
import { getClientOptions, registerPayment, type ClientOption } from '../services/operations'
import { useAuth } from '../auth/AuthContext'
import { canAccess } from '../auth/permissions'
import { CurrencyField } from '../components/common/CurrencyField'

const messageFrom = (error: unknown, fallback: string) =>
  axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message ?? fallback : fallback

export function RepairDetailPage() {
  const { user } = useAuth()
  const canRegisterPayment = canAccess(user, 'payments:create')
  const { id } = useParams()
  const [repair, setRepair] = useState<Repair | null>(null)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState<(Omit<UpdateRepairInput,'total'> & {total:number|null}) | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [payment, setPayment] = useState<{amount:number|null;method:'CASH'|'TRANSFER'|'CARD'|'OTHER'}>({ amount: null, method: 'TRANSFER' })
  const load = useCallback(async () => {
    if (!id) return
    setLoading(true); setError('')
    try {
      const [repairData, clientData] = await Promise.all([getRepair(id), getClientOptions()])
      setRepair(repairData); setClients(clientData)
    } catch (loadError) { setError(messageFrom(loadError, 'No pudimos cargar la reparación.')) }
    finally { setLoading(false) }
  }, [id])
  useEffect(() => { void load() }, [load])
  if (loading) return <Card><UiState loading /></Card>
  if (!repair) return <Card><UiState title="Reparación no disponible" description={error || 'El registro no existe.'} action={() => void load()} /></Card>

  const current = repairStatusConfig[repair.status].order
  const tracking = `${window.location.origin}/seguimiento/${repair.trackingToken}`
  const startEditing = () => {
    setForm({ clientId: repair.clientId, deviceBrand: repair.deviceBrand, deviceModel: repair.deviceModel, imei: repair.imei, color: repair.color, issue: repair.issue, diagnosis: repair.diagnosis, notes: repair.notes, total: repair.total })
    setEditing(true); setError(''); setSuccess('')
  }
  const cancelEditing = () => { setEditing(false); setForm(null); setError('') }
  const saveChanges = async () => {
    if (!form) return
    if (form.total == null) return setError('Ingresá un monto')
    setSaving(true); setError(''); setSuccess('')
    try {
      const updated = await updateRepair(repair.id, { ...form, total: form.total })
      setRepair(updated); setEditing(false); setForm(null); setSuccess('Los cambios se guardaron correctamente.')
    } catch (saveError) { setError(messageFrom(saveError, 'No pudimos guardar los cambios.')) }
    finally { setSaving(false) }
  }
  const advance = async () => {
    const next = repairStatuses[Math.min(current + 1, repairStatuses.length - 1)]
    if (next === repair.status) return
    setSaving(true); setError(''); setSuccess('')
    try { setRepair(await updateRepairStatus(repair.id, next)); setSuccess('Estado actualizado correctamente.') }
    catch (statusError) { setError(messageFrom(statusError, 'No pudimos actualizar el estado.')) }
    finally { setSaving(false) }
  }
  const savePayment = async () => {
    if (payment.amount == null || payment.amount <= 0) return setError(payment.amount == null ? 'Ingresá un monto' : 'El monto debe ser mayor que cero')
    setSaving(true); setError('')
    try { await registerPayment(repair.id, { ...payment, amount: payment.amount }); await load(); setPaymentOpen(false); setPayment({ amount: null, method: 'TRANSFER' }); setSuccess('Pago registrado correctamente.') }
    catch (paymentError) { setError(messageFrom(paymentError, 'No pudimos registrar el pago.')) }
    finally { setSaving(false) }
  }
  const setField = <K extends keyof NonNullable<typeof form>>(key: K, value: NonNullable<typeof form>[K]) => setForm(current => current ? { ...current, [key]: value } : current)

  return <Box>
    <PageHeader context={`REPARACIÓN #${repair.number}`} title={repair.device} description={`${repair.clientName} · Ingresó el ${formatDate(repair.createdAt)}`} action={<Stack direction="row" gap={1} alignItems="center"><StatusChip status={repair.status}/>{!editing && <Button variant="outlined" startIcon={<EditRounded/>} onClick={startEditing}>Editar</Button>}</Stack>} />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
    {editing && form ? <Card sx={{ mb: 2.2 }}><CardContent>
      <Typography variant="h2" mb={2}>Editar datos generales</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}><TextField select fullWidth label="Cliente asociado" value={form.clientId ?? ''} onChange={event => setField('clientId', event.target.value)}>{clients.map(client => <MenuItem key={client.id} value={client.id}>{client.name} · {client.phone || 'Sin teléfono'}</MenuItem>)}</TextField></Grid>
        <Grid size={{ xs: 12, md: 3 }}><TextField required fullWidth label="Marca" value={form.deviceBrand} onChange={event => setField('deviceBrand', event.target.value)}/></Grid>
        <Grid size={{ xs: 12, md: 3 }}><TextField required fullWidth label="Modelo" value={form.deviceModel} onChange={event => setField('deviceModel', event.target.value)}/></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label="IMEI / serie" value={form.imei ?? ''} onChange={event => setField('imei', event.target.value)}/></Grid>
        <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label="Color" value={form.color ?? ''} onChange={event => setField('color', event.target.value)}/></Grid>
        <Grid size={{ xs: 12, md: 4 }}><CurrencyField required fullWidth label="Total del presupuesto" value={form.total} onValueChange={value=>setField('total',value)} onEmpty={()=>setField('total',null)} error={form.total==null} helperText={form.total==null?'Ingresá un monto':`Pagado: ${formatMoney(repair.paid)}`}/></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth multiline minRows={3} label="Falla reportada" value={form.issue} onChange={event => setField('issue', event.target.value)}/></Grid>
        <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth multiline minRows={3} label="Diagnóstico" value={form.diagnosis ?? ''} onChange={event => setField('diagnosis', event.target.value)}/></Grid>
        <Grid size={12}><TextField fullWidth multiline minRows={3} label="Observaciones" value={form.notes ?? ''} onChange={event => setField('notes', event.target.value)}/></Grid>
      </Grid>
      <Stack direction="row" justifyContent="flex-end" gap={1} mt={2}><Button onClick={cancelEditing} disabled={saving}>Cancelar</Button><Button variant="contained" disabled={saving || form.total==null || !form.deviceBrand.trim() || !form.deviceModel.trim() || form.issue.trim().length < 2} onClick={() => void saveChanges()}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button></Stack>
    </CardContent></Card> : null}
    <Grid container spacing={2.2}>
      <Grid size={{ xs: 12, lg: 8 }}><Stack spacing={2.2}>
        <Card><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}><Box><Typography variant="h2">Estado de la reparación</Typography><Typography variant="body2" color="text.secondary">El cliente verá este avance en su enlace.</Typography></Box><Button variant="contained" onClick={() => void advance()} disabled={repair.status === 'delivered' || saving || editing}>{saving ? 'Actualizando…' : 'Avanzar estado'}</Button></Stack><LinearProgress variant="determinate" value={repairStatusConfig[repair.status].progress} sx={{ height: 8, borderRadius: 8, my: 2.5 }}/><Stack spacing={1.2}>{repairStatuses.map(step => { const config = repairStatusConfig[step]; const completed = config.order <= current; const Icon = config.icon; return <Stack direction="row" gap={1.5} alignItems="center" key={step}><Box width={34} height={34} borderRadius="50%" display="grid" sx={{ placeItems: 'center', bgcolor: completed ? config.background : '#F2F3F6', color: completed ? config.color : '#A0A5B1' }}><Icon fontSize="small"/></Box><Box><Typography fontWeight={step === repair.status ? 800 : 600}>{config.label}</Typography><Typography variant="caption" color="text.secondary">{step === repair.status ? `Actualizado ${formatDate(repair.updatedAt)}` : completed ? 'Completado' : 'Pendiente'}</Typography></Box></Stack>})}</Stack></CardContent></Card>
        <Card><CardContent><Typography variant="h2">Problema reportado</Typography><Typography mt={1}>{repair.issue}</Typography><Divider sx={{ my: 2.5 }}/><Typography variant="h2">Diagnóstico</Typography><Typography color="text.secondary" mt={1}>{repair.diagnosis || 'Sin diagnóstico cargado.'}</Typography><Divider sx={{ my: 2.5 }}/><Typography variant="h2">Observaciones</Typography><Typography color="text.secondary" mt={1}>{repair.notes || 'Sin observaciones.'}</Typography></CardContent></Card>
        <Card><CardContent><Typography variant="h2">Seguimiento del cliente</Typography><Box p={1.5} borderRadius={2} bgcolor="background.default" mt={2} sx={{ overflowWrap: 'anywhere' }}>{tracking}</Box><Stack direction={{ xs: 'column', sm: 'row' }} gap={1} mt={2}><Button variant="outlined" startIcon={<ContentCopyRounded/>} onClick={() => void navigator.clipboard?.writeText(tracking)}>Copiar enlace</Button><Button variant="outlined" startIcon={<WhatsApp/>} component="a" target="_blank" href={`https://wa.me/${repair.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${repair.clientName}, podés seguir tu reparación acá: ${tracking}`)}`}>WhatsApp</Button></Stack></CardContent></Card>
      </Stack></Grid>
      <Grid size={{ xs: 12, lg: 4 }}><Stack spacing={2.2}><Card><CardContent><Typography variant="h2">Equipo y cliente</Typography><Stack spacing={1.7} mt={2}><Info label="Equipo" value={repair.device}/><Info label="Color" value={repair.color || 'No informado'}/><Info label="IMEI / serie" value={repair.imei || 'No informado'}/><Info label="Cliente" value={repair.clientName}/><Info label="WhatsApp" value={repair.phone || 'No informado'}/></Stack></CardContent></Card>{repair.warrantyEnabled && <Card><CardContent><Stack direction="row" gap={1}><VerifiedRounded color="primary"/><Typography variant="h2">Garantía</Typography></Stack><Stack spacing={1.6} mt={2}><Info label="Duración" value={`${repair.warrantyDurationDays} días`}/><Info label="Inicio" value={repair.warrantyStartedAt ? formatDate(repair.warrantyStartedAt) : 'Comienza al entregar'}/><Info label="Vencimiento" value={repair.warrantyExpiresAt ? formatDate(repair.warrantyExpiresAt) : 'Pendiente'}/></Stack></CardContent></Card>}<Card><CardContent><Stack direction="row" gap={1}><PaymentsRounded color="primary"/><Typography variant="h2">Resumen de pago</Typography></Stack><Stack spacing={1.6} mt={2}><Info label="Total" value={formatMoney(repair.total)}/><Info label="Pagado" value={formatMoney(repair.paid)} color="success.main"/><Divider/><Info label="Saldo" value={formatMoney(Math.max(0, repair.total - repair.paid))} color="error.main"/></Stack>{canRegisterPayment && <Button fullWidth variant="outlined" sx={{ mt: 2 }} disabled={repair.paid >= repair.total} onClick={() => setPaymentOpen(true)}>Registrar pago</Button>}</CardContent></Card></Stack></Grid>
    </Grid>
    <Dialog open={paymentOpen} onClose={() => setPaymentOpen(false)} fullWidth maxWidth="xs"><DialogTitle>Registrar pago</DialogTitle><DialogContent><Stack spacing={2} mt={1}><CurrencyField required label="Importe" value={payment.amount} onValueChange={amount=>setPayment(value=>({...value,amount}))} onEmpty={()=>setPayment(value=>({...value,amount:null}))} error={Boolean(error)&&payment.amount==null} helperText={Boolean(error)&&payment.amount==null?'Ingresá un monto':undefined}/><TextField select label="Método" value={payment.method} onChange={event => setPayment(value => ({ ...value, method: event.target.value as typeof value.method }))}><MenuItem value="CASH">Efectivo</MenuItem><MenuItem value="TRANSFER">Transferencia</MenuItem><MenuItem value="CARD">Tarjeta</MenuItem><MenuItem value="OTHER">Otro</MenuItem></TextField></Stack></DialogContent><DialogActions><Button onClick={() => setPaymentOpen(false)}>Cancelar</Button><Button variant="contained" disabled={saving || payment.amount == null || payment.amount <= 0} onClick={() => void savePayment()}>Guardar pago</Button></DialogActions></Dialog>
  </Box>
}
function Info({ label, value, color }: { label: string; value: string; color?: string }) { return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={750} color={color}>{value}</Typography></Box> }

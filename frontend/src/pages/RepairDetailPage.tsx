import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, LinearProgress, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { ArrowBackRounded, ArrowForwardRounded, ContentCopyRounded, EditRounded, PaymentsRounded, VerifiedRounded, WhatsApp } from '@mui/icons-material'
import type { Repair } from '../types'
import { canonicalStatus, canonicalStatusConfig, isSpecialStatus, nextStatus, previousStatus, repairFlow, repairStatusConfig, repairStatusLabel } from '../config/repairStatus'
import { StatusChip } from '../components/common/StatusChip'
import { RepairAdvanceDialog } from '../components/repairs/RepairAdvanceDialog'
import { RepairDeleteDialog } from '../components/repairs/RepairDeleteDialog'
import { RepairDeliveryConfirmDialog } from '../components/repairs/RepairDeliveryConfirmDialog'
import { RepairDeliveryCorrectionDialog } from '../components/repairs/RepairDeliveryCorrectionDialog'
import { RepairReviewPaymentDialog } from '../components/repairs/RepairReviewPaymentDialog'
import { PageHeader } from '../components/common/PageHeader'
import { UiState } from '../components/common/UiState'
import { formatDate, formatMoney } from '../utils/format'
import { advanceRepairStatus, correctRepairDelivery, getRepair, rewindRepairStatus, updateRepair, deleteRepair, type UpdateRepairInput } from '../services/repairs'
import { getClientOptions, registerPayment, type ClientOption } from '../services/operations'
import { useAuth } from '../auth/AuthContext'
import { canAccess } from '../auth/permissions'
import { CurrencyField } from '../components/common/CurrencyField'
import { cancellationReviewBalance, isStatusNote } from '../types'

const messageFrom = (error: unknown, fallback: string) =>
  axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message ?? fallback : fallback

export function RepairDetailPage() {
  const { user } = useAuth()
  const canRegisterPayment = canAccess(user, 'payments:create')
  const { id } = useParams()
  const navigate = useNavigate()
  const [repair, setRepair] = useState<Repair | null>(null)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState<(Omit<UpdateRepairInput,'total'> & {total:number|null}) | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [reviewPaymentOpen, setReviewPaymentOpen] = useState(false)
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [deliveryConfirmOpen, setDeliveryConfirmOpen] = useState(false)
  const [deliveryCorrectionOpen, setDeliveryCorrectionOpen] = useState(false)
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

  // Los estados históricos se leen como su paso equivalente para ordenar el progreso del flujo.
  const canonical = canonicalStatus(repair.status)
  const current = repairStatusConfig[canonical].order
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
      const updated = await updateRepair(repair.id, {
        ...form,
        clientId: form.clientId === repair.clientId ? undefined : form.clientId,
        total: form.total,
      })
      setRepair(updated); setEditing(false); setForm(null); setSuccess('Los cambios se guardaron correctamente.')
    } catch (saveError) { setError(messageFrom(saveError, 'No pudimos guardar los cambios.')) }
    finally { setSaving(false) }
  }
  // Entregado es el final del flujo: desde ahí no hay botón de retroceso en el flujo normal.
  const isDelivered = repair.status === 'delivered'
  const isSpecial = isSpecialStatus(repair.status)
  const next = nextStatus(repair.status)
  const previous = previousStatus(repair.status)
  const canChangeStatus = !isSpecial && canAccess(user, 'repairs.changeStatus') && !saving && !editing
  /**
   * Un solo paso por vez. Entregar no se aplica al instante: primero pide confirmación,
   * y sólo al confirmar se cambia el estado, se sella la entrega y arranca la garantía.
   */
  const moveStatus = async (direction: 'advance' | 'rewind') => {
    if (direction === 'advance') {
      if (!next || isDelivered) return
      if (next === 'delivered') return setDeliveryConfirmOpen(true)
    } else if (!previous || isDelivered || isSpecial) return
    setSaving(true); setError(''); setSuccess('')
    try {
      setRepair(await (direction === 'advance' ? advanceRepairStatus(repair.id) : rewindRepairStatus(repair.id)))
      setSuccess(direction === 'advance' ? 'Estado avanzado correctamente.' : 'Estado retrocedido correctamente.')
    } catch (statusError) { setError(messageFrom(statusError, 'No pudimos actualizar el estado.')) }
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
  const liquidated = repair.status === 'cancelled' && repair.cancellationPaidAmount != null
  const reviewFee = repair.cancellationReviewFee ?? 0
  const reviewPaid = repair.cancellationReviewPaid ?? 0
  const reviewBalance = cancellationReviewBalance(repair)
  const reviewCollected = liquidated ? Math.min(reviewFee, (repair.cancellationPaidAmount ?? 0) + reviewPaid) : 0
  const repairCost = (repair.partsCost ?? 0) + (repair.laborCost ?? 0)
  const estimatedProfit = repair.total - repairCost
  const initialAdvance = (repair.payments ?? []).filter(item => item.isAdvance && !item.cancellationReview).reduce((sum, item) => sum + item.amount, 0)
  const canCorrectAdvance = canAccess(user, 'repairs.viewFinancials') && !isSpecial
  const historyEvents: Array<{ id: string; date?: string; label: string; amount?: number }> = []
  for (const payment of [...(repair.payments ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) historyEvents.push({ id: `payment-${payment.id}`, date: payment.createdAt, label: payment.cancellationReview ? 'Pago de revisión' : payment.isAdvance ? 'Adelanto recibido' : 'Pago recibido', amount: payment.amount })
  if (repair.status === 'cancelled') {
    const cancelledAt = repair.cancelledAt ?? (repair.history ?? []).find(item => item.newStatus === 'cancelled')?.createdAt ?? repair.updatedAt
    historyEvents.push({ id: 'cancelled', date: cancelledAt, label: 'Reparación cancelada' })
    if (liquidated && reviewFee > 0) historyEvents.push({ id: 'cancellation-fee', date: cancelledAt, label: 'Costo de revisión', amount: reviewFee })
    if (liquidated && (repair.cancellationRefundAmount ?? 0) > 0) historyEvents.push({ id: 'cancellation-refund', date: cancelledAt, label: 'Devuelto al cliente', amount: repair.cancellationRefundAmount })
    if (liquidated && reviewBalance > 0) historyEvents.push({ id: 'cancellation-pending', date: cancelledAt, label: 'Pendiente por revisión', amount: reviewBalance })
    if (liquidated && reviewFee > 0 && reviewBalance === 0) historyEvents.push({ id: 'review-settled', label: 'Revisión pagada completamente' })
  }
  for (const item of repair.history ?? []) {
    if (item.newStatus === 'cancelled') continue
    // Una corrección del adelanto registra el mismo estado de origen y destino: se muestra
    // con su nota interna («Adelanto corregido de $20.000 a $30.000»), no como un paso.
    historyEvents.push(isStatusNote(item)
      ? { id: `note-${item.id ?? item.createdAt}`, date: item.createdAt, label: item.internalNote! }
      : { id: item.id ?? `${item.createdAt}-${item.newStatus}`, date: item.createdAt, label: `Estado: ${repairStatusLabel(item.newStatus)}` })
  }
  historyEvents.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  return <Box>
    <PageHeader context={`REPARACIÓN #${repair.number}`} title={repair.device} description={`${repair.clientName} · Ingresó el ${formatDate(repair.createdAt)}`} action={<Stack direction="row" gap={1} alignItems="center"><StatusChip status={repair.status}/>{!editing && <Button variant="outlined" startIcon={<EditRounded/>} onClick={startEditing}>Editar</Button>}{!editing && canAccess(user,'repairs.delete') && repair.status!=='cancelled' && repair.paid===0 && <Button variant="outlined" color="error" onClick={() => setDeleteOpen(true)}>Eliminar</Button>}</Stack>} />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
    {canAccess(user, 'repairs.viewFinancials') && repair.status !== 'cancelled' && <Card sx={{ mb: 2.2 }}><CardContent>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} mb={2}><Typography variant="h2">Costos y ganancia</Typography></Stack>
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}><Info label="Costo / gasto de la reparación" value={formatMoney(repairCost)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Info label="Mano de obra cobrada" value={formatMoney(repair.laborCharge ?? 0)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Info label="Ganancia estimada" value={formatMoney(estimatedProfit)} color={estimatedProfit < 0 ? 'warning.main' : 'success.main'} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Info label="Adelanto inicial" value={formatMoney(initialAdvance)} color="success.main" /></Grid>
      </Grid>
      <Typography variant="caption" color="text.secondary" display="block" mt={2}>La mano de obra está incluida en el total al cliente. Los pagos reducen el saldo, no la ganancia estimada. Podés corregir el adelanto sin crear un segundo pago.</Typography>
    </CardContent></Card>}
    {editing && form ? <Card sx={{ mb: 2.2 }}><CardContent>
      <Typography variant="h2" mb={2}>Editar datos generales</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}><TextField select fullWidth label="Cliente asociado" value={form.clientId ?? ''} onChange={event => setField('clientId', event.target.value)}>{repair && form.clientId === repair.clientId && !clients.some(client => client.id === repair.clientId) && <MenuItem disabled value={repair.clientId}>{repair.clientName} · Cliente histórico</MenuItem>}{clients.map(client => <MenuItem key={client.id} value={client.id}>{client.name} · {client.phone || 'Sin teléfono'}</MenuItem>)}</TextField></Grid>
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
        <Card><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}><Box><Typography variant="h2">Estado de la reparación</Typography><Typography variant="body2" color="text.secondary">{isDelivered ? 'El equipo ya fue entregado. Desde acá sólo se puede corregir una entrega cargada por error.' : isSpecial ? 'Este estado se administra desde su propio módulo.' : 'El cliente verá este avance en su enlace.'}</Typography></Box><Stack direction="row" gap={1} flexWrap="wrap" useFlexGap>
          {!isDelivered && !isSpecial && canChangeStatus && <Tooltip title={previous ? `Volver a «${repairStatusLabel(previous)}»` : 'Ya está en el primer paso'}><span><Button variant="outlined" startIcon={<ArrowBackRounded/>} onClick={() => void moveStatus('rewind')} disabled={!previous}>{`Anterior: ${previous ? repairStatusLabel(previous) : '—'}`}</Button></span></Tooltip>}
          {!isDelivered && !isSpecial && canChangeStatus && <Tooltip title={next ? (next === 'delivered' ? 'Entregar el dispositivo' : `Avanzar a «${repairStatusLabel(next)}»`) : 'Ya está en el último paso'}><span><Button variant="contained" endIcon={<ArrowForwardRounded/>} onClick={() => void moveStatus('advance')} disabled={!next}>{next === 'delivered' ? 'Entregar' : `Siguiente: ${next ? repairStatusLabel(next) : '—'}`}</Button></span></Tooltip>}
          {isDelivered && <Button variant="outlined" color="warning" onClick={() => setDeliveryCorrectionOpen(true)}>Corregir entrega</Button>}
        </Stack></Stack><LinearProgress variant="determinate" value={canonicalStatusConfig(repair.status).progress} sx={{ height: 8, borderRadius: 8, my: 2.5 }}/><Stack spacing={1.2}>{repairFlow.map(step => { const config = repairStatusConfig[step]; const completed = config.order <= current; const Icon = config.icon; return <Stack direction="row" gap={1.5} alignItems="center" key={step}><Box width={34} height={34} borderRadius="50%" display="grid" sx={{ placeItems: 'center', bgcolor: completed ? config.background : '#F2F3F6', color: completed ? config.color : '#A0A5B1' }}><Icon fontSize="small"/></Box><Box><Typography fontWeight={step === canonical ? 800 : 600}>{config.label}</Typography><Typography variant="caption" color="text.secondary">{step === canonical ? `Actualizado ${formatDate(repair.updatedAt)}` : completed ? 'Completado' : 'Pendiente'}</Typography></Box></Stack>})}</Stack></CardContent></Card>
        <Card><CardContent><Typography variant="h2">Problema reportado</Typography><Typography mt={1}>{repair.issue}</Typography><Divider sx={{ my: 2.5 }}/><Typography variant="h2">Diagnóstico</Typography><Typography color="text.secondary" mt={1}>{repair.diagnosis || 'Sin diagnóstico cargado.'}</Typography><Divider sx={{ my: 2.5 }}/><Typography variant="h2">Observaciones</Typography><Typography color="text.secondary" mt={1}>{repair.notes || 'Sin observaciones.'}</Typography></CardContent></Card>
        <Card><CardContent><Typography variant="h2">Seguimiento del cliente</Typography><Box p={1.5} borderRadius={2} bgcolor="background.default" mt={2} sx={{ overflowWrap: 'anywhere' }}>{tracking}</Box><Stack direction={{ xs: 'column', sm: 'row' }} gap={1} mt={2}><Button variant="outlined" startIcon={<ContentCopyRounded/>} onClick={() => void navigator.clipboard?.writeText(tracking)}>Copiar enlace</Button><Button variant="outlined" startIcon={<WhatsApp/>} component="a" target="_blank" href={`https://wa.me/${repair.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${repair.clientName}, podés seguir tu reparación acá: ${tracking}`)}`}>WhatsApp</Button></Stack></CardContent></Card>
      </Stack></Grid>
      <Grid size={{ xs: 12, lg: 4 }}><Stack spacing={2.2}><Card><CardContent><Typography variant="h2">Equipo y cliente</Typography><Stack spacing={1.7} mt={2}><Info label="Equipo" value={repair.device}/><Info label="Color" value={repair.color || 'No informado'}/><Info label="IMEI / serie" value={repair.imei || 'No informado'}/><Info label="Cliente" value={repair.clientName}/><Info label="WhatsApp" value={repair.phone || 'No informado'}/></Stack></CardContent></Card>{repair.warrantyEnabled && <Card><CardContent><Stack direction="row" gap={1}><VerifiedRounded color="primary"/><Typography variant="h2">Garantía</Typography></Stack><Stack spacing={1.6} mt={2}><Info label="Duración" value={`${repair.warrantyDurationDays} días`}/><Info label="Inicio" value={repair.warrantyStartedAt ? formatDate(repair.warrantyStartedAt) : 'Comienza al entregar'}/><Info label="Vencimiento" value={repair.warrantyExpiresAt ? formatDate(repair.warrantyExpiresAt) : 'Pendiente'}/></Stack></CardContent></Card>}{repair.status === 'cancelled' ? <Card><CardContent><Stack direction="row" gap={1}><PaymentsRounded color="primary"/><Typography variant="h2">Resumen de cancelación</Typography></Stack>{liquidated ? <Stack spacing={1.6} mt={2}><Info label="Costo de revisión" value={formatMoney(reviewFee)}/><Info label="Cobrado" value={formatMoney(reviewCollected)} color="success.main"/>{reviewBalance > 0 && <Info label="Pendiente" value={formatMoney(reviewBalance)} color="warning.main"/>}<Info label="Devuelto" value={formatMoney(repair.cancellationRefundAmount ?? 0)}/><Divider/><Info label="Aporta a Caja" value={formatMoney(reviewCollected)} color="success.main"/></Stack> : <Stack spacing={1.6} mt={2}><Info label="Abonado" value={formatMoney(repair.paid)} color="success.main"/></Stack>}{!liquidated && <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>Cancelación anterior sin detalle de liquidación</Typography>}{canRegisterPayment && reviewBalance > 0 && <Button fullWidth variant="contained" sx={{ mt: 2 }} onClick={() => setReviewPaymentOpen(true)}>Cobrar revisión</Button>}</CardContent></Card> : <Card><CardContent><Stack direction="row" gap={1}><PaymentsRounded color="primary"/><Typography variant="h2">Resumen de pago</Typography></Stack><Stack spacing={1.6} mt={2}><Info label="Total" value={formatMoney(repair.total)}/><Info label="Pagado" value={formatMoney(repair.paid)} color="success.main"/><Divider/><Info label="Saldo" value={formatMoney(Math.max(0, repair.total - repair.paid))} color={Math.max(0, repair.total - repair.paid) > 0 ? 'warning.main' : 'success.main'}/></Stack>{canCorrectAdvance && <Button fullWidth variant="outlined" sx={{ mt: 2 }} onClick={() => setAdvanceOpen(true)}>Corregir adelanto inicial</Button>}{canRegisterPayment && <Button fullWidth variant="outlined" sx={{ mt: 2 }} disabled={repair.paid >= repair.total} onClick={() => setPaymentOpen(true)}>Registrar pago</Button>}</CardContent></Card>}
        <Card><CardContent><Typography variant="h2">Historial</Typography><Stack spacing={1.4} mt={2}>{historyEvents.length ? historyEvents.map(event => <Stack key={event.id} direction="row" justifyContent="space-between" gap={1} alignItems="baseline"><Box minWidth={0}><Typography variant="body2" fontWeight={event.amount != null ? 750 : 650} sx={{ overflowWrap: 'anywhere' }}>{event.label}</Typography>{event.date && <Typography variant="caption" color="text.secondary">{formatDate(event.date)}</Typography>}</Box>{event.amount != null && <Typography variant="body2" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatMoney(event.amount)}</Typography>}</Stack>) : <Typography variant="body2" color="text.secondary">Sin movimientos registrados.</Typography>}</Stack></CardContent></Card></Stack></Grid>
    </Grid>
    <Dialog open={paymentOpen} onClose={() => setPaymentOpen(false)} fullWidth maxWidth="xs"><DialogTitle>Registrar pago</DialogTitle><DialogContent><Stack spacing={2} mt={1}><CurrencyField required label="Importe" value={payment.amount} onValueChange={amount=>setPayment(value=>({...value,amount}))} onEmpty={()=>setPayment(value=>({...value,amount:null}))} error={Boolean(error)&&payment.amount==null} helperText={Boolean(error)&&payment.amount==null?'Ingresá un monto':undefined}/><TextField select label="Método" value={payment.method} onChange={event => setPayment(value => ({ ...value, method: event.target.value as typeof value.method }))}><MenuItem value="CASH">Efectivo</MenuItem><MenuItem value="TRANSFER">Transferencia</MenuItem><MenuItem value="CARD">Tarjeta</MenuItem><MenuItem value="OTHER">Otro</MenuItem></TextField></Stack></DialogContent><DialogActions><Button onClick={() => setPaymentOpen(false)}>Cancelar</Button><Button variant="contained" disabled={saving || payment.amount == null || payment.amount <= 0} onClick={() => void savePayment()}>Guardar pago</Button></DialogActions></Dialog>
    <RepairDeleteDialog repair={deleteOpen ? repair : undefined} onClose={() => setDeleteOpen(false)} onDeleted={() => {
      setDeleteOpen(false); setPaymentOpen(false); setReviewPaymentOpen(false)
      navigate('/admin/reparaciones', { replace: true, state: { repairDeleted: true } })
    }} />
    <RepairReviewPaymentDialog repair={reviewPaymentOpen ? repair : undefined} onClose={() => setReviewPaymentOpen(false)} onRegistered={updated => { setRepair(updated); setReviewPaymentOpen(false) }} />
    <RepairAdvanceDialog repair={advanceOpen ? repair : undefined} onClose={() => setAdvanceOpen(false)} onUpdated={updated => { setAdvanceOpen(false); setRepair(updated); setSuccess('Adelanto corregido correctamente.') }} />
    <RepairDeliveryConfirmDialog repair={deliveryConfirmOpen ? repair : undefined} onClose={() => setDeliveryConfirmOpen(false)} onDelivered={updated => { setDeliveryConfirmOpen(false); setRepair(updated); setSuccess('Reparación entregada correctamente.') }} />
    <RepairDeliveryCorrectionDialog repair={deliveryCorrectionOpen ? repair : undefined} onClose={() => setDeliveryCorrectionOpen(false)} onCorrected={updated => { setDeliveryCorrectionOpen(false); setRepair(updated); setSuccess('Entrega corregida. La reparación volvió a «Listo para retirar».') }} />
  </Box>
}
function Info({ label, value, color }: { label: string; value: string; color?: string }) { return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={750} color={color}>{value}</Typography></Box> }

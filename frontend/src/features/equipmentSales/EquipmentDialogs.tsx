import { useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { DeviceBrandAvatar } from '../../components/common/DeviceBrandAvatar'
import { deleteEquipment, getEquipmentDetail, type EquipmentDetail, type ResaleDevice } from '../../services/equipmentSales'
import { formatMoney, formatShortDate, formatShortTime } from '../../utils/format'
import { GRADIENT_TEXT_SX } from '../../theme/tokens'
import { equipmentError, paymentLabels, statusLabels } from './equipmentPresentation'

const movementLabels: Record<string, string> = { PURCHASE: 'Compra', REPAIR: 'Reparación', PURCHASE_ADJUSTMENT: 'Ajuste de compra', REPAIR_ADJUSTMENT: 'Ajuste de reparación', SALE: 'Venta' }
const dateTime = (value: string | null) => value ? `${formatShortDate(value)} · ${formatShortTime(value)}` : '—'
function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={700} color={color} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <Box><Typography variant="h2" sx={{ ...GRADIENT_TEXT_SX, mb: 2 }}>{title}</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>{children}</Box></Box>
}
export function EquipmentDetailsDialog({ device, onClose }: { device: ResaleDevice; onClose: () => void }) {
  const mobile = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [detail, setDetail] = useState<EquipmentDetail | null>(null)
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setDetail(null)
    void getEquipmentDetail(device.id).then(value => { if (active) setDetail(value) }).catch(error => {
      if (!active) return
      const status = isAxiosError(error) ? error.response?.status : undefined
      setError(status === 403 ? 'No tenés permiso para ver este equipo.' : status === 404 ? 'El equipo ya no existe o no está disponible.' : equipmentError(error, 'No pudimos cargar los detalles. Podés reintentar.'))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [device.id, retry])
  const d = detail?.device
  return <Dialog open fullWidth maxWidth="lg" fullScreen={mobile} scroll="paper" onClose={onClose} aria-labelledby="equipment-details-title">
    <DialogTitle id="equipment-details-title"><Stack direction="row" spacing={1.5} alignItems="center"><DeviceBrandAvatar brand={device.brand} /><Box><Typography component="span" variant="h2" sx={GRADIENT_TEXT_SX}>Detalles del equipo</Typography><Typography variant="body2" color="text.secondary">{device.brand} {device.model}</Typography></Box></Stack></DialogTitle>
    <DialogContent dividers sx={{ py: 3 }}>
      {loading && <Stack alignItems="center" spacing={2} role="status"><CircularProgress size={28} /><Typography>Cargando detalles…</Typography></Stack>}
      {error && <Alert severity="error" action={<Button color="inherit" onClick={() => setRetry(value => value + 1)}>Reintentar</Button>}>{error}</Alert>}
      {d && <Stack spacing={3}>
        <Section title="Equipo"><Field label="Marca" value={d.brand} /><Field label="Modelo" value={d.model} /><Field label="Estado" value={statusLabels[d.status]} /><Field label="Fecha de registro" value={dateTime(d.createdAt)} /><Field label="Última actualización" value={dateTime(d.updatedAt)} /></Section><Divider />
        <Section title="Inversión y estimaciones"><Field label="Precio de compra" value={formatMoney(d.purchasePrice)} color="error.main" /><Field label="Gastos de reparación" value={formatMoney(d.repairExpenses)} color="error.main" /><Field label="Inversión total" value={formatMoney(d.totalCost)} color="error.main" /><Field label="Precio estimado de venta" value={formatMoney(d.estimatedSalePrice)} color="success.main" /><Field label="Ganancia estimada" value={formatMoney(d.estimatedProfit)} color={d.estimatedProfit < 0 ? 'error.main' : 'success.main'} /></Section>
        {d.status === 'SOLD' && <><Divider /><Section title="Venta realizada"><Field label="Precio real de venta" value={d.actualSalePrice === null ? '—' : formatMoney(d.actualSalePrice)} color="success.main" /><Field label="Ganancia real" value={d.realizedProfit === null ? '—' : formatMoney(d.realizedProfit)} color={d.realizedProfit !== null && d.realizedProfit < 0 ? 'error.main' : 'success.main'} /><Field label="Inversión al vender" value={d.saleCostBasis === null ? '—' : formatMoney(d.saleCostBasis)} color="error.main" /><Field label="Fecha y hora de venta" value={dateTime(d.soldAt)} /><Field label="Medio de pago" value={d.salePaymentMethod ? paymentLabels[d.salePaymentMethod] : '—'} /></Section></>}
        <Divider /><Box><Typography variant="h2" sx={{ ...GRADIENT_TEXT_SX, mb: 2 }}>Movimientos financieros</Typography>{!detail?.movements.length ? <Typography variant="body2" color="text.secondary">No hay movimientos asociados.</Typography> : <Stack spacing={1}>{detail.movements.map(movement => <Box key={movement.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}><Box><Typography variant="body2" fontWeight={700}>{movement.description}</Typography><Typography variant="caption" color="text.secondary">{dateTime(movement.createdAt)} · {movement.method ? paymentLabels[movement.method] : 'Sin medio de pago'}</Typography></Box><Box><Typography variant="body2" fontWeight={800} color={movement.type === 'EXPENSE' ? 'error.main' : 'success.main'}>{movement.type === 'EXPENSE' ? 'Egreso' : 'Ingreso'} · {formatMoney(movement.amount)}</Typography><Typography variant="caption" color="text.secondary">{movement.resaleKind ? movementLabels[movement.resaleKind] ?? 'Movimiento' : 'Movimiento'}</Typography></Box></Stack></Box>)}</Stack>}</Box>
      </Stack>}
    </DialogContent><DialogActions><Button autoFocus onClick={onClose}>Cerrar</Button></DialogActions>
  </Dialog>
}

export function EquipmentDeleteDialog({ device, canDelete, onClose, onDeleted, onRefresh }: { device: ResaleDevice; canDelete: boolean; onClose: () => void; onDeleted: () => void; onRefresh: () => void }) {
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [blocked, setBlocked] = useState(!canDelete), [stale, setStale] = useState(false)
  const submitting = useRef(false)
  const close = () => { if (!submitting.current) onClose() }
  const remove = async () => {
    if (!canDelete || !confirmed || blocked || submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try { await deleteEquipment(device.id, device.version); onDeleted() }
    catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined
      setBlocked(status === 403 || status === 404 || status === 409); setStale(status === 404 || status === 409)
      setError(status === 403 ? 'No tenés permiso para eliminar este equipo.' : status === 404 ? 'El equipo ya no existe. Actualizá el listado para verificarlo.' : status === 409 ? equipmentError(error, 'El equipo cambió desde que abriste esta ventana.') + ' Actualizá el listado y revisá los datos antes de eliminarlo.' : equipmentError(error, 'No pudimos eliminar el equipo. Podés reintentar; si la respuesta se perdió, actualizá el listado para verificarlo.'))
    } finally { submitting.current = false; setBusy(false) }
  }
  return <Dialog open fullWidth maxWidth="sm" onClose={busy ? undefined : close} disableEscapeKeyDown={busy} aria-labelledby="equipment-delete-title">
    <DialogTitle id="equipment-delete-title">¿Eliminar definitivamente este equipo?</DialogTitle><DialogContent>
      <Stack spacing={2}><Typography fontWeight={800}>{device.brand} {device.model}</Typography><Typography variant="body2" color="text.secondary">{statusLabels[device.status]} · Inversión {formatMoney(device.totalCost)}</Typography><Alert severity="warning">Esta acción es irreversible. Se eliminará el equipo y todos sus movimientos vinculados en Caja, incluidos los ingresos de venta si ya fue vendido.</Alert>
      {!canDelete && <Alert severity="error">No tenés permiso para eliminar este equipo.</Alert>}{error && <Alert severity="error">{error}</Alert>}
      <FormControlLabel control={<Checkbox checked={confirmed} disabled={busy || blocked} onChange={(_, checked) => setConfirmed(checked)} />} label="Entiendo que se eliminarán definitivamente el equipo y sus movimientos en Caja." />
      {stale && <Button onClick={onRefresh}>Cerrar y actualizar listado</Button>}</Stack>
    </DialogContent><DialogActions><Button autoFocus disabled={busy} onClick={close}>Volver</Button><Button color="error" variant="contained" disabled={!confirmed || busy || blocked || !canDelete} onClick={() => void remove()}>{busy ? 'Eliminando…' : 'Eliminar definitivamente'}</Button></DialogActions>
  </Dialog>
}

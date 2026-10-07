import { useEffect, useState } from 'react'
import axios from 'axios'
import { Alert, Autocomplete, Box, Button, InputAdornment, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material'
import type { Repair } from '../../types'
import { getClientOptions, type ClientOption } from '../../services/operations'
import { deviceBrandOptions, findKnownDeviceBrand, normalizeDeviceBrand, OTHER_DEVICE_BRAND } from '../../config/deviceBrands'
import { editRepair, getRepair, type EditRepairInput } from '../../services/repairs'
import { useAuth } from '../../auth/AuthContext'
import { canAccess } from '../../auth/permissions'
import { formatMoney } from '../../utils/format'
import { FormSection } from '../admin/AdminPatterns'
import { CurrencyField } from '../common/CurrencyField'
import { FormDrawer } from '../common/FormDrawer'
import { DeviceBrandAvatar, DeviceBrandOption } from '../common/DeviceBrandAvatar'
import { NewClientDrawer } from '../clients/NewClientDrawer'
import { RepairDeliveryCorrectionDialog } from './RepairDeliveryCorrectionDialog'

type Method = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER'
type Form = {
  clientId: string; deviceBrand: string; deviceModel: string; imei: string; color: string;
  issue: string; diagnosis: string; notes: string; estimatedDeliveryDate: string;
  partsCost: number; partsCostMethod: Method | ''; laborCharge: number; total: number | null;
  advanceAmount: number; advanceMethod: Method | '';
}
const initialAdvance = (repair: Repair) => (repair.payments ?? []).filter(payment => payment.isAdvance && !payment.cancellationReview).reduce((sum, payment) => sum + payment.amount, 0)
const methods = [['CASH', 'Efectivo'], ['TRANSFER', 'Transferencia'], ['CARD', 'Tarjeta'], ['OTHER', 'Otro']]

export function EditRepairDrawer({ open, repair, onClose, onUpdated, onDeliveryCorrected }: { open: boolean; repair?: Repair; onClose: () => void; onUpdated: (repair: Repair) => void; onDeliveryCorrected?: (repair: Repair) => void }) {
  const { user } = useAuth()
  const financial = canAccess(user, 'repairs.viewFinancials')
  const [deliveryCorrectionOpen, setDeliveryCorrectionOpen] = useState(false)
  const [clientDrawerOpen, setClientDrawerOpen] = useState(false)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loaded, setLoaded] = useState<Repair>()
  const [form, setForm] = useState<Form>()
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [customMode, setCustomMode] = useState(false)
  useEffect(() => {
    if (!open || !repair) return
    let active = true
    setForm(undefined); setLoaded(undefined); setError(''); setClientDrawerOpen(false); setDeliveryCorrectionOpen(false)
    // List summaries omit workshop finances: fetch permission-filtered detail before editing.
    void getRepair(repair.id).then(current => {
      if (!active) return
      setLoaded(current)
      setForm({ clientId: current.clientId, deviceBrand: current.deviceBrand, deviceModel: current.deviceModel,
        imei: current.imei ?? '', color: current.color ?? '', issue: current.issue, diagnosis: current.diagnosis ?? '', notes: current.notes ?? '',
        estimatedDeliveryDate: current.estimatedDeliveryDate?.slice(0, 10) ?? '',
        partsCost: current.partsCost ?? 0, partsCostMethod: '', laborCharge: current.laborCharge ?? 0, total: current.total,
        advanceAmount: initialAdvance(current), advanceMethod: current.payments?.find(payment => payment.isAdvance && !payment.cancellationReview)?.method ?? '',
      })
      setCustomMode(!findKnownDeviceBrand(current.deviceBrand) && Boolean(current.deviceBrand.trim()))
    }).catch(() => { if (active) setError('No pudimos cargar la reparación. Cerrá el formulario e intentá nuevamente.') })
    void getClientOptions().then(items => { if (active) setClients(items) }).catch(() => { if (active) setError('No pudimos cargar los clientes.') })
    return () => { active = false }
  }, [open, repair?.id])
  const field = <K extends keyof Form>(key: K, value: Form[K]) => setForm(current => current ? { ...current, [key]: value } : current)
  const historicalClient: ClientOption | undefined = loaded && !clients.some(client => client.id === loaded.clientId)
    ? { id: loaded.clientId, name: loaded.clientName, phone: loaded.phone || null } : undefined
  const clientOptions = historicalClient ? [historicalClient, ...clients] : clients
  const selectedClient = clientOptions.find(client => client.id === form?.clientId) ?? null
  const cancelled = loaded?.status === 'cancelled'
  const originalAdvance = loaded ? initialAdvance(loaded) : 0
  const otherPaid = loaded ? loaded.paid - originalAdvance : 0
  const resultingPaid = otherPaid + (form?.advanceAmount ?? 0)
  const suggestedTotal = (form?.partsCost ?? 0) + (form?.laborCharge ?? 0)
  const invalidTotal = form?.total != null && form.total < (financial ? resultingPaid : loaded?.paid ?? 0)
  const needsCostMethod = Boolean(form && form.partsCost > 0 && loaded?.partsCost === 0 && !form.partsCostMethod)
  const needsAdvanceMethod = Boolean(form && form.advanceAmount > 0 && !form.advanceMethod)
  const save = async () => {
    if (!loaded || !form) return
    if (form.total == null) return setError('Ingresá un monto')
    const amounts = financial ? [form.total, form.partsCost, form.laborCharge, form.advanceAmount] : [form.total]
    if (amounts.some(value => !Number.isInteger(value) || value < 0 || value > 2_147_483_647)) return setError('Los montos deben ser enteros entre $0 y $2.147.483.647.')
    if (invalidTotal) return setError('El total al cliente no puede ser menor que el importe ya pagado.')
    if (needsCostMethod) return setError('Seleccioná el medio de pago del gasto.')
    if (needsAdvanceMethod) return setError('Seleccioná el medio de pago del adelanto.')
    const input: EditRepairInput = {}
    for (const key of ['clientId', 'deviceModel', 'issue', 'imei', 'color', 'diagnosis', 'notes'] as const) {
      const value = form[key].trim()
      if (value !== (loaded[key] ?? '')) input[key] = value
    }
    const brand = normalizeDeviceBrand(form.deviceBrand)
    if (form.deviceBrand !== loaded.deviceBrand && brand !== loaded.deviceBrand) input.deviceBrand = brand
    if (form.total !== loaded.total) input.total = form.total
    if (form.estimatedDeliveryDate !== (loaded.estimatedDeliveryDate?.slice(0, 10) ?? '')) input.estimatedDeliveryDate = form.estimatedDeliveryDate || null
    if (financial && !cancelled) {
      if (form.partsCost !== (loaded.partsCost ?? 0) || form.partsCostMethod) {
        input.partsCost = form.partsCost
        if (form.partsCost > 0 && form.partsCostMethod) input.partsCostMethod = form.partsCostMethod
      }
      if (form.laborCharge !== (loaded.laborCharge ?? 0)) input.laborCharge = form.laborCharge
      const originalMethod = loaded.payments?.find(payment => payment.isAdvance && !payment.cancellationReview)?.method ?? ''
      if (form.advanceAmount !== originalAdvance || form.advanceAmount > 0 && form.advanceMethod !== originalMethod) {
        input.advanceAmount = form.advanceAmount
        if (form.advanceAmount > 0 && form.advanceMethod) input.advanceMethod = form.advanceMethod
      }
    }
    setSaving(true); setError('')
    try { onUpdated(await editRepair(loaded.id, input)) }
    catch (cause) { setError(axios.isAxiosError<{ message?: string }>(cause) ? cause.response?.data?.message ?? 'No pudimos guardar los cambios de la reparación.' : 'No pudimos guardar los cambios de la reparación.') }
    finally { setSaving(false) }
  }
  return <><FormDrawer open={open && !clientDrawerOpen && !deliveryCorrectionOpen} title="Editar reparación" saving={saving} submitLabel="Guardar cambios" submitDisabled={!form?.clientId || !form.deviceBrand.trim() || !form.deviceModel.trim() || form.issue.trim().length < 2 || form.total == null || invalidTotal || needsCostMethod || needsAdvanceMethod} onClose={() => { if (!saving) onClose() }} onSubmit={() => void save()}>
    {error && <Alert severity="error">{error}</Alert>}
    {!form ? !error && <LinearProgress /> : <>
      <FormSection legacyHeading title="Cliente">
        <Autocomplete fullWidth disabled={saving} options={clientOptions} value={selectedClient} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionDisabled={option => option.id === historicalClient?.id} onChange={(_, value) => field('clientId', value?.id ?? '')} getOptionLabel={option => `${option.name}${option.phone ? ` · ${option.phone}` : ''}${option.id === historicalClient?.id ? ' · Cliente histórico' : ''}`} filterOptions={(options, state) => options.filter(option => `${option.name} ${option.phone ?? ''}`.toLowerCase().includes(state.inputValue.toLowerCase()))} noOptionsText="No encontramos ese cliente. Crealo primero desde Clientes." renderInput={params => <TextField {...params} required label="Buscar cliente..." placeholder="Nombre, apellido o teléfono" />} />
        <Button size="small" sx={{ alignSelf: 'flex-start' }} disabled={saving} onClick={() => setClientDrawerOpen(true)}>+ Crear cliente</Button>
      </FormSection>
      <FormSection legacyHeading legacyDivider title="Dispositivo" description="Datos para identificar el equipo que ingresa.">
        <Autocomplete fullWidth disabled={saving} options={deviceBrandOptions} value={customMode ? OTHER_DEVICE_BRAND : findKnownDeviceBrand(form.deviceBrand) ?? null} onChange={(_, value) => { if (value === OTHER_DEVICE_BRAND) { setCustomMode(true); field('deviceBrand', '') } else { setCustomMode(false); field('deviceBrand', value ?? '') } }} noOptionsText="Elegí «Otra» para escribir una marca distinta." renderOption={(props, option) => <DeviceBrandOption key={option} option={option} optionProps={props} />} renderInput={params => <TextField {...params} required label="Marca" InputProps={{ ...params.InputProps, startAdornment: form.deviceBrand ? <InputAdornment position="start"><DeviceBrandAvatar brand={form.deviceBrand} size={20} /></InputAdornment> : params.InputProps.startAdornment }} />} />
        {customMode && <TextField fullWidth required label="Otra marca" value={form.deviceBrand} onChange={event => field('deviceBrand', event.target.value)} disabled={saving} helperText="Escribí el nombre de la marca tal como querés guardarlo." />}
        <TextField fullWidth required label="Modelo" value={form.deviceModel} onChange={event => field('deviceModel', event.target.value)} disabled={saving} />
        <TextField fullWidth label="IMEI / serie" value={form.imei} onChange={event => field('imei', event.target.value)} disabled={saving} />
        <TextField fullWidth label="Color (opcional)" value={form.color} onChange={event => field('color', event.target.value)} disabled={saving} />
      </FormSection>
      <FormSection legacyHeading legacyDivider title="Reparación">
        <TextField fullWidth required multiline minRows={3} label="Falla informada" value={form.issue} onChange={event => field('issue', event.target.value)} disabled={saving} />
        <TextField fullWidth multiline minRows={2} label="Diagnóstico (opcional)" value={form.diagnosis} onChange={event => field('diagnosis', event.target.value)} disabled={saving} />
        <TextField fullWidth type="date" label="Fecha estimada de entrega" value={form.estimatedDeliveryDate} onChange={event => field('estimatedDeliveryDate', event.target.value)} InputLabelProps={{ shrink: true }} disabled={saving} />
      </FormSection>
      <FormSection legacyHeading legacyDivider title="Costos y cobro">
        {cancelled && <Alert severity="info">La liquidación de una reparación cancelada se administra desde su propio flujo.</Alert>}
        {financial && <>
          <CurrencyField fullWidth label="Costo / gasto de la reparación" value={form.partsCost} onValueChange={value => field('partsCost', value)} onEmpty={() => field('partsCost', 0)} disabled={saving || cancelled} helperText="Es el egreso del taller. Se corrige el movimiento inicial de Caja." />
          {form.partsCost > 0 && <TextField fullWidth select required={loaded?.partsCost === 0} label="Medio de pago del gasto" value={form.partsCostMethod} disabled={saving || cancelled} onChange={event => field('partsCostMethod', event.target.value as Method | '')} helperText="Sin un medio nuevo, se conserva el del egreso existente."><MenuItem value="">{loaded?.partsCost ? 'Conservar medio actual' : 'Seleccionar medio'}</MenuItem>{methods.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>}
          <CurrencyField fullWidth label="Mano de obra cobrada" value={form.laborCharge} onValueChange={value => field('laborCharge', value)} onEmpty={() => field('laborCharge', 0)} disabled={saving || cancelled} helperText="Forma parte del total al cliente; no es un costo." />
        </>}
        <CurrencyField fullWidth required label="Total al cliente" value={form.total} onValueChange={value => field('total', value)} onEmpty={() => field('total', null)} disabled={saving || cancelled} error={invalidTotal} helperText={invalidTotal ? 'El total al cliente no puede ser menor que el importe ya pagado.' : financial ? `Sugerido: ${formatMoney(suggestedTotal)}. Podés conservar el precio acordado con el cliente.` : undefined} />
        {financial && <>
          <Button size="small" sx={{ alignSelf: 'flex-start' }} disabled={saving || cancelled} onClick={() => field('total', suggestedTotal)}>Usar total sugerido</Button>
          <CurrencyField fullWidth label="Adelanto recibido (opcional)" value={form.advanceAmount} onValueChange={value => field('advanceAmount', value)} onEmpty={() => field('advanceAmount', 0)} disabled={saving || cancelled} helperText="Se corrige el adelanto inicial y su ingreso en Caja. Los otros pagos se conservan." />
          {form.advanceAmount > 0 && <TextField fullWidth required select label="Medio de pago del adelanto" value={form.advanceMethod} onChange={event => field('advanceMethod', event.target.value as Method | '')} disabled={saving || cancelled}><MenuItem value="">Seleccionar medio</MenuItem>{methods.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>}
          <Box role="status" aria-label="Resumen de la reparación" sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}><Stack spacing={1}>
            <Summary label="Ganancia estimada" value={(form.total ?? 0) - form.partsCost - (loaded?.laborCost ?? 0)} color={(form.total ?? 0) - form.partsCost - (loaded?.laborCost ?? 0) < 0 ? 'error.main' : 'success.main'} />
            <Summary label="Pagado resultante" value={resultingPaid} color="success.main" />
            <Summary label="Saldo pendiente" value={Math.max(0, (form.total ?? 0) - resultingPaid)} />
          </Stack></Box>
        </>}
      </FormSection>
      <FormSection legacyHeading legacyDivider title="Observaciones"><TextField fullWidth multiline minRows={3} label="Observaciones (opcional)" value={form.notes} onChange={event => field('notes', event.target.value)} disabled={saving} /></FormSection>
      {loaded?.status === 'delivered' && user?.role === 'OWNER' && <FormSection legacyHeading legacyDivider title="Entrega">
        <Typography variant="body2" color="text.secondary">Si la entrega se registró por error, podés revertirla a «Listo para retirar».</Typography>
        <Button variant="outlined" color="warning" disabled={saving} sx={{ alignSelf: 'flex-start' }} onClick={() => setDeliveryCorrectionOpen(true)}>Corregir entrega</Button>
      </FormSection>}
    </>}
  </FormDrawer><NewClientDrawer open={open && clientDrawerOpen} onClose={() => setClientDrawerOpen(false)} onCreated={created => { setClients(current => [created, ...current.filter(client => client.id !== created.id)]); field('clientId', created.id); setClientDrawerOpen(false) }} /><RepairDeliveryCorrectionDialog repair={open && deliveryCorrectionOpen && loaded?.status === 'delivered' && user?.role === 'OWNER' ? loaded : undefined} onClose={() => setDeliveryCorrectionOpen(false)} onCorrected={updated => { setDeliveryCorrectionOpen(false); (onDeliveryCorrected ?? onUpdated)(updated) }} /></>
}

const Summary = ({ label, value, color }: { label: string; value: number; color?: string }) => <Stack direction="row" justifyContent="space-between" gap={2}><Typography>{label}</Typography><Typography fontWeight={750} color={color}>{formatMoney(value)}</Typography></Stack>

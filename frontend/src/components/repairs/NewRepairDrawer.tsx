import { FormSection } from '../admin/AdminPatterns'
import { useAdminVisual } from '../admin/AdminVisualScope'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Autocomplete, Box, Button, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { createRepair } from '../../services/repairs'
import { getClientOptions, type ClientOption } from '../../services/operations'
import type { Repair, RepairStatus } from '../../types'
import { FormDrawer } from '../common/FormDrawer'
import { CurrencyField } from '../common/CurrencyField'
import { DeviceBrandAvatar, DeviceBrandOption } from '../common/DeviceBrandAvatar'
import { IntegerField } from '../common/IntegerField'
import { deviceBrandOptions, normalizeDeviceBrand, OTHER_DEVICE_BRAND } from '../../config/deviceBrands'
import { NewClientDrawer } from '../clients/NewClientDrawer'
import axios from 'axios'
import { formatMoney } from '../../utils/format'
import { useAuth } from '../../auth/AuthContext'
import { canAccess } from '../../auth/permissions'

const today = () => { const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}` }
const initial = { brand: '', customBrand: '', model: '', imei: '', color: '', issue: '', diagnosis: '', total: null as number | null, partsCost: 0, partsCostMethod: '' as '' | 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER', laborCharge: 0, advanceAmount: 0, advanceMethod: '' as '' | 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER', totalEdited: false, estimatedDeliveryDate: today(), notes: '', status: 'received' as RepairStatus }

export function NewRepairDrawer({ open, initialClientId, onClose, onCreated }: { open: boolean; initialClientId?: string; onClose: () => void; onCreated: (repair: Repair) => void }) {
  const modern = useAdminVisual()
  const { user } = useAuth()
  const canManageFinancials = canAccess(user, 'repairs.viewFinancials')
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientId, setClientId] = useState(initialClientId ?? '')
  const [form, setForm] = useState(initial)
  const [warrantyPreset, setWarrantyPreset] = useState('0')
  const [customWarrantyDays, setCustomWarrantyDays] = useState(30)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [clientDrawerOpen, setClientDrawerOpen] = useState(false)
  useEffect(() => { if (open) void getClientOptions().then(items => { setClients(items); setClientId(initialClientId ?? '') }).catch(() => setError('No pudimos cargar los clientes.')) }, [open, initialClientId])
  const client = useMemo(() => clients.find(item => item.id === clientId) ?? null, [clients, clientId])
  const suggestedTotal = form.partsCost + form.laborCharge
  const estimatedProfit = (form.total ?? 0) - form.partsCost
  const advanceExceedsTotal = form.advanceAmount > (form.total ?? 0)
  const changeCost = (field: 'partsCost' | 'laborCharge', value: number) => setForm(current => {
    const updated = { ...current, [field]: value }
    // Sin costo no hay egreso que mostrar: el medio de pago del gasto deja de aplicar y se limpia.
    const normalized = field === 'partsCost' && value <= 0 ? { ...updated, partsCostMethod: '' as const } : updated
    return { ...normalized, total: current.totalEdited ? current.total : normalized.partsCost + normalized.laborCharge }
  })
  const change = (key: keyof typeof initial) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(current => ({ ...current, [key]: key === 'total' ? Number(event.target.value) : event.target.value }))
  const close = () => { if (!saving) { setError(''); setForm({ ...initial, estimatedDeliveryDate: today() }); setWarrantyPreset('0'); setCustomWarrantyDays(30); setClientDrawerOpen(false); onClose() } }
  const save = async () => {
    const brand = normalizeDeviceBrand(form.brand === OTHER_DEVICE_BRAND ? form.customBrand : form.brand), model = form.model.trim(), issue = form.issue.trim()
    if (!clientId) return setError('Seleccioná un cliente existente.')
    if (!brand) return setError('Elegí una marca de la lista o tocá «Otra» para escribirla.')
    if (!model || !issue) return setError('Completá el modelo y la falla informada.')
    if (form.total == null) return setError('Ingresá un monto')
    if ([form.total, form.partsCost, form.laborCharge, form.advanceAmount].some(value => !Number.isInteger(value) || value < 0 || value > 2_147_483_647)) return setError('Los montos deben ser enteros entre $0 y $2.147.483.647.')
    if (advanceExceedsTotal) return setError('El adelanto no puede superar el total al cliente.')
    if (form.partsCost > 0 && !form.partsCostMethod) return setError('Seleccioná el medio de pago del gasto.')
    if (form.advanceAmount > 0 && !form.advanceMethod) return setError('Seleccioná el medio de pago del adelanto.')
    setSaving(true); setError('')
    try {
      const warrantyDurationDays = warrantyPreset === 'custom' ? customWarrantyDays : Number(warrantyPreset)
      const repair = await createRepair({ clientId, deviceBrand: brand, deviceModel: model, imei: form.imei.trim() || undefined, color: form.color.trim() || undefined, issue, diagnosis: form.diagnosis.trim() || undefined, notes: form.notes.trim() || undefined, total: form.total, partsCost: form.partsCost, partsCostMethod: form.partsCost > 0 ? form.partsCostMethod || undefined : undefined, laborCharge: form.laborCharge, advanceAmount: form.advanceAmount, advanceMethod: form.advanceAmount > 0 ? form.advanceMethod || undefined : undefined, estimatedDeliveryDate: form.estimatedDeliveryDate || undefined, status: form.status, warrantyEnabled: warrantyDurationDays > 0, warrantyDurationDays: warrantyDurationDays > 0 ? warrantyDurationDays : undefined })
      setForm(initial); onCreated(repair)
    } catch (saveError) { setError(axios.isAxiosError<{ message?: string }>(saveError) ? saveError.response?.data?.message ?? 'No pudimos crear la reparación.' : 'No pudimos crear la reparación. Revisá los datos e intentá nuevamente.') } finally { setSaving(false) }
  }
  return <><FormDrawer open={open && !clientDrawerOpen} eyebrow="NUEVO INGRESO" title="Nueva reparación" saving={saving} submitLabel="Crear reparación" onClose={close} onSubmit={() => void save()}>
        {error && <Alert severity="error">{error}</Alert>}
        <FormSection title="Cliente"><Box data-tutorial="repair-form" display="grid" gap={2.2}>{!modern && <Typography variant="h2">Cliente</Typography>}
        <Autocomplete options={clients} value={client} onChange={(_, value) => setClientId(value?.id ?? '')} getOptionLabel={option => `${option.name}${option.phone ? ` · ${option.phone}` : ''}`} filterOptions={(options, state) => options.filter(option => `${option.name} ${option.phone ?? ''}`.toLowerCase().includes(state.inputValue.toLowerCase()))} noOptionsText="No encontramos ese cliente. Crealo primero desde Clientes." renderInput={params => <TextField {...params} required label="Buscar cliente..." placeholder="Nombre, apellido o teléfono"/>}/>
        <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setClientDrawerOpen(true)}>+ Crear cliente</Button></Box></FormSection>
        <FormSection legacyHeading legacyDivider title="Dispositivo" description="Datos para identificar el equipo que ingresa.">
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Autocomplete fullWidth options={deviceBrandOptions} value={form.brand || null} onChange={(_, value) => setForm(current => ({ ...current, brand: value ?? '', customBrand: value === OTHER_DEVICE_BRAND ? current.customBrand : '' }))} noOptionsText="Elegí «Otra» para escribir una marca distinta." renderOption={(props, option) => <DeviceBrandOption key={option} option={option} optionProps={props} />} renderInput={params => <TextField {...params} required label="Marca" placeholder="Samsung, Apple, Motorola…" InputProps={{ ...params.InputProps, startAdornment: form.brand ? <InputAdornment position="start"><DeviceBrandAvatar brand={form.brand} size={20} /></InputAdornment> : params.InputProps.startAdornment }}/>}/><TextField fullWidth required label="Modelo" value={form.model} onChange={change('model')} inputProps={{ maxLength: 100 }}/></Stack>
        {form.brand === OTHER_DEVICE_BRAND && <TextField fullWidth required autoFocus label="Otra marca" value={form.customBrand} onChange={change('customBrand')} inputProps={{ maxLength: 60 }} helperText="Escribí el nombre de la marca tal como querés guardarlo."/>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField fullWidth label="IMEI (opcional)" value={form.imei} onChange={change('imei')} inputProps={{ maxLength: 32 }}/><TextField fullWidth label="Color (opcional)" value={form.color} onChange={change('color')} inputProps={{ maxLength: 60 }}/></Stack>
        </FormSection><FormSection legacyHeading legacyDivider title={modern ? 'Reparación y presupuesto' : 'Reparación'}>
        <TextField required multiline minRows={3} label="Falla informada" value={form.issue} onChange={change('issue')}/><TextField multiline minRows={2} label="Diagnóstico (opcional)" value={form.diagnosis} onChange={change('diagnosis')}/>
        <TextField fullWidth type="date" label="Fecha estimada" value={form.estimatedDeliveryDate} onChange={change('estimatedDeliveryDate')} InputLabelProps={{ shrink: true }}/>
        <TextField select label="Estado inicial" value={form.status} onChange={change('status')}>{[['received','Recibido'],['review','En revisión'],['budget','Presupuesto informado'],['approved','Presupuesto aceptado'],['repairing','En reparación']].map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
        </FormSection><FormSection legacyHeading legacyDivider title="Costos y cobro">
        {canManageFinancials && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <CurrencyField fullWidth label="Costo / gasto de la reparación" value={form.partsCost} onValueChange={value => changeCost('partsCost', value)} onEmpty={() => changeCost('partsCost', 0)} helperText="Se registra como egreso en Caja al crear la reparación." />
          <CurrencyField fullWidth label="Mano de obra cobrada" value={form.laborCharge} onValueChange={value => changeCost('laborCharge', value)} onEmpty={() => changeCost('laborCharge', 0)} helperText="Forma parte del total al cliente; no es un costo." />
        </Stack>}
        {canManageFinancials && form.partsCost > 0 && <TextField required select fullWidth label="Medio de pago del gasto" value={form.partsCostMethod} onChange={event => setForm(current => ({ ...current, partsCostMethod: event.target.value as typeof current.partsCostMethod }))} error={Boolean(error) && !form.partsCostMethod} helperText="Es el egreso de Caja, independiente del medio de pago del adelanto.">
          <MenuItem value="CASH">Efectivo</MenuItem><MenuItem value="TRANSFER">Transferencia</MenuItem><MenuItem value="CARD">Tarjeta</MenuItem><MenuItem value="OTHER">Otro</MenuItem>
        </TextField>}
        <CurrencyField required fullWidth label="Total al cliente" value={form.total} onValueChange={value => setForm(current => ({ ...current, total: value, totalEdited: true }))} onEmpty={() => setForm(current => ({ ...current, total: null, totalEdited: true }))} error={Boolean(error) && form.total == null} helperText={canManageFinancials ? `Sugerido: ${formatMoney(suggestedTotal)}. Podés editarlo para aplicar descuentos o ajustes.` : undefined} />
        {canManageFinancials && <>
        {form.totalEdited && <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setForm(current => ({ ...current, total: suggestedTotal, totalEdited: false }))}>Usar total sugerido</Button>}
        <CurrencyField fullWidth label="Adelanto recibido (opcional)" value={form.advanceAmount} onValueChange={value => setForm(current => ({ ...current, advanceAmount: value }))} onEmpty={() => setForm(current => ({ ...current, advanceAmount: 0 }))} error={advanceExceedsTotal} helperText={advanceExceedsTotal ? 'El adelanto no puede superar el total al cliente.' : 'Dejalo en $0 si todavía no recibiste un pago.'} />
        {form.advanceAmount > 0 && <TextField required select label="Medio de pago del adelanto" value={form.advanceMethod} onChange={event => setForm(current => ({ ...current, advanceMethod: event.target.value as typeof current.advanceMethod }))} error={Boolean(error) && !form.advanceMethod}>
          <MenuItem value="CASH">Efectivo</MenuItem><MenuItem value="TRANSFER">Transferencia</MenuItem><MenuItem value="CARD">Tarjeta</MenuItem><MenuItem value="OTHER">Otro</MenuItem>
        </TextField>}
        <Box role="status" aria-label="Resumen de la reparación" sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Stack spacing={1}>
            <Stack direction="row" justifyContent="space-between" gap={2}><Typography>Ganancia estimada</Typography><Typography fontWeight={750} color={estimatedProfit < 0 ? 'warning.main' : 'success.main'}>{formatMoney(estimatedProfit)}</Typography></Stack>
            <Stack direction="row" justifyContent="space-between" gap={2}><Typography>Adelanto</Typography><Typography fontWeight={750}>{formatMoney(form.advanceAmount)}</Typography></Stack>
            <Stack direction="row" justifyContent="space-between" gap={2}><Typography>Saldo pendiente</Typography><Typography fontWeight={750}>{formatMoney(Math.max(0, (form.total ?? 0) - form.advanceAmount))}</Typography></Stack>
          </Stack>
        </Box>
        </>}
        </FormSection><FormSection legacyHeading legacyDivider title={modern ? 'Garantía y observaciones' : 'Garantía'}>
        <TextField select label="Duración de la garantía" value={warrantyPreset} onChange={event => setWarrantyPreset(event.target.value)} helperText="La garantía comienza automáticamente al marcar la reparación como Entregada."><MenuItem value="0">Sin garantía</MenuItem>{[7,15,30,60,90].map(days => <MenuItem key={days} value={String(days)}>{days} días</MenuItem>)}<MenuItem value="custom">Personalizada</MenuItem></TextField>
        {warrantyPreset === 'custom' && <IntegerField
          label="Días de garantía"
          value={customWarrantyDays}
          onValueChange={setCustomWarrantyDays}
          min={1}
          max={365}
        />}
        <TextField multiline minRows={3} label="Observaciones (opcional)" value={form.notes} onChange={change('notes')}/>
  </FormSection></FormDrawer><NewClientDrawer open={clientDrawerOpen} onClose={() => setClientDrawerOpen(false)} onCreated={created => { setClients(current => [created, ...current.filter(item => item.id !== created.id)]); setClientId(created.id); setClientDrawerOpen(false) }} /></>
}

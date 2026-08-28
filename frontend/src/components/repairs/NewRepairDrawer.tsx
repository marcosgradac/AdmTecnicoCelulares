import { useEffect, useMemo, useState } from 'react'
import { Alert, Autocomplete, Box, Button, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { createRepair } from '../../services/repairs'
import { getClientOptions, type ClientOption } from '../../services/operations'
import type { Repair, RepairStatus } from '../../types'
import { FormDrawer } from '../common/FormDrawer'
import { CurrencyField } from '../common/CurrencyField'
import { IntegerField } from '../common/IntegerField'
import { NewClientDrawer } from '../clients/NewClientDrawer'

const today = () => { const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}` }
const initial = { brand: '', model: '', imei: '', color: '', issue: '', diagnosis: '', total: null as number | null, estimatedDeliveryDate: today(), notes: '', status: 'received' as RepairStatus }

export function NewRepairDrawer({ open, initialClientId, onClose, onCreated }: { open: boolean; initialClientId?: string; onClose: () => void; onCreated: (repair: Repair) => void }) {
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
  const change = (key: keyof typeof initial) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(current => ({ ...current, [key]: key === 'total' ? Number(event.target.value) : event.target.value }))
  const close = () => { if (!saving) { setError(''); setForm({ ...initial, estimatedDeliveryDate: today() }); setWarrantyPreset('0'); setCustomWarrantyDays(30); setClientDrawerOpen(false); onClose() } }
  const save = async () => {
    const brand = form.brand.trim(), model = form.model.trim(), issue = form.issue.trim()
    if (!clientId) return setError('Seleccioná un cliente existente.')
    if (!brand || !model || !issue) return setError('Completá marca, modelo y falla informada.')
    if (form.total == null) return setError('Ingresá un monto')
    setSaving(true); setError('')
    try {
      const warrantyDurationDays = warrantyPreset === 'custom' ? customWarrantyDays : Number(warrantyPreset)
      const repair = await createRepair({ clientId, deviceBrand: brand, deviceModel: model, imei: form.imei.trim() || undefined, color: form.color.trim() || undefined, issue, diagnosis: form.diagnosis.trim() || undefined, notes: form.notes.trim() || undefined, total: form.total, estimatedDeliveryDate: form.estimatedDeliveryDate || undefined, status: form.status, warrantyEnabled: warrantyDurationDays > 0, warrantyDurationDays: warrantyDurationDays > 0 ? warrantyDurationDays : undefined })
      setForm(initial); onCreated(repair)
    } catch { setError('No pudimos crear la reparación. Revisá los datos e intentá nuevamente.') } finally { setSaving(false) }
  }
  return <><FormDrawer open={open && !clientDrawerOpen} eyebrow="NUEVO INGRESO" title="Nueva reparación" saving={saving} submitLabel="Crear reparación" onClose={close} onSubmit={() => void save()}>
        {error && <Alert severity="error">{error}</Alert>}
        <Box data-tutorial="repair-form" display="grid" gap={2.2}><Typography variant="h2">Cliente</Typography>
        <Autocomplete options={clients} value={client} onChange={(_, value) => setClientId(value?.id ?? '')} getOptionLabel={option => `${option.name}${option.phone ? ` · ${option.phone}` : ''}`} filterOptions={(options, state) => options.filter(option => `${option.name} ${option.phone ?? ''}`.toLowerCase().includes(state.inputValue.toLowerCase()))} noOptionsText="No encontramos ese cliente. Crealo primero desde Clientes." renderInput={params => <TextField {...params} required label="Buscar cliente..." placeholder="Nombre, apellido o teléfono"/>}/>
        <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setClientDrawerOpen(true)}>+ Crear cliente</Button></Box>
        <Divider/><Typography variant="h2">Dispositivo</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField fullWidth required label="Marca" value={form.brand} onChange={change('brand')} inputProps={{ maxLength: 60 }}/><TextField fullWidth required label="Modelo" value={form.model} onChange={change('model')} inputProps={{ maxLength: 100 }}/></Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField fullWidth label="IMEI (opcional)" value={form.imei} onChange={change('imei')} inputProps={{ maxLength: 32 }}/><TextField fullWidth label="Color (opcional)" value={form.color} onChange={change('color')} inputProps={{ maxLength: 60 }}/></Stack>
        <Divider/><Typography variant="h2">Reparación</Typography>
        <TextField required multiline minRows={3} label="Falla informada" value={form.issue} onChange={change('issue')}/><TextField multiline minRows={2} label="Diagnóstico (opcional)" value={form.diagnosis} onChange={change('diagnosis')}/>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><CurrencyField required fullWidth label="Presupuesto / precio" value={form.total} onValueChange={value=>setForm(current=>({...current,total:value}))} onEmpty={()=>setForm(current=>({...current,total:null}))} error={Boolean(error) && form.total == null} helperText={Boolean(error) && form.total == null ? 'Ingresá un monto' : undefined}/><TextField fullWidth type="date" label="Fecha estimada" value={form.estimatedDeliveryDate} onChange={change('estimatedDeliveryDate')} InputLabelProps={{ shrink: true }}/></Stack>
        <TextField select label="Estado inicial" value={form.status} onChange={change('status')}>{[['received','Recibido'],['review','En revisión'],['budget','Presupuesto informado'],['approved','Presupuesto aceptado'],['repairing','En reparación']].map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
        <Divider/><Typography variant="h2">Garantía</Typography>
        <TextField select label="Duración de la garantía" value={warrantyPreset} onChange={event => setWarrantyPreset(event.target.value)} helperText="La garantía comienza automáticamente al marcar la reparación como Entregada."><MenuItem value="0">Sin garantía</MenuItem>{[7,15,30,60,90].map(days => <MenuItem key={days} value={String(days)}>{days} días</MenuItem>)}<MenuItem value="custom">Personalizada</MenuItem></TextField>
        {warrantyPreset === 'custom' && <IntegerField
          label="Días de garantía"
          value={customWarrantyDays}
          onValueChange={setCustomWarrantyDays}
          min={1}
          max={365}
        />}
        <TextField multiline minRows={3} label="Observaciones (opcional)" value={form.notes} onChange={change('notes')}/>
  </FormDrawer><NewClientDrawer open={clientDrawerOpen} onClose={() => setClientDrawerOpen(false)} onCreated={created => { setClients(current => [created, ...current.filter(item => item.id !== created.id)]); setClientId(created.id); setClientDrawerOpen(false) }} /></>
}

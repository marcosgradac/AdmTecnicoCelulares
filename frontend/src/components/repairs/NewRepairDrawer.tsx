import { useEffect, useMemo, useState } from 'react'
import { Alert, Autocomplete, Box, Button, Divider, Drawer, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { CloseRounded } from '@mui/icons-material'
import { createRepair } from '../../services/repairs'
import { getClients, type ClientRecord } from '../../services/operations'
import type { Repair, RepairStatus } from '../../types'

const initial = { brand: '', model: '', imei: '', color: '', issue: '', diagnosis: '', total: 0, estimatedDeliveryDate: '', notes: '', status: 'received' as RepairStatus }

export function NewRepairDrawer({ open, initialClientId, onClose, onCreated }: { open: boolean; initialClientId?: string; onClose: () => void; onCreated: (repair: Repair) => void }) {
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [clientId, setClientId] = useState(initialClientId ?? '')
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (open) void getClients().then(items => { setClients(items); setClientId(initialClientId ?? '') }).catch(() => setError('No pudimos cargar los clientes.')) }, [open, initialClientId])
  const client = useMemo(() => clients.find(item => item.id === clientId) ?? null, [clients, clientId])
  const change = (key: keyof typeof initial) => (event: React.ChangeEvent<HTMLInputElement>) => setForm(current => ({ ...current, [key]: key === 'total' ? Number(event.target.value) : event.target.value }))
  const close = () => { if (!saving) { setError(''); setForm(initial); onClose() } }
  const save = async () => {
    const brand = form.brand.trim(), model = form.model.trim(), issue = form.issue.trim()
    if (!clientId) return setError('Seleccioná un cliente existente.')
    if (!brand || !model || !issue) return setError('Completá marca, modelo y falla informada.')
    setSaving(true); setError('')
    try {
      const repair = await createRepair({ clientId, deviceBrand: brand, deviceModel: model, imei: form.imei.trim() || undefined, color: form.color.trim() || undefined, issue, diagnosis: form.diagnosis.trim() || undefined, notes: form.notes.trim() || undefined, total: form.total, estimatedDeliveryDate: form.estimatedDeliveryDate || undefined, status: form.status })
      setForm(initial); onCreated(repair)
    } catch { setError('No pudimos crear la reparación. Revisá los datos e intentá nuevamente.') } finally { setSaving(false) }
  }
  return <Drawer anchor="right" open={open} onClose={close} PaperProps={{ sx: { width: { xs: '100%', sm: 560, md: 620 }, maxWidth: '100vw' } }}>
    <Box display="flex" flexDirection="column" height="100%" minWidth={0}>
      <Stack direction="row" alignItems="center" px={{ xs: 2, sm: 3 }} py={2}><Box flex={1}><Typography variant="overline" color="primary.main">NUEVO INGRESO</Typography><Typography variant="h1" fontSize={28}>Nueva reparación</Typography></Box><IconButton aria-label="Cerrar" onClick={close}><CloseRounded/></IconButton></Stack><Divider/>
      <Stack spacing={2.2} px={{ xs: 2, sm: 3 }} py={2.5} sx={{ overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography variant="h2">Cliente</Typography>
        <Autocomplete options={clients} value={client} onChange={(_, value) => setClientId(value?.id ?? '')} getOptionLabel={option => `${option.name}${option.phone ? ` · ${option.phone}` : ''}`} filterOptions={(options, state) => options.filter(option => `${option.name} ${option.phone ?? ''}`.toLowerCase().includes(state.inputValue.toLowerCase()))} noOptionsText="No encontramos ese cliente. Crealo primero desde Clientes." renderInput={params => <TextField {...params} required label="Buscar cliente..." placeholder="Nombre, apellido o teléfono"/>}/>
        <Divider/><Typography variant="h2">Dispositivo</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField fullWidth required label="Marca" value={form.brand} onChange={change('brand')} inputProps={{ maxLength: 60 }}/><TextField fullWidth required label="Modelo" value={form.model} onChange={change('model')} inputProps={{ maxLength: 100 }}/></Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField fullWidth label="IMEI (opcional)" value={form.imei} onChange={change('imei')} inputProps={{ maxLength: 32 }}/><TextField fullWidth label="Color (opcional)" value={form.color} onChange={change('color')} inputProps={{ maxLength: 60 }}/></Stack>
        <Divider/><Typography variant="h2">Reparación</Typography>
        <TextField required multiline minRows={3} label="Falla informada" value={form.issue} onChange={change('issue')}/><TextField multiline minRows={2} label="Diagnóstico (opcional)" value={form.diagnosis} onChange={change('diagnosis')}/>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField fullWidth type="number" label="Presupuesto / precio" value={form.total} onChange={change('total')} inputProps={{ min: 0 }}/><TextField fullWidth type="date" label="Fecha estimada" value={form.estimatedDeliveryDate} onChange={change('estimatedDeliveryDate')} InputLabelProps={{ shrink: true }}/></Stack>
        <TextField select label="Estado inicial" value={form.status} onChange={change('status')}>{[['received','Recibido'],['review','En revisión'],['budget','Presupuesto informado'],['approved','Presupuesto aceptado'],['repairing','En reparación']].map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
        <TextField multiline minRows={3} label="Observaciones (opcional)" value={form.notes} onChange={change('notes')}/>
      </Stack><Divider/><Stack direction="row" justifyContent="flex-end" spacing={1.5} px={{ xs: 2, sm: 3 }} py={2}><Button onClick={close}>Cancelar</Button><Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? 'Creando…' : 'Crear reparación'}</Button></Stack>
    </Box>
  </Drawer>
}

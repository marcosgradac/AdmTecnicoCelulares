import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, Grid, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { ArrowBackRounded, DevicesRounded, PersonRounded, SaveRounded } from '@mui/icons-material'
import { createRepair } from '../services/repairs'
import { PageHeader } from '../components/common/PageHeader'

type FormValues = { clientId?: string; clientName: string; phone: string; brand: string; model: string; imei: string; issue: string; observations: string; total: number }

export function NewRepairPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [values, setValues] = useState<FormValues>(() => ({
    clientId: searchParams.get('clientId') ?? undefined,
    clientName: searchParams.get('clientName') ?? '',
    phone: searchParams.get('phone') ?? '',
    brand: 'Apple', model: '', imei: '', issue: '', observations: '', total: 0,
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const change = (key: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement>) => setValues(current => ({ ...current, [key]: key === 'total' ? Number(event.target.value) : event.target.value }))
  const save = async () => {
    if (!values.clientName.trim() || !values.model.trim() || !values.issue.trim()) { setError('Completá cliente, modelo y problema reportado.'); return }
    setSaving(true); setError('')
    try {
      const repair = await createRepair({ clientId: values.clientId, clientName: values.clientName, phone: values.phone || undefined, deviceBrand: values.brand, deviceModel: values.model, imei: values.imei || undefined, issue: values.issue, notes: values.observations || undefined, total: Number(values.total || 0) })
      navigate(`/reparaciones/${repair.id}`)
    } catch { setError('No pudimos guardar la reparación. Revisá la conexión e intentá nuevamente.') } finally { setSaving(false) }
  }
  return <Box>
    <Button startIcon={<ArrowBackRounded />} onClick={() => navigate(values.clientId ? `/clientes/${values.clientId}` : '/reparaciones')} sx={{ mb: 1 }}>Volver</Button>
    <PageHeader eyebrow="NUEVO INGRESO" title="Nueva reparación" description="Registrá al cliente, el equipo y el problema de forma ordenada." />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {values.clientId && <Alert severity="info" sx={{ mb: 2 }}>La reparación se asociará al cliente existente {values.clientName}.</Alert>}
    <Stack spacing={2}>
      <Card><CardContent><Stack direction="row" gap={1.2} alignItems="center" mb={2.5}><PersonRounded color="primary"/><Box><Typography variant="h2">1. Cliente</Typography><Typography variant="body2" color="text.secondary">Datos de contacto para el seguimiento</Typography></Box></Stack><Grid container spacing={2}><Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth disabled={Boolean(values.clientId)} label="Nombre completo" value={values.clientName} onChange={change('clientName')} /></Grid><Grid size={{ xs: 12, md: 6 }}><TextField fullWidth disabled={Boolean(values.clientId)} label="WhatsApp / teléfono" value={values.phone} onChange={change('phone')} /></Grid></Grid></CardContent></Card>
      <Card><CardContent><Stack direction="row" gap={1.2} alignItems="center" mb={2.5}><DevicesRounded color="primary"/><Box><Typography variant="h2">2. Equipo</Typography><Typography variant="body2" color="text.secondary">Identificación del dispositivo recibido</Typography></Box></Stack><Grid container spacing={2}><Grid size={{ xs: 12, md: 4 }}><TextField select fullWidth label="Marca" value={values.brand} onChange={change('brand')}>{['Apple','Samsung','Motorola','Xiaomi','Otro'].map(brand => <MenuItem value={brand} key={brand}>{brand}</MenuItem>)}</TextField></Grid><Grid size={{ xs: 12, md: 4 }}><TextField required fullWidth label="Modelo" value={values.model} onChange={change('model')} /></Grid><Grid size={{ xs: 12, md: 4 }}><TextField fullWidth label="IMEI / número de serie" value={values.imei} onChange={change('imei')} /></Grid></Grid></CardContent></Card>
      <Card><CardContent><Typography variant="h2" mb={0.5}>3. Problema y diagnóstico inicial</Typography><Typography variant="body2" color="text.secondary" mb={2.5}>Dejá asentado el motivo del ingreso y el estado físico</Typography><Grid container spacing={2}><Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth multiline minRows={4} label="Problema reportado" value={values.issue} onChange={change('issue')} /></Grid><Grid size={{ xs: 12, md: 6 }}><TextField fullWidth multiline minRows={4} label="Observaciones / accesorios" value={values.observations} onChange={change('observations')} /></Grid></Grid></CardContent></Card>
      <Card><CardContent><Typography variant="h2" mb={0.5}>4. Presupuesto inicial</Typography><Typography variant="body2" color="text.secondary" mb={2.5}>Podés dejarlo en cero si el equipo todavía requiere revisión</Typography><TextField type="number" label="Monto estimado" value={values.total} onChange={change('total')} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} /></CardContent></Card>
      <Stack direction={{ xs: 'column-reverse', sm: 'row' }} justifyContent="flex-end" gap={1.5}><Button onClick={() => navigate(values.clientId ? `/clientes/${values.clientId}` : '/reparaciones')}>Cancelar</Button><Button variant="contained" startIcon={<SaveRounded />} disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar reparación'}</Button></Stack>
    </Stack>
  </Box>
}

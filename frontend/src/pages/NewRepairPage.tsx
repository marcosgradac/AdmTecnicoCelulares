import { useState, type ChangeEvent, type ComponentProps, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, Grid, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { ArrowBackRounded, DevicesRounded, PersonRounded, SaveRounded } from '@mui/icons-material'
import { createRepair } from '../services/repairs'
import { PageHeader } from '../components/common/PageHeader'

type FormValues = {
  clientId?: string; clientName: string; phone: string; whatsapp: string
  brand: string; model: string; imei: string; color: string; accessCode: string
  issue: string; physicalCondition: string; accessories: string; observations: string
  service: string; part: string; cost: number; total: number; estimatedTime: string
}

export function NewRepairPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [values, setValues] = useState<FormValues>({
    clientId: params.get('clientId') ?? undefined, clientName: params.get('clientName') ?? '', phone: params.get('phone') ?? '', whatsapp: '',
    brand: 'Apple', model: '', imei: '', color: '', accessCode: '', issue: '', physicalCondition: '', accessories: '', observations: '',
    service: '', part: '', cost: 0, total: 0, estimatedTime: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const change = (key: keyof FormValues) => (event: ChangeEvent<HTMLInputElement>) => setValues(current => ({ ...current, [key]: key === 'cost' || key === 'total' ? Number(event.target.value) : event.target.value }))
  const back = () => navigate(values.clientId ? `/clientes/${values.clientId}` : '/reparaciones')
  const save = async () => {
    if (!values.clientName.trim() || !values.model.trim() || !values.issue.trim()) return setError('Completá cliente, modelo y falla indicada.')
    setSaving(true); setError('')
    try {
      const notes = [`Estado físico: ${values.physicalCondition}`, `Accesorios: ${values.accessories}`, `Servicio: ${values.service}`, `Repuesto: ${values.part}`, `Tiempo estimado: ${values.estimatedTime}`, values.observations].filter(value => !value.endsWith(': ') && value).join('\n')
      const repair = await createRepair({ clientId: values.clientId, clientName: values.clientName, phone: values.whatsapp || values.phone || undefined, deviceBrand: values.brand, deviceModel: values.model, imei: values.imei || undefined, color: values.color || undefined, issue: values.issue, notes: notes || undefined, total: values.total })
      navigate(`/reparaciones/${repair.id}`)
    } catch { setError('No pudimos guardar la reparación. Revisá la conexión e intentá nuevamente.') } finally { setSaving(false) }
  }
  return <Box>
    <Button startIcon={<ArrowBackRounded />} onClick={back} sx={{ mb: 1 }}>Volver</Button>
    <PageHeader eyebrow="NUEVO INGRESO" title="Nueva reparación" description="Registrá al cliente, el equipo y el problema de forma ordenada." />
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {values.clientId && <Alert severity="info" sx={{ mb: 2 }}>La reparación se asociará al cliente existente {values.clientName}.</Alert>}
    <Stack spacing={2}>
      <Section icon={<PersonRounded color="primary" />} title="1. Cliente" subtitle="Datos de contacto para el seguimiento"><Grid container spacing={2}>
        <Field required label="Nombre y apellido" value={values.clientName} onChange={change('clientName')} disabled={Boolean(values.clientId)} />
        <Field label="Teléfono" value={values.phone} onChange={change('phone')} disabled={Boolean(values.clientId)} />
        <Field label="WhatsApp" value={values.whatsapp} onChange={change('whatsapp')} disabled={Boolean(values.clientId)} />
      </Grid></Section>
      <Section icon={<DevicesRounded color="primary" />} title="2. Equipo" subtitle="Identificación del dispositivo recibido"><Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}><TextField select fullWidth label="Marca" value={values.brand} onChange={change('brand')}>{['Apple','Samsung','Motorola','Xiaomi','Otro'].map(brand => <MenuItem value={brand} key={brand}>{brand}</MenuItem>)}</TextField></Grid>
        <Field required label="Modelo" value={values.model} onChange={change('model')} /><Field label="IMEI / número de serie" value={values.imei} onChange={change('imei')} />
        <Field label="Color" value={values.color} onChange={change('color')} /><Field type="password" label="PIN o patrón (opcional)" value={values.accessCode} onChange={change('accessCode')} helperText="El valor se mantiene oculto." />
      </Grid></Section>
      <Section title="3. Falla e ingreso" subtitle="Estado del equipo al momento de recibirlo"><Grid container spacing={2}>
        <Field required multiline label="Falla indicada por el cliente" value={values.issue} onChange={change('issue')} /><Field multiline label="Estado físico" value={values.physicalCondition} onChange={change('physicalCondition')} />
        <Field label="Accesorios entregados" value={values.accessories} onChange={change('accessories')} /><Field label="Observaciones" value={values.observations} onChange={change('observations')} />
        <Grid size={{ xs: 12 }}><Button component="label" variant="outlined">Agregar fotografías<input hidden multiple accept="image/*" type="file" /></Button></Grid>
      </Grid></Section>
      <Section title="4. Presupuesto" subtitle="Servicio, repuesto y valores estimados"><Grid container spacing={2}>
        <Field label="Servicio" value={values.service} onChange={change('service')} /><Field label="Repuesto" value={values.part} onChange={change('part')} />
        <MoneyField label="Costo" value={values.cost} onChange={change('cost')} /><MoneyField label="Precio final" value={values.total} onChange={change('total')} /><Field label="Tiempo estimado" value={values.estimatedTime} onChange={change('estimatedTime')} />
      </Grid></Section>
      <Section title="5. Confirmación" subtitle="Revisá los datos antes de guardar. El seguimiento público se habilitará en la próxima etapa." />
      <Stack direction={{ xs: 'column-reverse', sm: 'row' }} justifyContent="flex-end" gap={1.5}><Button onClick={back}>Cancelar</Button><Button variant="contained" startIcon={<SaveRounded />} disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar reparación'}</Button></Stack>
    </Stack>
  </Box>
}

function Section({ icon, title, subtitle, children }: { icon?: ReactNode; title: string; subtitle: string; children?: ReactNode }) {
  return <Card><CardContent><Stack direction="row" gap={1.2} alignItems="center" mb={children ? 2.5 : 0}>{icon}<Box><Typography variant="h2">{title}</Typography><Typography variant="body2" color="text.secondary">{subtitle}</Typography></Box></Stack>{children}</CardContent></Card>
}
function Field(props: ComponentProps<typeof TextField>) { return <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth minRows={3} {...props} /></Grid> }
function MoneyField(props: ComponentProps<typeof TextField>) { return <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth type="number" InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} {...props} /></Grid> }

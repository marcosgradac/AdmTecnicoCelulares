import { useEffect, useState } from 'react'
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material'
import { FormSection } from '../../../components/admin/AdminPatterns'
import { getBillingSettings, getServiceSettings, saveBillingSettings, saveServiceSettings, type BillingSettings, type BillingSettingsInput, type ServiceSettings } from '../platformAdmin.api'
import { usePlatformAction, usePlatformResource } from '../platformAdmin.hooks'
import { PlatformError, PlatformLoading } from '../platformAdmin.shared'

const valueInRange = (value: number) => Number.isInteger(value) && value >= 0 && value <= 60

const Feedback = ({ message, error, onClose }: { message: string; error: string; onClose: () => void }) => <>
  {message && <Alert severity="success" onClose={onClose}>{message}</Alert>}
  {error && <Alert severity="error" onClose={onClose}>{error}</Alert>}
</>

function ServiceSettingsCard() {
  const settings = usePlatformResource(getServiceSettings, 'service-settings')
  const action = usePlatformAction()
  const [form, setForm] = useState<ServiceSettings>({ expirationWarningDays: 7, defaultGraceDays: 5 })
  const [snapshot, setSnapshot] = useState<ServiceSettings | null>(null)
  useEffect(() => {
    if (!settings.data) return
    const value = { expirationWarningDays: settings.data.expirationWarningDays, defaultGraceDays: settings.data.defaultGraceDays }
    setForm(value); setSnapshot(value)
  }, [settings.data])
  if (settings.loading && !settings.data) return <PlatformLoading label="Cargando la configuración de servicio…" />
  if (settings.error) return <PlatformError message={settings.error} onRetry={settings.reload} />
  const dirty = snapshot !== null && (form.expirationWarningDays !== snapshot.expirationWarningDays || form.defaultGraceDays !== snapshot.defaultGraceDays)
  const invalid = !valueInRange(form.expirationWarningDays) || !valueInRange(form.defaultGraceDays)
  const save = async () => {
    const done = await action.run(() => saveServiceSettings(form), 'Configuración de servicio guardada.')
    if (done) setSnapshot(form)
  }
  return <FormSection title="Servicio" description="Define con cuánta anticipación avisamos del vencimiento y cuántos días de gracia tienen los negocios por defecto. Los cambios se guardan sólo al confirmar.">
    <Feedback message={action.message} error={action.error} onClose={action.clear} />
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField type="number" label="Avisar antes del vencimiento (días)" value={form.expirationWarningDays} onChange={event => setForm(current => ({ ...current, expirationWarningDays: Number(event.target.value) }))} error={!valueInRange(form.expirationWarningDays)} helperText="Entre 0 y 60 días." inputProps={{ min: 0, max: 60 }} fullWidth />
      <TextField type="number" label="Días de gracia por defecto" value={form.defaultGraceDays} onChange={event => setForm(current => ({ ...current, defaultGraceDays: Number(event.target.value) }))} error={!valueInRange(form.defaultGraceDays)} helperText="Se aplican salvo que el negocio tenga un valor propio." inputProps={{ min: 0, max: 60 }} fullWidth />
    </Stack>
    <Stack direction="row" gap={1} flexWrap="wrap">
      <Button variant="contained" disabled={!dirty || invalid || action.saving} onClick={() => void save()}>{action.saving ? 'Guardando…' : 'Guardar cambios'}</Button>
      {dirty && <Button disabled={action.saving} onClick={() => { if (snapshot) setForm(snapshot); action.clear() }}>Descartar cambios</Button>}
      {dirty && <Typography variant="caption" color="text.secondary" alignSelf="center">Tenés cambios sin guardar.</Typography>}
    </Stack>
  </FormSection>
}

type BillingFieldKey = Exclude<keyof BillingSettingsInput, 'additionalText'>
const billingFields: Array<{ key: BillingFieldKey; label: string; min: number; helper: string }> = [
  { key: 'holderName', label: 'Titular de la cuenta', min: 2, helper: 'Nombre completo o razón social del titular.' },
  { key: 'bankName', label: 'Banco', min: 2, helper: 'Entidad donde está la cuenta.' },
  { key: 'alias', label: 'Alias', min: 3, helper: 'Alias que usa el negocio para transferir.' },
  { key: 'cbuCvu', label: 'CBU / CVU', min: 6, helper: 'Dato de la cuenta que recibe las transferencias.' },
  { key: 'taxId', label: 'CUIT', min: 6, helper: 'CUIT del titular de la cuenta.' },
]
const emptyBilling: BillingSettingsInput = { holderName: '', bankName: '', alias: '', cbuCvu: '', taxId: '', additionalText: '' }
const toBillingForm = (value: BillingSettings | null): BillingSettingsInput => ({
  holderName: value?.holderName ?? '', bankName: value?.bankName ?? '', alias: value?.alias ?? '',
  cbuCvu: value?.cbuCvu ?? '', taxId: value?.taxId ?? '', additionalText: value?.additionalText ?? '',
})

function BillingSettingsCard() {
  const settings = usePlatformResource(getBillingSettings, 'billing-settings')
  const action = usePlatformAction()
  const [form, setForm] = useState<BillingSettingsInput>(emptyBilling)
  const [snapshot, setSnapshot] = useState<BillingSettingsInput | null>(null)
  useEffect(() => {
    if (settings.loading) return
    const value = toBillingForm(settings.data)
    setForm(value); setSnapshot(value)
  }, [settings.data, settings.loading])
  if (settings.loading && !settings.data) return <PlatformLoading label="Cargando los datos de cobro…" />
  if (settings.error) return <PlatformError message={settings.error} onRetry={settings.reload} />
  const dirty = snapshot !== null && JSON.stringify(form) !== JSON.stringify(snapshot)
  const missing = billingFields.filter(field => form[field.key].trim().length < field.min)
  const tooLong = form.additionalText.trim().length > 1000
  const configured = snapshot !== null && billingFields.every(field => snapshot[field.key].trim().length >= field.min)
  const save = async () => {
    const done = await action.run(() => saveBillingSettings(form), 'Datos de cobro guardados.')
    if (done) setSnapshot(form)
  }
  return <FormSection title="Cobros y datos bancarios" description="Datos que ve el negocio cuando informa una transferencia. Los cambios se guardan sólo al confirmar.">
    <Feedback message={action.message} error={action.error} onClose={action.clear} />
    {!configured && <Alert severity="info">Todavía no están completos los datos de cobro, así que los negocios no pueden ver los datos para transferir.</Alert>}
    <Box display="grid" gap={2} gridTemplateColumns={{ xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}>
      {billingFields.map(field => <TextField key={field.key} label={field.label} value={form[field.key]} onChange={event => setForm(current => ({ ...current, [field.key]: event.target.value }))} error={form[field.key].trim().length > 0 && form[field.key].trim().length < field.min} helperText={field.helper} fullWidth />)}
    </Box>
    <TextField multiline minRows={3} label="Texto adicional (opcional)" value={form.additionalText} onChange={event => setForm(current => ({ ...current, additionalText: event.target.value }))} error={tooLong} helperText="Instrucciones extra que se muestran al negocio en el paso de pago." inputProps={{ maxLength: 1200 }} />
    <Stack direction="row" gap={1} flexWrap="wrap">
      <Button variant="contained" disabled={!dirty || missing.length > 0 || tooLong || action.saving} onClick={() => void save()}>{action.saving ? 'Guardando…' : 'Guardar cambios'}</Button>
      {dirty && <Button disabled={action.saving} onClick={() => { if (snapshot) setForm(snapshot); action.clear() }}>Descartar cambios</Button>}
      {dirty && missing.length > 0 && <Typography variant="caption" color="warning.main" alignSelf="center">Faltan completar: {missing.map(field => field.label).join(', ')}.</Typography>}
    </Stack>
  </FormSection>
}

export function SettingsSection() {
  return <Stack spacing={2.5}>
    <Typography variant="body2" color="text.secondary">Estos valores se aplican a toda la plataforma y a todos los negocios de TecnoDesk.</Typography>
    <ServiceSettingsCard />
    <BillingSettingsCard />
  </Stack>
}


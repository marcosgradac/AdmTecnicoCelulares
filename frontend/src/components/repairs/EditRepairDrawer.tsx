import { FormSection } from '../admin/AdminPatterns'
import { useEffect, useState } from 'react'
import { Alert, Autocomplete, InputAdornment, MenuItem, TextField } from '@mui/material'
import type { Repair } from '../../types'
import { getClientOptions, type ClientOption } from '../../services/operations'
import { deviceBrandOptions, findKnownDeviceBrand, normalizeDeviceBrand, OTHER_DEVICE_BRAND } from '../../config/deviceBrands'
import { updateRepair, type UpdateRepairInput } from '../../services/repairs'
import { CurrencyField } from '../common/CurrencyField'
import { FormDrawer } from '../common/FormDrawer'
import { DeviceBrandAvatar, DeviceBrandOption } from '../common/DeviceBrandAvatar'

export function EditRepairDrawer({ open, repair, onClose, onUpdated }: { open: boolean; repair?: Repair; onClose: () => void; onUpdated: (repair: Repair) => void }) {
  const [clients, setClients] = useState<ClientOption[]>([]), [form, setForm] = useState<(Omit<UpdateRepairInput, 'total'> & { total: number | null })>(), [saving, setSaving] = useState(false), [error, setError] = useState(''), [customMode, setCustomMode] = useState(false)
  useEffect(() => { if (open) void getClientOptions().then(setClients).catch(() => setError('No pudimos cargar los clientes.')) }, [open])
  useEffect(() => { if (open && repair) { setForm({ clientId: repair.clientId, deviceBrand: repair.deviceBrand, deviceModel: repair.deviceModel, imei: repair.imei, color: repair.color, issue: repair.issue, diagnosis: repair.diagnosis, notes: repair.notes, total: repair.total }); setCustomMode(!findKnownDeviceBrand(repair.deviceBrand) && Boolean(repair.deviceBrand.trim())) } }, [open, repair])
  const field = <K extends keyof NonNullable<typeof form>>(key: K, value: NonNullable<typeof form>[K]) => setForm(current => current ? { ...current, [key]: value } : current)
  const save = async () => { if (!repair || !form) return; if (form.total == null) return setError('Ingresá un monto'); setSaving(true); setError(''); try { onUpdated(await updateRepair(repair.id, { ...form, deviceBrand: normalizeDeviceBrand(form.deviceBrand), total: form.total })) } catch { setError('No pudimos guardar los cambios de la reparación.') } finally { setSaving(false) } }
  return <FormDrawer open={open} context={repair ? `REPARACIÓN #${repair.number}` : undefined} title="Editar reparación" saving={saving} submitLabel="Guardar cambios" submitDisabled={!form?.clientId || !form.deviceBrand.trim() || !form.deviceModel.trim() || !form.issue.trim() || form.total == null} onClose={onClose} onSubmit={() => void save()}>
    {error && <Alert severity="error">{error}</Alert>}
    <FormSection title="Cliente y dispositivo"><TextField select label="Cliente asociado" value={form?.clientId ?? ''} onChange={event => field('clientId', event.target.value)}>{clients.map(client => <MenuItem key={client.id} value={client.id}>{client.name} · {client.phone || 'Sin teléfono'}</MenuItem>)}</TextField>
    <Autocomplete fullWidth options={deviceBrandOptions} value={customMode ? OTHER_DEVICE_BRAND : findKnownDeviceBrand(form?.deviceBrand) ?? null} onChange={(_, value) => { if (value === OTHER_DEVICE_BRAND) setCustomMode(true); else { setCustomMode(false); field('deviceBrand', value ?? '') } }} noOptionsText="Elegí «Otra» para escribir una marca distinta." renderOption={(props, option) => <DeviceBrandOption option={option} optionProps={props} />} renderInput={params => <TextField {...params} required label="Marca" InputProps={{ ...params.InputProps, startAdornment: form?.deviceBrand ? <InputAdornment position="start"><DeviceBrandAvatar brand={form.deviceBrand} size={20} /></InputAdornment> : params.InputProps.startAdornment }} />} /><TextField required label="Modelo" value={form?.deviceModel ?? ''} onChange={event => field('deviceModel', event.target.value)} />
    {customMode && <TextField required label="Otra marca" value={form?.deviceBrand ?? ''} onChange={event => field('deviceBrand', event.target.value)} helperText="Se guarda tal como la escribas." />}
    <TextField label="IMEI / serie" value={form?.imei ?? ''} onChange={event => field('imei', event.target.value)} /><TextField label="Color" value={form?.color ?? ''} onChange={event => field('color', event.target.value)} />
    </FormSection><FormSection title="Reparación y presupuesto"><TextField required multiline minRows={3} label="Falla informada" value={form?.issue ?? ''} onChange={event => field('issue', event.target.value)} /><TextField multiline minRows={2} label="Diagnóstico" value={form?.diagnosis ?? ''} onChange={event => field('diagnosis', event.target.value)} /><TextField multiline minRows={2} label="Notas internas" value={form?.notes ?? ''} onChange={event => field('notes', event.target.value)} />
    <CurrencyField required label="Presupuesto / precio" value={form?.total} onValueChange={value => field('total', value)} onEmpty={() => field('total', null)} error={Boolean(error) && form?.total == null} helperText={Boolean(error) && form?.total == null ? 'Ingresá un monto' : undefined}/>
  </FormSection></FormDrawer>
}

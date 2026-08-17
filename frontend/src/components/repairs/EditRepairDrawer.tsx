import { useEffect, useState } from 'react'
import { Alert, MenuItem, TextField } from '@mui/material'
import type { Repair } from '../../types'
import { getClients, type ClientRecord } from '../../services/operations'
import { updateRepair, type UpdateRepairInput } from '../../services/repairs'
import { CurrencyField } from '../common/CurrencyField'
import { FormDrawer } from '../common/FormDrawer'

export function EditRepairDrawer({ open, repair, onClose, onUpdated }: { open: boolean; repair?: Repair; onClose: () => void; onUpdated: (repair: Repair) => void }) {
  const [clients, setClients] = useState<ClientRecord[]>([]), [form, setForm] = useState<(Omit<UpdateRepairInput, 'total'> & { total: number | null })>(), [saving, setSaving] = useState(false), [error, setError] = useState('')
  useEffect(() => { if (open) void getClients().then(setClients).catch(() => setError('No pudimos cargar los clientes.')) }, [open])
  useEffect(() => { if (repair) setForm({ clientId: repair.clientId, deviceBrand: repair.deviceBrand, deviceModel: repair.deviceModel, imei: repair.imei, color: repair.color, issue: repair.issue, diagnosis: repair.diagnosis, notes: repair.notes, total: repair.total }) }, [repair])
  const field = <K extends keyof NonNullable<typeof form>>(key: K, value: NonNullable<typeof form>[K]) => setForm(current => current ? { ...current, [key]: value } : current)
  const save = async () => { if (!repair || !form) return; if (form.total == null) return setError('Ingresá un monto'); setSaving(true); setError(''); try { onUpdated(await updateRepair(repair.id, { ...form, total: form.total })) } catch { setError('No pudimos guardar los cambios de la reparación.') } finally { setSaving(false) } }
  return <FormDrawer open={open} eyebrow={repair ? `REPARACIÓN #${repair.number}` : 'REPARACIÓN'} title="Editar reparación" saving={saving} submitLabel="Guardar cambios" submitDisabled={!form?.clientId || !form.deviceBrand.trim() || !form.deviceModel.trim() || !form.issue.trim() || form.total == null} onClose={onClose} onSubmit={() => void save()}>
    {error && <Alert severity="error">{error}</Alert>}
    <TextField select label="Cliente asociado" value={form?.clientId ?? ''} onChange={event => field('clientId', event.target.value)}>{clients.map(client => <MenuItem key={client.id} value={client.id}>{client.name} · {client.phone || 'Sin teléfono'}</MenuItem>)}</TextField>
    <TextField required label="Marca" value={form?.deviceBrand ?? ''} onChange={event => field('deviceBrand', event.target.value)} /><TextField required label="Modelo" value={form?.deviceModel ?? ''} onChange={event => field('deviceModel', event.target.value)} />
    <TextField label="IMEI / serie" value={form?.imei ?? ''} onChange={event => field('imei', event.target.value)} /><TextField label="Color" value={form?.color ?? ''} onChange={event => field('color', event.target.value)} />
    <TextField required multiline minRows={3} label="Falla informada" value={form?.issue ?? ''} onChange={event => field('issue', event.target.value)} /><TextField multiline minRows={2} label="Diagnóstico" value={form?.diagnosis ?? ''} onChange={event => field('diagnosis', event.target.value)} /><TextField multiline minRows={2} label="Notas internas" value={form?.notes ?? ''} onChange={event => field('notes', event.target.value)} />
    <CurrencyField required label="Presupuesto / precio" value={form?.total} onValueChange={value => field('total', value)} onEmpty={() => field('total', null)} error={Boolean(error) && form?.total == null} helperText={Boolean(error) && form?.total == null ? 'Ingresá un monto' : undefined}/>
  </FormDrawer>
}

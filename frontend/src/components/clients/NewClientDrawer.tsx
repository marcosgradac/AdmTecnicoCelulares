import { Alert, TextField } from '@mui/material'
import { useEffect, useState } from 'react'
import { createClient, updateClient, type ClientRecord } from '../../services/operations'
import { FormDrawer } from '../common/FormDrawer'

export function NewClientDrawer({ open, client, onClose, onCreated }: { open: boolean; client?: ClientRecord; onClose: () => void; onCreated: (client: ClientRecord) => void }) {
  const [form, setForm] = useState({ name: '', phone: '' }), [saving, setSaving] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    if (open) setForm({ name: client?.name ?? '', phone: client?.phone ?? '' })
  }, [client, open])
  const close = () => { if (!saving) { setError(''); onClose() } }
  const save = async () => { setSaving(true); setError(''); try { const saved = client ? await updateClient(client.id, { name: form.name.trim(), phone: form.phone.trim() || null }) : await createClient({ name: form.name.trim(), phone: form.phone.trim() || undefined }); setForm({ name: '', phone: '' }); onCreated(saved) } catch { setError(`No pudimos ${client ? 'actualizar' : 'crear'} el cliente. Revisá si el teléfono ya está registrado.`) } finally { setSaving(false) } }
  return <FormDrawer open={open} eyebrow="CLIENTES" title={client ? 'Editar cliente' : 'Nuevo cliente'} saving={saving} submitLabel={client ? 'Guardar cambios' : 'Crear cliente'} submitDisabled={form.name.trim().length < 2} onClose={close} onSubmit={() => void save()}>{error && <Alert severity="error">{error}</Alert>}<TextField label="Nombre y apellido" required value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))}/><TextField label="Teléfono" value={form.phone} onChange={event => setForm(value => ({ ...value, phone: event.target.value }))} helperText="Se utiliza para búsquedas y contacto."/></FormDrawer>
}

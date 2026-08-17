import { useEffect, useState, type FormEvent } from 'react'
import axios from 'axios'
import { Alert, Avatar, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material'
import { useAuth } from '../auth/AuthContext'

export function ProfilePage() {
  const { user, updateProfile } = useAuth()
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  useEffect(() => setForm({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', phone: user?.phone ?? '' }), [user])
  if (!user) return null

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage(null)
    try { await updateProfile(form); setMessage({ type: 'success', text: 'Perfil actualizado correctamente.' }) }
    catch (profileError) {
      setMessage({ type: 'error', text: axios.isAxiosError<{ message?: string }>(profileError) ? profileError.response?.data?.message ?? 'No pudimos actualizar tu perfil' : 'No pudimos actualizar tu perfil' })
    } finally { setSaving(false) }
  }
  return <Box maxWidth={720}>
    <Typography variant="overline" color="primary.main" fontWeight={800}>CUENTA</Typography>
    <Typography variant="h1">Mi perfil</Typography>
    <Typography color="text.secondary" mt={.5} mb={3}>Administrá tus datos personales de TecnoDesk.</Typography>
    <Card><CardContent sx={{ p: { xs: 3, sm: 4 } }}>
      <Stack direction="row" spacing={2} alignItems="center" mb={3}><Avatar sx={{ width: 58, height: 58, bgcolor: 'primary.main' }}>{user.fullName.charAt(0).toUpperCase()}</Avatar><Box><Typography fontWeight={850} fontSize={18}>{user.fullName}</Typography><Typography color="text.secondary">{user.email}</Typography><Typography variant="caption">{user.business.name} · {user.role === 'OWNER' ? 'Propietario' : 'Técnico'}</Typography></Box></Stack>
      <Stack component="form" onSubmit={submit} spacing={2}>
        {message && <Alert severity={message.type}>{message.text}</Alert>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField fullWidth required label="Nombre" value={form.firstName} onChange={e => setForm(value => ({ ...value, firstName: e.target.value }))} />
          <TextField fullWidth required label="Apellido" value={form.lastName} onChange={e => setForm(value => ({ ...value, lastName: e.target.value }))} />
        </Stack>
        <TextField label="Teléfono (opcional)" type="tel" inputMode="tel" value={form.phone} onChange={e => setForm(value => ({ ...value, phone: e.target.value }))} />
        <Button type="submit" variant="contained" disabled={saving || !form.firstName.trim() || !form.lastName.trim()} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button>
      </Stack>
    </CardContent></Card>
  </Box>
}

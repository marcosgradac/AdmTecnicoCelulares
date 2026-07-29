import { useEffect, useState, type FormEvent } from 'react'
import axios from 'axios'
import { Alert, Button, Dialog, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import { useAuth } from '../../auth/AuthContext'

export function ProfileCompletionDialog() {
  const { user, updateProfile } = useAuth()
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setForm({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', phone: user?.phone ?? '' })
  }, [user])
  if (!user || user.profileComplete) return null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || !form.firstName.trim() || !form.lastName.trim()) return
    setSaving(true); setError('')
    try { await updateProfile(form) }
    catch (profileError) {
      setError(axios.isAxiosError<{ message?: string }>(profileError)
        ? profileError.response?.data?.message ?? 'No pudimos guardar tu perfil'
        : 'No pudimos guardar tu perfil')
    } finally { setSaving(false) }
  }

  return <Dialog open disableEscapeKeyDown fullWidth maxWidth="xs">
    <DialogTitle fontWeight={850}>Completá tu perfil</DialogTitle>
    <DialogContent>
      <Typography color="text.secondary" mb={2}>Necesitamos tu nombre y apellido para personalizar tu sesión. No modificaremos tu negocio ni tu rol.</Typography>
      <Stack component="form" onSubmit={submit} spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField required autoFocus label="Nombre" autoComplete="given-name" value={form.firstName} onChange={e => setForm(value => ({ ...value, firstName: e.target.value }))} />
        <TextField required label="Apellido" autoComplete="family-name" value={form.lastName} onChange={e => setForm(value => ({ ...value, lastName: e.target.value }))} />
        <TextField label="Teléfono (opcional)" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={e => setForm(value => ({ ...value, phone: e.target.value }))} />
        <Button type="submit" variant="contained" size="large" disabled={saving || !form.firstName.trim() || !form.lastName.trim()} sx={{ minHeight: 46 }}>{saving ? 'Guardando…' : 'Guardar perfil'}</Button>
      </Stack>
    </DialogContent>
  </Dialog>
}

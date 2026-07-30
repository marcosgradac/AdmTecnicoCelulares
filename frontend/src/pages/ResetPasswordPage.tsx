import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { Alert, Box, Button, IconButton, InputAdornment, Link as MuiLink, TextField } from '@mui/material'
import { VisibilityOffRounded, VisibilityRounded } from '@mui/icons-material'
import { AuthLayout } from '../components/auth/AuthLayout'
import { resetPassword } from '../services/auth'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [form, setForm] = useState({ password: '', confirmation: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const passwordValid = /[a-z]/.test(form.password) && /[A-Z]/.test(form.password) && /\d/.test(form.password) && form.password.length >= 8

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || success) return
    setError('')
    if (!token) return setError('El enlace no contiene un token válido.')
    if (!passwordValid) return setError('Usá al menos 8 caracteres, una mayúscula, una minúscula y un número.')
    if (form.password !== form.confirmation) return setError('Las contraseñas no coinciden.')
    setSaving(true)
    try {
      const result = await resetPassword(token, form.password)
      setSuccess(result.message)
      setForm({ password: '', confirmation: '' })
    } catch (requestError) {
      setError(axios.isAxiosError<{ message?: string }>(requestError)
        ? requestError.response?.data?.message ?? 'No pudimos restablecer la contraseña'
        : 'No pudimos restablecer la contraseña')
    } finally { setSaving(false) }
  }

  return <AuthLayout variant="reset-password" title="Creá una nueva contraseña" description="La nueva contraseña cerrará las sesiones anteriores de tu cuenta.">
    {!token && <Alert severity="error">El enlace es inválido o está incompleto.</Alert>}
    {success && <Alert severity="success">{success}</Alert>}
    {error && <Alert severity="error">{error}</Alert>}
    {!success && <Box component="form" onSubmit={submit} display="grid" gap={2}>
      <TextField required label="Nueva contraseña" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
        value={form.password} onChange={event => setForm(value => ({ ...value, password: event.target.value }))}
        helperText="Mínimo 8 caracteres, mayúscula, minúscula y número."
        InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <VisibilityOffRounded /> : <VisibilityRounded />}</IconButton></InputAdornment> }} />
      <TextField required label="Repetir contraseña" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
        value={form.confirmation} onChange={event => setForm(value => ({ ...value, confirmation: event.target.value }))} />
      <Button type="submit" size="large" variant="contained" disabled={saving || !token || !form.password || !form.confirmation} sx={{ minHeight: 48 }}>
        {saving ? 'Guardando…' : 'Guardar nueva contraseña'}
      </Button>
    </Box>}
    <MuiLink component={Link} to="/login" underline="hover" textAlign="center">
      {success ? 'Iniciar sesión' : 'Volver al inicio de sesión'}
    </MuiLink>
  </AuthLayout>
}

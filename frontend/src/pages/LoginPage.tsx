import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { Alert, Box, Button, IconButton, InputAdornment, Link as MuiLink, TextField, Typography } from '@mui/material'
import { VisibilityOffRounded, VisibilityRounded } from '@mui/icons-material'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/auth/AuthLayout'

export function LoginPage() {
  const { user, login } = useAuth()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/inicio'} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true); setError('')
    try { await login(form.email.trim(), form.password) }
    catch (loginError) {
      setError(axios.isAxiosError<{ message?: string }>(loginError)
        ? loginError.response?.data?.message ?? 'No pudimos iniciar sesión'
        : 'No pudimos iniciar sesión')
    } finally { setSaving(false) }
  }

  return <AuthLayout title="Bienvenido de nuevo" description="Ingresá a tu espacio de trabajo de CelluFix.">
    {error && <Alert severity="error">{error}</Alert>}
    <Box component="form" onSubmit={submit} display="grid" gap={2}>
      <TextField required label="Email" type="email" autoComplete="email" inputMode="email" value={form.email}
        onChange={event => setForm(value => ({ ...value, email: event.target.value }))} />
      <TextField required label="Contraseña" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={form.password}
        onChange={event => setForm(value => ({ ...value, password: event.target.value }))}
        InputProps={{ endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <VisibilityOffRounded /> : <VisibilityRounded />}</IconButton></InputAdornment> }} />
      <MuiLink component={Link} to="/olvide-mi-contrasena" underline="hover" textAlign="right">Olvidé mi contraseña</MuiLink>
      <Button type="submit" size="large" variant="contained" disabled={saving || !form.email.trim() || !form.password} sx={{ minHeight: 48 }}>
        {saving ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </Button>
    </Box>
    <Typography variant="body2" textAlign="center">¿Todavía no tenés cuenta? <Link to="/register"><b>Crear cuenta</b></Link></Typography>
  </AuthLayout>
}

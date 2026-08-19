import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { Alert, Box, Button, Link as MuiLink, TextField, Typography } from '@mui/material'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/auth/AuthLayout'
import PasswordField from '../components/auth/PasswordField'
import { checkApiHealth } from '../services/api'

export function LoginPage() {
  const { user, login } = useAuth()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/admin'} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true); setError('')
    try { await checkApiHealth(); await login(form.email.trim(), form.password) }
    catch (loginError) {
      if (import.meta.env.DEV) console.error('Error de inicio de sesión', loginError)
      if (!axios.isAxiosError<{ message?: string }>(loginError)) {
        setError('Ocurrió un problema inesperado. Intentá nuevamente.')
      } else if (!loginError.response) {
        setError('No pudimos conectarnos con el servidor. Revisá tu conexión e intentá nuevamente.')
      } else if (loginError.response.status === 401) {
        setError('Email o contraseña incorrectos.')
      } else if (loginError.response.status === 403) {
        setError('Tu usuario se encuentra desactivado.')
      } else {
        setError('Ocurrió un problema inesperado. Intentá nuevamente.')
      }
    } finally { setSaving(false) }
  }

  return <AuthLayout title="Bienvenido de nuevo" description="Ingresá a tu espacio de trabajo de TecnoDesk.">
    {error && <Alert severity="error">{error}</Alert>}
      <Box component="form" onSubmit={submit} display="grid" gap={2}>
        <TextField required label="Email" type="email" autoComplete="email" inputMode="email" value={form.email}
          onChange={event => setForm(value => ({ ...value, email: event.target.value }))} />
        <PasswordField required value={form.password} onChange={event => setForm(value => ({ ...value, password: event.target.value }))} />
      <MuiLink component={Link} to="/olvide-mi-contrasena" underline="hover" textAlign="right">Olvidé mi contraseña</MuiLink>
      <Button type="submit" size="large" variant="contained" disabled={saving || !form.email.trim() || !form.password} sx={{ minHeight: 52, width: '100%', bgcolor: 'linear-gradient(90deg,#3b82f6,#7c3aed)', '&:hover': { transform: 'translateY(-1px)' } }}>
        {saving ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </Button>
    </Box>
    <Typography variant="body2" textAlign="center">¿Todavía no tenés cuenta? <Link to="/register"><b>Crear cuenta</b></Link></Typography>
  </AuthLayout>
}

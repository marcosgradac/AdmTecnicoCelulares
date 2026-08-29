import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { EastRounded, EmailRounded } from '@mui/icons-material'
import { Alert, Box, Button, InputAdornment, Link as MuiLink, TextField } from '@mui/material'
import { AuthLayout } from '../components/auth/AuthLayout'
import { forgotPassword } from '../services/auth'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true); setError(''); setMessage('')
    try {
      const result = await forgotPassword(email.trim())
      setMessage(result.message)
    } catch (requestError) {
      setError(axios.isAxiosError<{ message?: string }>(requestError)
        ? requestError.response?.data?.message ?? 'No pudimos procesar la solicitud'
        : 'No pudimos procesar la solicitud')
    } finally { setSaving(false) }
  }

  return <AuthLayout variant="forgot-password" title="Recuperá tu contraseña" description="Ingresá tu email y te enviaremos un enlace seguro para elegir una nueva contraseña.">
    {message && <Alert severity="success">{message}</Alert>}
    {error && <Alert severity="error">{error}</Alert>}
    <Box component="form" className="auth-password-form" onSubmit={submit}>
      <TextField required label="Email" type="email" autoComplete="email" value={email}
        onChange={event => setEmail(event.target.value)} disabled={saving}
        InputProps={{ startAdornment: <InputAdornment position="start"><EmailRounded /></InputAdornment> }} />
      <Button className="login-submit" type="submit" size="large" variant="contained" disabled={saving || !email.trim()} endIcon={!saving && <EastRounded />}>
        {saving ? 'Enviando…' : 'Enviar enlace'}
      </Button>
    </Box>
    <MuiLink className="auth-return-link" component={Link} to="/login" underline="hover" textAlign="center">Volver a iniciar sesión</MuiLink>
  </AuthLayout>
}

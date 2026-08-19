import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import axios from 'axios'
import { Alert, Box, Button, Checkbox, FormControlLabel, LinearProgress, Stack, TextField, Typography } from '@mui/material'
import PasswordField from '../components/auth/PasswordField'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/auth/AuthLayout'

const initialForm = {
  firstName: '', lastName: '', phone: '', businessName: '', businessPhone: '',
  email: '', password: '', repeatPassword: '', terms: false,
}

export function RegisterPage() {
  const { user, register } = useAuth()
  const [form, setForm] = useState(initialForm)
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const strength = useMemo(() => [
    form.password.length >= 8,
    /[a-z]/.test(form.password) && /[A-Z]/.test(form.password),
    /\d/.test(form.password),
    /[^A-Za-z0-9]/.test(form.password),
  ].filter(Boolean).length, [form.password])
  if (user) return <Navigate to="/admin" replace />

  const invalid = {
    firstName: !form.firstName.trim(),
    lastName: !form.lastName.trim(),
    businessName: !form.businessName.trim(),
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()),
    password: strength < 3,
    repeatPassword: form.password !== form.repeatPassword,
    terms: !form.terms,
  }
  const hasErrors = Object.values(invalid).some(Boolean)
  const change = (field: keyof typeof initialForm, value: string | boolean) => setForm(current => ({ ...current, [field]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitted(true)
    if (saving || hasErrors) return
    setSaving(true); setError('')
    try {
      await register({
        firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone,
        businessName: form.businessName.trim(), businessPhone: form.businessPhone,
        email: form.email.trim(), password: form.password,
      })
    } catch (registerError) {
      setError(axios.isAxiosError<{ message?: string }>(registerError)
        ? registerError.response?.data?.message ?? 'No pudimos crear la cuenta'
        : 'No pudimos crear la cuenta')
    } finally { setSaving(false) }
  }

  return <AuthLayout variant="register" title="Creá tu cuenta en TecnoDesk" description="Empezá a gestionar tu servicio técnico en pocos pasos.">
    {error && <Alert severity="error">{error}</Alert>}
    <Box component="form" onSubmit={submit} display="grid" gap={2}>
      <Typography fontWeight={800}>Datos personales</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField fullWidth required label="Nombre" autoComplete="given-name" value={form.firstName} onChange={e => change('firstName', e.target.value)} error={submitted && invalid.firstName} helperText={submitted && invalid.firstName ? 'Ingresá tu nombre' : ' '} />
        <TextField fullWidth required label="Apellido" autoComplete="family-name" value={form.lastName} onChange={e => change('lastName', e.target.value)} error={submitted && invalid.lastName} helperText={submitted && invalid.lastName ? 'Ingresá tu apellido' : ' '} />
      </Stack>
      <TextField label="Teléfono (opcional)" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={e => change('phone', e.target.value)} />
      <Typography fontWeight={800} mt={1}>Datos del negocio</Typography>
      <TextField required label="Nombre del negocio" value={form.businessName} onChange={e => change('businessName', e.target.value)} error={submitted && invalid.businessName} helperText={submitted && invalid.businessName ? 'Ingresá el nombre del negocio' : ' '} />
      <TextField label="Teléfono del negocio (opcional)" type="tel" inputMode="tel" value={form.businessPhone} onChange={e => change('businessPhone', e.target.value)} />
      <Typography fontWeight={800} mt={1}>Acceso</Typography>
      <TextField required label="Email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={e => change('email', e.target.value)} error={submitted && invalid.email} helperText={submitted && invalid.email ? 'Ingresá un email válido' : ' '} />
      <PasswordField required label="Contraseña" autoComplete="new-password" value={form.password} onChange={e => change('password', e.target.value)} error={submitted && invalid.password} helperText={submitted && invalid.password ? 'Usá 8 caracteres, mayúscula, minúscula y número' : 'Mínimo 8 caracteres, mayúscula, minúscula y número'} />
      <Box><LinearProgress variant="determinate" value={strength * 25} color={strength >= 3 ? 'success' : strength >= 2 ? 'warning' : 'error'} sx={{ height: 6, borderRadius: 3 }} /><Typography variant="caption" color="text.secondary">Fortaleza: {['muy baja', 'baja', 'media', 'buena', 'fuerte'][strength]}</Typography></Box>
      <PasswordField required label="Repetir contraseña" autoComplete="new-password" value={form.repeatPassword} onChange={e => change('repeatPassword', e.target.value)} error={submitted && invalid.repeatPassword} helperText={submitted && invalid.repeatPassword ? 'Las contraseñas no coinciden' : ' '} />
      <FormControlLabel control={<Checkbox checked={form.terms} onChange={e => change('terms', e.target.checked)} />} label="Acepto los términos y condiciones" />
      {submitted && invalid.terms && <Typography color="error" variant="caption">Debés aceptar los términos para continuar.</Typography>}
      <Button type="submit" size="large" variant="contained" disabled={saving} sx={{ minHeight: 52 }}>{saving ? 'Creando cuenta…' : 'Crear cuenta'}</Button>
    </Box>
    <Typography variant="body2" textAlign="center">¿Ya tenés cuenta? <Link to="/login"><b>Iniciar sesión</b></Link></Typography>
  </AuthLayout>
}

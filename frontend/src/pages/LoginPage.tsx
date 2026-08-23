import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/auth/AuthLayout'
import { LoginForm } from '../components/auth/LoginForm'
import { SecurityHighlights } from '../components/auth/SecurityHighlights'
import { checkApiHealth } from '../services/api'

export function LoginPage() {
  const { user, login } = useAuth()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
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
    <LoginForm email={form.email} password={form.password} saving={saving} error={error} onSubmit={submit}
      onEmailChange={email => setForm(value => ({ ...value, email }))}
      onPasswordChange={password => setForm(value => ({ ...value, password }))} />
    <SecurityHighlights />
  </AuthLayout>
}

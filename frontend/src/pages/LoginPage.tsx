import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/auth/AuthLayout'
import { LoginForm } from '../components/auth/LoginForm'
import { SecurityHighlights } from '../components/auth/SecurityHighlights'
import { checkApiHealth } from '../services/api'
import { firstAllowedPath } from '../auth/permissions'
import { Alert, Button } from '@mui/material'

export function LoginPage() {
  const { user, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [captchaRequired, setCaptchaRequired] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaResetKey, setCaptchaResetKey] = useState(0)
  const [blockedAudience, setBlockedAudience] = useState<'OWNER'|'TECHNICIAN'|null>(null)
  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? firstAllowedPath(user)} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true); setError('')
    try { await checkApiHealth(); const loggedUser = await login(form.email.trim(), form.password, captchaToken || undefined); navigate((location.state as { from?: string } | null)?.from ?? firstAllowedPath(loggedUser), { replace: true }) }
    catch (loginError) {
      if (import.meta.env.DEV) console.error('Error de inicio de sesión', loginError)
      if (!axios.isAxiosError<{ message?: string }>(loginError)) {
        setError('Ocurrió un problema inesperado. Intentá nuevamente.')
      } else if (!loginError.response) {
        setError('No pudimos conectarnos con el servidor. Revisá tu conexión e intentá nuevamente.')
      } else if (loginError.response.status === 401) {
        if ((loginError.response.data as { captchaRequired?: boolean }).captchaRequired) setCaptchaRequired(true)
        setError('Email o contraseña incorrectos.')
      } else if (loginError.response.status === 429) {
        setCaptchaRequired(true)
        setError(loginError.response.data?.message ?? 'Hiciste demasiados intentos. Esperá unos minutos y volvé a intentar.')
      } else if (loginError.response.status === 403) {
        const payload = loginError.response.data as { code?: string; audience?: 'OWNER'|'TECHNICIAN'; message?: string }
        if (payload.code === 'TURNSTILE_REQUIRED') { setCaptchaRequired(true); setError(payload.message ?? 'Completá la verificación de seguridad.'); return }
        if (['BUSINESS_BLOCKED','SUBSCRIPTION_BLOCKED'].includes(payload.code??'')) setBlockedAudience(payload.audience??'TECHNICIAN')
        else setError('Tu usuario se encuentra desactivado.')
      } else {
        setError('Ocurrió un problema inesperado. Intentá nuevamente.')
      }
    } finally { if (captchaToken) { setCaptchaToken(''); setCaptchaResetKey(value => value + 1) }; setSaving(false) }
  }

  if (blockedAudience) return <AuthLayout variant="reset-password" title={blockedAudience==='OWNER'?'Tu cuenta está temporalmente bloqueada':'Acceso temporalmente suspendido'} description={blockedAudience==='OWNER'?'El período de acceso de TecnoDesk finalizó. Tus datos siguen guardados.':'El acceso de este negocio está temporalmente suspendido.'}><Alert severity="warning">{blockedAudience==='OWNER'?'Contactá con TecnoDesk para reactivar tu cuenta.':'Contactá al propietario del negocio.'}</Alert><Button onClick={()=>{setBlockedAudience(null);setForm({email:'',password:''})}}>Ingresar con otra cuenta</Button></AuthLayout>
  return <AuthLayout title="Bienvenido de nuevo" description="Ingresá a tu espacio de trabajo de TecnoDesk.">
    <LoginForm email={form.email} password={form.password} saving={saving} error={error} captchaRequired={captchaRequired} captchaToken={captchaToken} captchaResetKey={captchaResetKey} onCaptchaToken={setCaptchaToken} onSubmit={submit}
      onEmailChange={email => setForm(value => ({ ...value, email }))}
      onPasswordChange={password => setForm(value => ({ ...value, password }))} />
    <SecurityHighlights />
  </AuthLayout>
}

import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/auth/AuthLayout'
import { RegisterForm, type RegisterFormState } from '../components/auth/RegisterForm'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../config/legal'
import { validateRegistration } from '../components/auth/registerValidation'

const initialForm = {
  firstName: '', lastName: '', phone: '', businessName: '', businessPhone: '',
  email: '', password: '', repeatPassword: '', terms: false,
}

export function RegisterPage() {
  const { user, register } = useAuth()
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)
  const sending = useRef(false)
  const strength = useMemo(() => [
    form.password.length >= 8,
    /[a-z]/.test(form.password) && /[A-Z]/.test(form.password),
    /\d/.test(form.password),
    /[^A-Za-z0-9]/.test(form.password),
  ].filter(Boolean).length, [form.password])
  if (user) return <Navigate to="/admin" replace />

  const errors = validateRegistration(form)
  const change = (field: keyof RegisterFormState, value: string | boolean) => {
    setError(''); setForm(current => ({ ...current, [field]: value }))
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending.current) return
    setSubmitted(true); setError('')
    const firstError = (Object.keys(errors) as (keyof RegisterFormState)[]).find(field => errors[field])
    if (firstError || !turnstileToken) {
      const element = event.currentTarget as HTMLFormElement
      requestAnimationFrame(() => element.querySelector<HTMLElement>(firstError ? `[name="${firstError}"]` : '#register-security')?.focus())
      return
    }
    sending.current = true
    setSaving(true); setError('')
    try {
      await register({
        firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone,
        businessName: form.businessName.trim(), businessPhone: form.businessPhone,
        email: form.email.trim(), password: form.password,
        termsAccepted: true, termsVersion: CURRENT_TERMS_VERSION,
        privacyAccepted: true, privacyVersion: CURRENT_PRIVACY_VERSION,
        turnstileToken,
      })
    } catch (registerError) {
      const status = axios.isAxiosError(registerError) ? registerError.response?.status : undefined
      // Never echo server internals or account details into the public form.
      setError(status === 400 ? 'Revisá los datos del formulario y volvé a intentar.'
        : status === 403 ? 'No pudimos completar la verificación de seguridad. Intentá nuevamente.'
        : status === 409 ? 'No pudimos crear la cuenta con esos datos.'
        : status === 429 ? 'Demasiados intentos. Esperá unos minutos y volvé a intentar.'
        : status ? 'El servicio no está disponible en este momento. Intentá nuevamente en unos minutos.'
        : 'No pudimos conectar con el servicio. Revisá tu conexión e intentá nuevamente.')
      requestAnimationFrame(() => document.getElementById('register-server-error')?.focus())
    } finally { sending.current = false; setTurnstileToken(''); setTurnstileResetKey(value => value + 1); setSaving(false) }
  }

  return <AuthLayout variant="register" title="Creá tu cuenta" description="Empezá a gestionar tu servicio técnico de forma simple y profesional.">
    <RegisterForm form={form} errors={errors} submitted={submitted} saving={saving} error={error} strength={strength} turnstileToken={turnstileToken} turnstileResetKey={turnstileResetKey} onTurnstileToken={setTurnstileToken} onChange={change} onSubmit={submit} />
  </AuthLayout>
}

import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import axios from 'axios'
import { Typography } from '@mui/material'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/auth/AuthLayout'
import { RegisterForm, type RegisterFormState } from '../components/auth/RegisterForm'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../config/legal'

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
    phone: !/^(?=(?:\D*\d){6,15}\D*$)[+\d][\d\s().-]*$/.test(form.phone.trim()),
    businessName: !form.businessName.trim(),
    businessPhone: !/^(?=(?:\D*\d){6,15}\D*$)[+\d][\d\s().-]*$/.test(form.businessPhone.trim()),
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()),
    password: strength < 3,
    repeatPassword: form.password !== form.repeatPassword,
    terms: !form.terms,
  }
  const hasErrors = Object.values(invalid).some(Boolean)
  const change = (field: keyof RegisterFormState, value: string | boolean) => setForm(current => ({ ...current, [field]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitted(true)
    if (saving || hasErrors || !turnstileToken) return
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
      setError(axios.isAxiosError<{ message?: string }>(registerError)
        ? registerError.response?.data?.message ?? 'No pudimos crear la cuenta'
        : 'No pudimos crear la cuenta')
    } finally { setTurnstileToken(''); setTurnstileResetKey(value => value + 1); setSaving(false) }
  }

  return <AuthLayout variant="register" title="Creá tu cuenta" description="Empezá a gestionar tu servicio técnico de forma simple y profesional.">
    <RegisterForm form={form} invalid={invalid} submitted={submitted} saving={saving} error={error} strength={strength} turnstileToken={turnstileToken} turnstileResetKey={turnstileResetKey} onTurnstileToken={setTurnstileToken} onChange={change} onSubmit={submit} />
    <Typography variant="body2" textAlign="center">¿Ya tenés cuenta? <Link to="/login"><b>Iniciar sesión</b></Link></Typography>
  </AuthLayout>
}

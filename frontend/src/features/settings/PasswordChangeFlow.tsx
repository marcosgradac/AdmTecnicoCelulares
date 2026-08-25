import { useEffect, useState, type FormEvent } from 'react'
import axios from 'axios'
import { Alert, Button, IconButton, InputAdornment, Snackbar, Stack, TextField, Typography } from '@mui/material'
import { VisibilityOffRounded, VisibilityRounded } from '@mui/icons-material'
import { confirmPasswordChange, requestPasswordCode, verifyPasswordCode } from './settings.api'
import { TurnstileWidget } from '../../components/security/TurnstileWidget'

const messageOf = (error: unknown, fallback: string) => axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message ?? fallback : fallback

export function PasswordChangeFlow({ onCompleted }: { onCompleted: () => void }) {
  const [codeSent, setCodeSent] = useState(false), [maskedEmail, setMaskedEmail] = useState(''), [code, setCode] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false), [countdown, setCountdown] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(''), [completed, setCompleted] = useState(false)
  const [captchaRequired, setCaptchaRequired] = useState(false), [captchaToken, setCaptchaToken] = useState(''), [captchaResetKey, setCaptchaResetKey] = useState(0)
  useEffect(() => { if (countdown <= 0) return; const timer = window.setInterval(() => setCountdown(value => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer) }, [countdown])

  const send = async () => {
    if (busy || countdown > 0 || (captchaRequired && !captchaToken)) return
    setBusy(true); setError('')
    try {
      const result = await requestPasswordCode(captchaToken || undefined)
      setMaskedEmail(result.maskedEmail); setCountdown(result.retryAfter); setCode(''); setCodeSent(true); setCaptchaRequired(false)
    } catch (requestError) {
      setError(messageOf(requestError, 'No pudimos enviar el código. Intentá nuevamente en unos minutos.'))
      if (axios.isAxiosError<{ retryAfter?: number; captchaRequired?: boolean; code?: string }>(requestError)) {
        setCountdown(requestError.response?.data?.retryAfter ?? 0)
        if (requestError.response?.data?.captchaRequired || requestError.response?.data?.code === 'TURNSTILE_REQUIRED') setCaptchaRequired(true)
      }
    } finally { if (captchaToken) { setCaptchaToken(''); setCaptchaResetKey(value => value + 1) }; setBusy(false) }
  }

  const confirm = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (password !== confirmation) return setError('Las contraseñas no coinciden.')
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return setError('Usá al menos 8 caracteres, una mayúscula, una minúscula y un número.')
    setBusy(true)
    try {
      const verified = await verifyPasswordCode(code)
      await confirmPasswordChange(verified.verificationToken, password, confirmation)
      setCode(''); setPassword(''); setConfirmation(''); setCodeSent(false); setMaskedEmail(''); setCountdown(0); setCompleted(true)
      window.setTimeout(onCompleted, 1400)
    } catch (requestError) { setError(messageOf(requestError, 'No pudimos cambiar la contraseña.')) } finally { setBusy(false) }
  }

  const visibility = <InputAdornment position="end"><IconButton onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <VisibilityOffRounded /> : <VisibilityRounded />}</IconButton></InputAdornment>
  return <Stack spacing={2}>
    <Typography variant="h2">Cambiar contraseña</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    {!codeSent ? <><Typography color="text.secondary">Te enviaremos un código de 6 dígitos al correo de tu cuenta para verificar tu identidad.</Typography>{captchaRequired && <TurnstileWidget onToken={setCaptchaToken} resetKey={captchaResetKey} />}<Button variant="contained" onClick={() => void send()} disabled={busy || (captchaRequired && !captchaToken)} sx={{ alignSelf: 'flex-start' }}>{busy ? 'Enviando…' : 'Enviar código'}</Button></> :
      <Stack component="form" spacing={2} onSubmit={confirm}>
        <Alert severity="success">Enviamos un código a {maskedEmail}.</Alert>
        <TextField label="Código de 6 dígitos" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputProps={{ inputMode: 'numeric', maxLength: 6, autoComplete: 'one-time-code' }} />
        <TextField type={showPassword ? 'text' : 'password'} label="Nueva contraseña" value={password} onChange={event => setPassword(event.target.value)} helperText="Mínimo 8 caracteres, mayúscula, minúscula y número." autoComplete="new-password" InputProps={{ endAdornment: visibility }} />
        <TextField type={showPassword ? 'text' : 'password'} label="Confirmar nueva contraseña" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" InputProps={{ endAdornment: visibility }} />
        <Button type="submit" variant="contained" disabled={busy || code.length !== 6 || !password || !confirmation} sx={{ alignSelf: 'flex-start' }}>{busy ? 'Cambiando…' : 'Cambiar contraseña'}</Button>
        {captchaRequired && <TurnstileWidget onToken={setCaptchaToken} resetKey={captchaResetKey} />}
        <Button onClick={() => void send()} disabled={busy || countdown > 0 || (captchaRequired && !captchaToken)} sx={{ alignSelf: 'flex-start' }}>{countdown > 0 ? `Reenviar código en ${countdown} s` : 'Reenviar código'}</Button>
      </Stack>}
    <Snackbar open={completed} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity="success">Contraseña actualizada correctamente.</Alert></Snackbar>
  </Stack>
}

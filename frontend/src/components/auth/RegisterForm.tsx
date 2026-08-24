import type { FormEvent } from 'react'
import { EastRounded, ScheduleRounded } from '@mui/icons-material'
import { Alert, Box, Button, Checkbox, FormControlLabel, LinearProgress, Link as MuiLink, Stack, TextField, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import PasswordField from './PasswordField'
import { TurnstileWidget } from '../security/TurnstileWidget'

export type RegisterFormState = {
  firstName: string; lastName: string; phone: string; businessName: string; businessPhone: string
  email: string; password: string; repeatPassword: string; terms: boolean
}

export type RegisterInvalidState = Record<'firstName' | 'lastName' | 'phone' | 'businessName' | 'businessPhone' | 'email' | 'password' | 'repeatPassword' | 'terms', boolean>

export function RegisterForm({ form, invalid, submitted, saving, error, strength, turnstileToken, turnstileResetKey, onTurnstileToken, onChange, onSubmit }: {
  form: RegisterFormState; invalid: RegisterInvalidState; submitted: boolean; saving: boolean; error: string; strength: number
  onChange: (field: keyof RegisterFormState, value: string | boolean) => void; onSubmit: (event: FormEvent) => void
  turnstileToken: string; turnstileResetKey: number; onTurnstileToken: (token: string) => void
}) {
  return <>
    <div className="register-time"><ScheduleRounded />Configurá tu espacio de trabajo en menos de 2 minutos.</div>
    {error && <Alert severity="error">{error}</Alert>}
    <Box component="form" className="register-form" onSubmit={onSubmit}>
      <Typography className="register-section-title">Datos personales</Typography>
      <Stack className="register-name-row" direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField fullWidth required label="Nombre" autoComplete="given-name" value={form.firstName} onChange={e => onChange('firstName', e.target.value)} error={submitted && invalid.firstName} helperText={submitted && invalid.firstName ? 'Ingresá tu nombre' : undefined} />
        <TextField fullWidth required label="Apellido" autoComplete="family-name" value={form.lastName} onChange={e => onChange('lastName', e.target.value)} error={submitted && invalid.lastName} helperText={submitted && invalid.lastName ? 'Ingresá tu apellido' : undefined} />
      </Stack>
      <TextField required label="Teléfono" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={e => onChange('phone', e.target.value)} error={submitted && invalid.phone} helperText={submitted && invalid.phone ? 'Ingresá un teléfono válido' : undefined} />
      <Typography className="register-section-title">Datos del negocio</Typography>
      <TextField required label="Nombre del negocio" value={form.businessName} onChange={e => onChange('businessName', e.target.value)} error={submitted && invalid.businessName} helperText={submitted && invalid.businessName ? 'Ingresá el nombre del negocio' : 'Podés usar tu nombre si trabajás de forma independiente.'} />
      <TextField required label="Teléfono del negocio" type="tel" inputMode="tel" autoComplete="tel" value={form.businessPhone} onChange={e => onChange('businessPhone', e.target.value)} error={submitted && invalid.businessPhone} helperText={submitted && invalid.businessPhone ? 'Ingresá un teléfono válido' : undefined} />
      <Typography className="register-section-title">Acceso</Typography>
      <TextField required label="Email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={e => onChange('email', e.target.value)} error={submitted && invalid.email} helperText={submitted && invalid.email ? 'Ingresá un email válido' : undefined} />
      <PasswordField required label="Contraseña" autoComplete="new-password" value={form.password} onChange={e => onChange('password', e.target.value)} error={submitted && invalid.password} helperText={submitted && invalid.password ? 'Usá 8 caracteres, mayúscula, minúscula y número' : 'Mínimo 8 caracteres, mayúscula, minúscula y número'} />
      <Box><LinearProgress variant="determinate" value={strength * 25} color={strength >= 3 ? 'success' : strength >= 2 ? 'warning' : 'error'} sx={{ height: 6, borderRadius: 3 }} /><Typography variant="caption" color="text.secondary">Fortaleza: {['muy baja', 'baja', 'media', 'buena', 'fuerte'][strength]}</Typography></Box>
      <PasswordField required label="Confirmar contraseña" autoComplete="new-password" value={form.repeatPassword} onChange={e => onChange('repeatPassword', e.target.value)} error={submitted && invalid.repeatPassword} helperText={submitted && invalid.repeatPassword ? 'Las contraseñas no coinciden.' : undefined} />
      <FormControlLabel control={<Checkbox checked={form.terms} onChange={e => onChange('terms', e.target.checked)} />} label={<span>Leí y acepto los <MuiLink component={Link} target="_blank" rel="noopener noreferrer" to="/terminos-y-condiciones">Términos y Condiciones</MuiLink> y la <MuiLink component={Link} target="_blank" rel="noopener noreferrer" to="/politica-de-privacidad">Política de Privacidad</MuiLink>.</span>} />
      {submitted && invalid.terms && <Typography color="error" variant="caption">Debés aceptar los Términos y Condiciones y la Política de Privacidad para crear tu cuenta.</Typography>}
      <TurnstileWidget onToken={onTurnstileToken} resetKey={turnstileResetKey} />
      {submitted && !turnstileToken && <Typography color="error" variant="caption">Completá la verificación de seguridad.</Typography>}
      <Button className="login-submit" type="submit" size="large" variant="contained" disabled={saving || !turnstileToken} endIcon={!saving && <EastRounded />}>{saving ? 'Creando cuenta…' : 'Crear cuenta'}</Button>
    </Box>
  </>
}

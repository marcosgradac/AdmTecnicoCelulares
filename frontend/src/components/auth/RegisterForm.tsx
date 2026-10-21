import { useState, type ChangeEvent, type FormEvent } from 'react'
import { CheckCircleOutlineRounded, EastRounded, RadioButtonUncheckedRounded, ScheduleRounded } from '@mui/icons-material'
import { Alert, Box, Button, Checkbox, FormControl, FormControlLabel, FormHelperText, LinearProgress, Link as MuiLink, Stack, TextField, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import PasswordField from './PasswordField'
import { passwordRequirements, type RegisterErrors } from './registerValidation'
import { TurnstileWidget } from '../security/TurnstileWidget'

export type RegisterFormState = {
  firstName: string; lastName: string; phone: string; businessName: string; businessPhone: string
  email: string; password: string; repeatPassword: string; terms: boolean
}

export function RegisterForm({ form, errors, submitted, saving, error, strength, turnstileToken, turnstileResetKey, onTurnstileToken, onChange, onSubmit }: {
  form: RegisterFormState; errors: RegisterErrors; submitted: boolean; saving: boolean; error: string; strength: number
  onChange: (field: keyof RegisterFormState, value: string | boolean) => void; onSubmit: (event: FormEvent) => void
  turnstileToken: string; turnstileResetKey: number; onTurnstileToken: (token: string) => void
}) {
  const [touched, setTouched] = useState<Partial<Record<keyof RegisterFormState, boolean>>>({})
  const message = (field: keyof RegisterFormState) => submitted || touched[field] ? errors[field] : undefined
  const props = (field: Exclude<keyof RegisterFormState, 'terms'>) => ({
    id: `register-${field}`, name: field, value: form[field],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (field === 'password') setTouched(current => ({ ...current, password: true }))
      onChange(field, event.target.value)
    },
    onBlur: () => setTouched(current => ({ ...current, [field]: true })),
    error: Boolean(message(field)), helperText: message(field),
  })
  const count = Object.values(errors).filter(Boolean).length
  return <>
    <div className="register-time"><ScheduleRounded />Configurá tu espacio de trabajo en menos de 2 minutos.</div>
    {error && <Alert id="register-server-error" tabIndex={-1} severity="error" role="alert">{error}</Alert>}
    <Box component="form" noValidate className="register-form" onSubmit={onSubmit} aria-busy={saving} sx={{ '& .MuiFormHelperText-root.Mui-error': { color: 'var(--td-error, #B42318)' } }}>
      {submitted && count > 1 && <Alert severity="error" role="alert">Revisá los {count} campos indicados para continuar.</Alert>}
      <Typography className="register-section-title">Datos personales</Typography>
      <Stack className="register-name-row" direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField fullWidth required label="Nombre" autoComplete="given-name" {...props('firstName')} />
        <TextField fullWidth required label="Apellido" autoComplete="family-name" {...props('lastName')} />
      </Stack>
      <TextField required label="Teléfono" type="tel" inputMode="tel" autoComplete="tel" {...props('phone')} />
      <Typography className="register-section-title">Datos del negocio</Typography>
      <TextField required label="Nombre del negocio" {...props('businessName')} helperText={message('businessName') || 'Podés usar tu nombre si trabajás de forma independiente.'} />
      <TextField required label="Teléfono del negocio" type="tel" inputMode="tel" autoComplete="tel" {...props('businessPhone')} />
      <Typography className="register-section-title">Acceso</Typography>
      <TextField required label="Email" type="email" inputMode="email" autoComplete="email" {...props('email')} />
      <PasswordField required label="Contraseña" autoComplete="new-password" {...props('password')} slotProps={{ htmlInput: { 'aria-describedby': `register-password-requirements${message('password') ? ' register-password-helper-text' : ''}` } }} />
      <Box component="ul" id="register-password-requirements" aria-label="Requisitos de la contraseña" sx={{ listStyle: 'none', pl: 0, my: 0, display: 'grid', gap: .5 }}>
        {passwordRequirements(form.password).map(rule => <Box component="li" key={rule.label} sx={{ display: 'flex', alignItems: 'flex-start', gap: .75, color: rule.met ? 'var(--td-success, #168047)' : 'text.secondary' }}>
          {rule.met ? <CheckCircleOutlineRounded aria-hidden="true" sx={{ fontSize: 17, flexShrink: 0, mt: .2 }} /> : <RadioButtonUncheckedRounded aria-hidden="true" sx={{ fontSize: 17, flexShrink: 0, mt: .2 }} />}
          <Typography variant="caption"><Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)' }}>{rule.met ? 'Cumplido: ' : 'Pendiente: '}</Box>{rule.label}</Typography>
        </Box>)}
      </Box>
      <Box><LinearProgress variant="determinate" aria-label="Fortaleza de la contraseña" value={strength * 25} color={strength >= 3 ? 'success' : strength >= 2 ? 'warning' : 'error'} sx={{ height: 6, borderRadius: 3 }} /><Typography variant="caption" color="text.secondary">Fortaleza: {['muy baja', 'baja', 'media', 'buena', 'fuerte'][strength]}. Es orientativa; cumplí todos los requisitos.</Typography></Box>
      <PasswordField required label="Confirmar contraseña" autoComplete="new-password" {...props('repeatPassword')} />
      <FormControl error={Boolean(message('terms'))}>
        <FormControlLabel control={<Checkbox name="terms" checked={form.terms} onBlur={() => setTouched(current => ({ ...current, terms: true }))} onChange={e => onChange('terms', e.target.checked)} slotProps={{ input: { 'aria-describedby': message('terms') ? 'register-terms-error' : undefined, 'aria-invalid': Boolean(message('terms')), 'aria-required': true } }} />} label={<span>Leí y acepto los <MuiLink component={Link} target="_blank" rel="noopener noreferrer" to="/terminos-y-condiciones">Términos y Condiciones</MuiLink> y la <MuiLink component={Link} target="_blank" rel="noopener noreferrer" to="/politica-de-privacidad">Política de Privacidad</MuiLink>.</span>} />
        {message('terms') && <FormHelperText id="register-terms-error">{message('terms')}</FormHelperText>}
      </FormControl>
      <Box id="register-security" tabIndex={-1} aria-describedby={submitted && !turnstileToken ? 'register-security-error' : undefined}>
        <TurnstileWidget onToken={onTurnstileToken} resetKey={turnstileResetKey} />
        {submitted && !turnstileToken && <FormHelperText error id="register-security-error" role="status">Completá la verificación de seguridad para continuar.</FormHelperText>}
      </Box>
      <Button className="login-submit" type="submit" size="large" variant="contained" disabled={saving} endIcon={!saving && <EastRounded />}>{saving ? 'Creando cuenta…' : 'Crear cuenta'}</Button>
    </Box>
  </>
}

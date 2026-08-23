import type { FormEvent } from 'react'
import { EmailRounded, EastRounded } from '@mui/icons-material'
import { Alert, Box, Button, InputAdornment, Link as MuiLink, TextField, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import PasswordField from './PasswordField'

export function LoginForm({ email, password, saving, error, onEmailChange, onPasswordChange, onSubmit }: {
  email: string
  password: string
  saving: boolean
  error: string
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return <>
    {error && <Alert severity="error">{error}</Alert>}
    <Box component="form" className="login-form" onSubmit={onSubmit}>
      <TextField required label="Email" type="email" autoComplete="email" inputMode="email" value={email}
        onChange={event => onEmailChange(event.target.value)}
        InputProps={{ startAdornment: <InputAdornment position="start"><EmailRounded /></InputAdornment> }} />
      <PasswordField required showLeadingIcon value={password} onChange={event => onPasswordChange(event.target.value)} />
      <MuiLink className="login-forgot" component={Link} to="/olvide-mi-contrasena" underline="hover">Olvidé mi contraseña</MuiLink>
      <Button className="login-submit" type="submit" size="large" variant="contained" disabled={saving || !email.trim() || !password} endIcon={!saving && <EastRounded />}>
        {saving ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </Button>
    </Box>
    <Typography className="login-register" variant="body2" textAlign="center">¿Todavía no tenés cuenta? <Link to="/register">Crear cuenta</Link></Typography>
    <Typography className="login-legal-note" variant="caption" textAlign="center">Al utilizar TecnoDesk aceptás nuestros <Link to="/terminos-y-condiciones">Términos y Condiciones</Link>.</Typography>
  </>
}

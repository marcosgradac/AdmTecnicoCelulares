import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { Box, CircularProgress, Stack, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { BrandLogo } from '../brand/BrandLogo'
import type { AuthVisualVariant } from './auth-visual.types'
import './auth-mobile.scss'

function AuthVisualFallback() {
  return <Box height="100%" minHeight={{ xs: 240, md: '100vh' }} display="grid" color="#fff" sx={{
    placeItems: 'center',
    background: 'radial-gradient(circle at 70% 30%, rgba(90,205,255,.38), transparent 35%), linear-gradient(145deg, #4325be, #6848df 52%, #268fd8)',
  }}>
    <Stack alignItems="center" spacing={1.5}>
      <BrandLogo compact className="auth-fallback-logo" />
      <Typography fontSize={24} fontWeight={900}>TecnoDesk</Typography>
      <Typography fontSize={13} sx={{ opacity: .75 }}>Gestión técnica inteligente</Typography>
    </Stack>
  </Box>
}

const AuthVisualHero = lazy(() =>
  import('./AuthVisualHero').catch(error => {
    console.error('No se pudo cargar el hero de autenticación', error)
    return { default: AuthVisualFallback }
  }),
)

class AuthVisualErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error renderizando el hero de autenticación', error, info)
  }
  render() {
    return this.state.failed ? <AuthVisualFallback /> : this.props.children
  }
}

export function AuthLayout({ title, description, children, variant = 'login' }: {
  title: string
  description: string
  children: ReactNode
  variant?: AuthVisualVariant
}) {
  return <Box className={`auth-page auth-page--${variant}`} minHeight="100vh" display="grid" sx={{
    gridTemplateColumns: { xs: '1fr', md: ['login', 'register'].includes(variant) ? 'minmax(560px, 52%) minmax(520px, 48%)' : 'minmax(360px, 45%) minmax(520px, 55%)' },
    gridTemplateRows: { xs: '240px auto', md: '1fr' },
    bgcolor: '#f6f7fb',
    '& > .auth-visual-slot': { display: { xs: 'none', md: 'block' } },
    '@media (max-width: 480px) and (max-height: 700px)': {
      gridTemplateRows: '0 auto',
      '& > .auth-visual-slot': { display: 'none' },
    },
  }}>
    <Box minWidth={0} className="auth-visual-slot">
      <AuthVisualErrorBoundary>
        <Suspense fallback={<Box height="100%" display="grid" bgcolor="#5536d9" color="#fff" sx={{ placeItems: 'center' }}><CircularProgress color="inherit" size={28} /></Box>}>
          <AuthVisualHero variant={variant} />
        </Suspense>
      </AuthVisualErrorBoundary>
    </Box>
    <Box className="auth-form-region" display="grid" px={{ xs: 3, sm: 4, md: 6 }} py={{ xs: 3, md: 5 }} sx={{ placeItems: 'center' }}>
      <Box className="auth-form-surface" sx={{ width: '100%', maxWidth: 460, borderRadius: 0, p: { xs: 2.5, sm: 4 }, bgcolor: 'transparent', border: 'none', boxShadow: 'none' }}>
        {!['login', 'register'].includes(variant) && <Link className="auth-back-link" to="/">← Volver al inicio</Link>}
        {['login', 'register'].includes(variant)
          ? <>{<BrandLogo className="auth-form-logo" />}{variant === 'register' && <Typography variant="h1" fontSize={{ xs: 27, sm: 32 }}>{title}</Typography>}</>
          : <><Stack direction="row" spacing={1.25} alignItems="center" mb={3} sx={{ display: { md: 'none' } }}>
            <BrandLogo compact className="auth-mobile-logo" />
            <Typography fontSize={20} fontWeight={900}>TecnoDesk</Typography>
          </Stack><Typography variant="h1" fontSize={{ xs: 28, sm: 34 }}>{title}</Typography></>}
        <Typography color="text.secondary" mt={variant === 'register' ? 0.75 : 1} mb={3}>{description}</Typography>
        <Stack className="auth-content-stack" spacing={variant === 'login' ? 0 : 2}>{children}</Stack>
      </Box>
    </Box>
  </Box>
}

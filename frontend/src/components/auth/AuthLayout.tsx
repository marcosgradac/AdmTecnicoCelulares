import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { Box, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import { BuildRounded } from '@mui/icons-material'
import { Link } from 'react-router-dom'
import type { AuthVisualVariant } from './auth-visual.types'
import './auth-mobile.scss'

function AuthVisualFallback() {
  return <Box height="100%" minHeight={{ xs: 240, md: '100vh' }} display="grid" color="#fff" sx={{
    placeItems: 'center',
    background: 'radial-gradient(circle at 70% 30%, rgba(90,205,255,.38), transparent 35%), linear-gradient(145deg, #4325be, #6848df 52%, #268fd8)',
  }}>
    <Stack alignItems="center" spacing={1.5}>
      <Box width={72} height={72} display="grid" borderRadius={4} bgcolor="rgba(255,255,255,.16)" sx={{ placeItems: 'center' }}><BuildRounded fontSize="large" /></Box>
      <Typography fontSize={24} fontWeight={900}>CelluFix</Typography>
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
  return <Box className="auth-page" minHeight="100vh" display="grid" sx={{
    gridTemplateColumns: { xs: '1fr', md: 'minmax(420px, 1fr) minmax(520px, 1.05fr)' },
    gridTemplateRows: { xs: '240px auto', md: '1fr' },
    bgcolor: '#f6f7fb',
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
    <Box className="auth-form-region" display="grid" px={{ xs: 2, sm: 4, md: 7 }} py={{ xs: 3, md: 5 }} sx={{ placeItems: 'center' }}>
      <Paper className="auth-form-surface" elevation={0} sx={{ width: '100%', maxWidth: 520, borderRadius: 5, p: { xs: 3, sm: 4.5 }, border: '1px solid', borderColor: 'divider', boxShadow: '0 24px 70px rgba(35,27,78,.10)' }}>
        <Link className="auth-back-link" to="/">← Volver al inicio</Link>
        <Stack direction="row" spacing={1.25} alignItems="center" mb={3} sx={{ display: { md: 'none' } }}>
          <Box width={42} height={42} display="grid" borderRadius={2.5} bgcolor="primary.main" color="#fff" sx={{ placeItems: 'center' }}><BuildRounded /></Box>
          <Typography fontSize={20} fontWeight={900}>CelluFix</Typography>
        </Stack>
        <Typography variant="h1" fontSize={{ xs: 28, sm: 34 }}>{title}</Typography>
        <Typography color="text.secondary" mt={1} mb={3}>{description}</Typography>
        <Stack spacing={2}>{children}</Stack>
      </Paper>
    </Box>
  </Box>
}

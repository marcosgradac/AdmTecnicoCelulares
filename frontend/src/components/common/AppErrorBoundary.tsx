import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Box, Button, Card, CardContent, Typography } from '@mui/material'
import { RefreshRounded } from '@mui/icons-material'

interface Props { children: ReactNode }
interface State { hasError: boolean; message?: string }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('Error no controlado en la aplicación', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <Box minHeight="100vh" display="grid" px={2} sx={{ placeItems: 'center', bgcolor: 'var(--td-bg, #F8F9FC)', color: 'var(--td-text, #171A23)', fontFamily: '"Inter", "Manrope", "Segoe UI", sans-serif' }}>
        <Card sx={{ width: '100%', maxWidth: 480, bgcolor: 'var(--td-paper, #fff)', color: 'inherit', border: '1px solid var(--td-border, #E8EAF0)', borderRadius: '12px', boxShadow: 'var(--td-shadow, 0 6px 24px rgba(23,26,35,.045))' }}>
          <CardContent sx={{ textAlign: 'center', py: 5 }}>
            <Typography variant="h2" sx={{ fontSize: '1.25rem', fontWeight: 750, fontFamily: 'inherit' }}>No pudimos mostrar esta pantalla</Typography>
            <Typography color="var(--td-muted, #687083)" mt={1} sx={{ fontFamily: 'inherit' }}>
              Recargá la aplicación. Si el problema continúa, revisá la conexión con el servidor.
            </Typography>
            {import.meta.env.DEV && this.state.message && <Typography component="code" display="block" mt={2} fontSize={12}>{this.state.message}</Typography>}
            <Button variant="contained" startIcon={<RefreshRounded />} sx={{ mt: 3, bgcolor: 'var(--td-primary, #5B3FD6)', color: 'var(--td-button-text, #fff)', borderRadius: '10px', minHeight: 44, fontFamily: 'inherit', '&:hover': { bgcolor: 'var(--td-primary-hover, #4327B7)' } }} onClick={() => window.location.reload()}>
              Recargar
            </Button>
          </CardContent>
        </Card>
      </Box>
    )
  }
}

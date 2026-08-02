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
      <Box minHeight="100vh" display="grid" px={2} sx={{ placeItems: 'center', bgcolor: 'background.default' }}>
        <Card sx={{ width: '100%', maxWidth: 480 }}>
          <CardContent sx={{ textAlign: 'center', py: 5 }}>
            <Typography variant="h2">No pudimos mostrar esta pantalla</Typography>
            <Typography color="text.secondary" mt={1}>
              Recargá la aplicación. Si el problema continúa, revisá la conexión con el servidor.
            </Typography>
            {import.meta.env.DEV && this.state.message && <Typography component="code" display="block" mt={2} fontSize={12}>{this.state.message}</Typography>}
            <Button variant="contained" startIcon={<RefreshRounded />} sx={{ mt: 3 }} onClick={() => window.location.reload()}>
              Recargar
            </Button>
          </CardContent>
        </Card>
      </Box>
    )
  }
}

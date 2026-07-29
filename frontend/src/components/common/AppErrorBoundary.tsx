import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Box, Button, Card, CardContent, Typography } from '@mui/material'
import { RefreshRounded } from '@mui/icons-material'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // React reports the error in development; the user receives a recoverable UI.
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
            <Button variant="contained" startIcon={<RefreshRounded />} sx={{ mt: 3 }} onClick={() => window.location.reload()}>
              Recargar
            </Button>
          </CardContent>
        </Card>
      </Box>
    )
  }
}

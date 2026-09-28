import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { useAuth } from './AuthContext'

export function ProtectedRoute() {
  const { user, loading, connectionError, retrySession } = useAuth()
  const location = useLocation()
  if (loading) return <Box minHeight="100vh" display="grid" sx={{ placeItems: 'center' }}><CircularProgress/></Box>
  // A stored token plus a failed refresh means the server was unreachable, not that the
  // session ended. Sending the user to /login would look like the app forgot them.
  if (connectionError) return <Box minHeight="100vh" display="grid" sx={{ placeItems: 'center', p: 2 }}>
    <Stack spacing={2} sx={{ maxWidth: 420, textAlign: 'center' }}>
      <Alert severity="warning">No pudimos conectar con el servidor. Revisá tu conexión e intentá nuevamente.</Alert>
      <Typography variant="body2" color="text.secondary">Tu sesión sigue activa: no vas a perder nada.</Typography>
      <Button variant="contained" onClick={retrySession}>Reintentar</Button>
    </Stack>
  </Box>
  return user ? <Outlet/> : <Navigate to="/login" replace state={{ from: location.pathname }}/>
}

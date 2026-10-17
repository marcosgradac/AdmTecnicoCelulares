import { Link } from 'react-router-dom'
import { Box, Button, Typography } from '@mui/material'

export function NotFoundPage() {
  return <Box component="main" sx={{ maxWidth: 640, mx: 'auto', p: 4, textAlign: 'center' }}>
    <Typography variant="h1" sx={{ fontSize: '2rem' }}>Página no encontrada</Typography>
    <Typography sx={{ my: 2 }}>La dirección que ingresaste no existe.</Typography>
    <Button component={Link} to="/">Volver a TecnoDesk</Button>
  </Box>
}

import { Button, Card, CardContent, Stack, Typography } from '@mui/material'
import { LockRounded } from '@mui/icons-material'

/**
 * Bloqueo de plan del módulo Comercio. Se comparte entre Comercio y Punto de venta
 * para que ambas pantallas respeten exactamente el mismo feature gate, sin duplicar
 * la pantalla ni el mensaje.
 */
export function LockedCommerce({ onUpgrade }: { onUpgrade: () => void }) {
  return <Card><CardContent><Stack alignItems="center" textAlign="center" spacing={2} py={8}><LockRounded color="primary" sx={{ fontSize: 52 }} /><Typography variant="h1">Comercio está incluido en el Plan Completo</Typography><Typography color="text.secondary" maxWidth={560}>Vendé cargadores, cables, fundas y otros accesorios con stock, caja y ganancia por producto.</Typography><Button variant="contained" onClick={onUpgrade}>Mejorar plan</Button></Stack></CardContent></Card>
}
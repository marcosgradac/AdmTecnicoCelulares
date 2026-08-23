import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { useState } from 'react'
export function TrialStartedDialog() {
  const [open, setOpen] = useState(() => sessionStorage.getItem('tecnodesk_trial_started') === 'true')
  const close = () => { sessionStorage.removeItem('tecnodesk_trial_started'); setOpen(false) }
  return <Dialog open={open} onClose={close} fullWidth maxWidth="xs"><DialogTitle>Tu prueba gratuita comenzó</DialogTitle><DialogContent><Typography>Tenés 30 días para usar todas las funciones de TecnoDesk.</Typography></DialogContent><DialogActions><Button variant="contained" onClick={close}>Empezar</Button></DialogActions></Dialog>
}

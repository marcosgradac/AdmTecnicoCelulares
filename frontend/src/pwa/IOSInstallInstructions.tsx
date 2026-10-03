/**
 * Diálogo con los pasos para instalar TecnoDesk en iPhone o iPad.
 *
 * En iOS no existe `beforeinstallprompt`: el único camino es "Compartir >
 * Añadir a pantalla de inicio". No se intenta imitar el diálogo nativo de
 * Apple, solo se explican los tres pasos con la iconografía de Material.
 */
import { Box, Button, Dialog, DialogContent, Stack, Typography } from '@mui/material'
import { AddToHomeScreenRounded, CloseRounded, IosShareRounded } from '@mui/icons-material'

const STEPS = [
  { icon: IosShareRounded, text: 'Tocá el botón Compartir.' },
  { icon: AddToHomeScreenRounded, text: 'Elegí “Añadir a pantalla de inicio”.' },
  { icon: null, text: 'Tocá “Añadir”.' },
]

export interface IOSInstallInstructionsProps {
  open: boolean
  onClose: () => void
}

export function IOSInstallInstructions({ open, onClose }: IOSInstallInstructionsProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="ios-install-title">
      <DialogContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
          <Typography id="ios-install-title" fontWeight={750} fontSize={17}>
            Instalar TecnoDesk
          </Typography>
          <Button onClick={onClose} aria-label="Cerrar instrucciones" sx={{ minWidth: 0, minHeight: 36, px: 1 }}>
            <CloseRounded fontSize="small" />
          </Button>
        </Stack>
        <Stack component="ol" spacing={2} sx={{ listStyle: 'none', m: 0, mt: 2, p: 0 }}>
          {STEPS.map((step, index) => (
            <Stack key={step.text} direction="row" spacing={1.5} alignItems="center">
              <Box
                aria-hidden
                sx={{
                  width: 32,
                  height: 32,
                  flex: '0 0 32px',
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: '10px',
                  bgcolor: 'primary.light',
                  color: 'primary.main',
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {step.icon ? <step.icon fontSize="small" /> : index + 1}
              </Box>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {step.text}
              </Typography>
            </Stack>
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2.5 }}>
          TecnoDesk queda instalado con su ícono y se abre como aplicación.
        </Typography>
      </DialogContent>
    </Dialog>
  )
}
/**
 * Aviso de que hay una versión nueva de TecnoDesk.
 *
 * Decisiones de diseño:
 *
 * - NO es un modal y NO bloquea: no roba el foco, no impide scrollear y no
 *   deshabilita nada. Se puede seguir trabajando mientras se lee.
 * - Aparece en cualquier ruta, incluido el admin: si el usuario tiene una
 *   reparación a medio cargar, este aviso es justamente el que NO debe
 *   interrumpirlo. Por eso vive arriba y se puede cerrar.
 * - While se muestra, la app sigue con la versión actual. Recién al tocar
 *   "Actualizar ahora" se promueve el worker y se recarga una sola vez.
 * - Se autodestruye pasado un rato si nadie lo mira, para no quedar flotando
 *   sobre el trabajo. La versión nueva no se pierde: el worker sigue esperando
 *   y el aviso vuelve a ofrecerse en la próxima carga.
 */
import { useEffect, useState } from 'react'
import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import { CloseRounded, SystemUpdateRounded } from '@mui/icons-material'
import { applyServiceWorkerUpdate, useServiceWorkerUpdate } from './useServiceWorkerUpdate'

/** Si nadie interactúa, el aviso se retira solo. */
const AUTO_HIDE_MS = 20000

export function UpdateNotice() {
  const { available, applying } = useServiceWorkerUpdate()
  const [dismissed, setDismissed] = useState(false)

  // Un aviso nuevo (por ejemplo, tras una recarga) vuelve a poder mostrarse.
  useEffect(() => {
    if (available) setDismissed(false)
  }, [available])

  const open = available && !dismissed

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => setDismissed(true), AUTO_HIDE_MS)
    return () => clearTimeout(timer)
  }, [open])

  if (!open) return null

  return (
    <Paper
      role="status"
      aria-live="polite"
      elevation={8}
      sx={{
        position: 'fixed',
        zIndex: theme => theme.zIndex.snackbar,
        top: 'calc(12px + env(safe-area-inset-top))',
        left: { xs: 12, sm: 20 },
        right: { xs: 12, sm: 'auto' },
        width: { xs: 'auto', sm: 372 },
        maxWidth: 'calc(100vw - 24px)',
        p: 2,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <SystemUpdateRounded color="primary" sx={{ mt: 0.25 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography fontWeight={750} fontSize={14.5} sx={{ flex: 1 }}>
              Hay una nueva versión de TecnoDesk disponible.
            </Typography>
            <Button
              onClick={() => setDismissed(true)}
              aria-label="Cerrar el aviso de actualización"
              sx={{ minWidth: 0, minHeight: 32, px: 0.5, color: 'text.secondary' }}
            >
              <CloseRounded fontSize="small" />
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {applying
              ? 'Actualizando…'
              : 'Podés seguir trabajando. La app se recarga solo cuando vos lo decidís.'}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button
              onClick={applyServiceWorkerUpdate}
              variant="contained"
              disableElevation
              disabled={applying}
              startIcon={<SystemUpdateRounded />}
              sx={{ minHeight: 40 }}
            >
              {applying ? 'Actualizando…' : 'Actualizar ahora'}
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Paper>
  )
}
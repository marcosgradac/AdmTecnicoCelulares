/**
 * Aviso de instalación de TecnoDesk.
 *
 * Decisiones de diseño, todas deliberadas:
 *
 * - Es una tarjeta flotante discreta, NO un modal. No bloquea el scroll, no
 *   roba el foco y no impide seguir usando la app mientras se lee.
 * - Aparece en la landing y también dentro del admin, porque alguien puede
 *   entrar directamente a `/admin` y es el mismo usuario.
 * - No se muestra en login ni en registro: interrumpir el ingreso es la peor
 *   forma de pedirle algo a alguien que todavía no eligió entrar.
 * - Respeta `env(safe-area-inset-bottom)` para no quedar debajo del gesto de
 *   inicio del iPhone ni de la barra inferior de Android.
 * - Se oculta sola pasado un tiempo si nadie interactúa, para no quedar
 *   flotando eternamente sobre el trabajo.
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import { CloseRounded, InstallMobileRounded } from '@mui/icons-material'
import { useInstallPrompt } from './useInstallPrompt'
import { IOSInstallInstructions } from './IOSInstallInstructions'
import { INSTALL_PROMPT_COOLDOWN_DAYS } from './installCooldown'

/**
 * Icono que se muestra en la tarjeta. Se toma del archivo público en vez de
 * importar el PNG grande desde `assets`: así no se empaqueta una imagen de
 * ~400 kB dentro del JS, y además el service worker ya lo tiene precacheado.
 */
const INSTALL_PROMPT_ICON = '/tecnodesk-192.png'

/** Espera antes de ofrecer instalar, para no competir con el primer render. */
const SHOW_DELAY_MS = 4000
/** Si nadie interactúa, el aviso se retira solo. */
const AUTO_HIDE_MS = 20000

/** Rutas donde nunca se ofrece: son pantallas de ingreso o de sólo lectura. */
const EXCLUDED_PATH_PREFIXES = [
  '/login',
  '/register',
  '/registro',
  '/olvide-mi-contrasena',
  '/restablecer-contrasena',
  '/seguimiento',
]

function isExcludedPath(pathname: string): boolean {
  return EXCLUDED_PATH_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function InstallPrompt() {
  const { state, controller } = useInstallPrompt()
  const location = useLocation()
  const [delayed, setDelayed] = useState(false)
  const [autoHidden, setAutoHidden] = useState(false)
  const interacted = useRef(false)

  // No interrumpe la primera pintura: el aviso aparece cuando la página ya se
  // asentó y el usuario está leyendo o trabajando.
  useEffect(() => {
    const timer = setTimeout(() => setDelayed(true), SHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!state.visible) setAutoHidden(false)
  }, [state.visible])

  const open = state.visible && delayed && !autoHidden && !isExcludedPath(location.pathname)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      if (!interacted.current) setAutoHidden(true)
    }, AUTO_HIDE_MS)
    return () => clearTimeout(timer)
  }, [open])

  if (!controller) return null

  const handleInstall = async () => {
    interacted.current = true
    if (state.method === 'ios-manual') {
      controller.openInstructions()
      return
    }
    // El prompt nativo solo puede abrirse desde un gesto del usuario: este
    // click ES ese gesto, por eso se llama acá y no dentro de un efecto.
    await controller.promptInstall()
  }

  const handleDismiss = () => {
    interacted.current = true
    controller.dismiss()
  }
return (
    <>
      {open && (
        <Paper
          role="region"
          aria-label="Instalar TecnoDesk"
          elevation={8}
          sx={{
            position: 'fixed',
            // Por debajo de los diálogos modales (MUI usa 1300) para no
            // competir con ellos, pero por encima del contenido de la página.
            zIndex: theme => theme.zIndex.snackbar,
            left: { xs: 12, sm: 20 },
            right: { xs: 12, sm: 'auto' },
            bottom: 'calc(20px + env(safe-area-inset-bottom))',
            width: { xs: 'auto', sm: 356 },
            maxWidth: 'calc(100vw - 24px)',
            p: 2,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <Box
              component="img"
              src={INSTALL_PROMPT_ICON}
              alt=""
              aria-hidden
              sx={{ width: 44, height: 44, flex: '0 0 44px', objectFit: 'contain' }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography fontWeight={750} fontSize={14.5} sx={{ flex: 1 }}>
                  Instalá TecnoDesk
                </Typography>
                <Button
                  onClick={handleDismiss}
                  aria-label="Ahora no. No mostrar de nuevo por unos días."
                  sx={{ minWidth: 0, minHeight: 32, px: 0.5, color: 'text.secondary' }}
                >
                  <CloseRounded fontSize="small" />
                </Button>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                Accedé más rápido desde tu computadora o celular.
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                <Button
                  onClick={handleInstall}
                  variant="contained"
                  disableElevation
                  startIcon={<InstallMobileRounded />}
                  sx={{ minHeight: 40 }}
                >
                  Instalar
                </Button>
                <Button onClick={handleDismiss} sx={{ minHeight: 40, color: 'text.secondary' }}>
                  Ahora no
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                No lo volvemos a mostrar por {INSTALL_PROMPT_COOLDOWN_DAYS} días.
              </Typography>
            </Box>
          </Stack>
        </Paper>
      )}
      <IOSInstallInstructions open={state.instructionsOpen} onClose={controller.closeInstructions} />
    </>
  )
}
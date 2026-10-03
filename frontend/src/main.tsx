import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { theme } from './theme/theme'
import './styles/global.scss'
import { AppErrorBoundary } from './components/common/AppErrorBoundary'
import { AuthProvider } from './auth/AuthContext'
import { registerServiceWorker } from './pwa/serviceWorkerRegistration'
import { setServiceWorkerUpdateController } from './pwa/useServiceWorkerUpdate'

// Registra el service worker que habilita la instalación de TecnoDesk como
// aplicación. Se hace después del render para no competir con el primer pintado.
//
// El controlador se guarda para que la interfaz pueda ofrecer "Actualizar ahora".
// Mientras haya una versión nueva esperando NO se recarga nada: la app sigue
// funcionando con la versión actual hasta que el usuario lo decide.
setServiceWorkerUpdateController(registerServiceWorker())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider theme={theme}><CssBaseline /><AppErrorBoundary><AuthProvider><App /></AuthProvider></AppErrorBoundary></ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)

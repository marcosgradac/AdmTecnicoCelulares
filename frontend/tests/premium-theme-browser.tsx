import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CssBaseline } from '@mui/material'
import App from '../src/App'
import { AuthProvider } from '../src/auth/AuthContext'
import { AppThemeProvider } from '../src/theme/AppThemeProvider'
import { AppErrorBoundary } from '../src/components/common/AppErrorBoundary'
import '../src/styles/global.scss'
// Actual application providers and routes; deliberately no service worker registration.
const route = new URLSearchParams(window.location.search).get('route') || window.location.pathname + window.location.search + window.location.hash
const failStartup = new URL(route, location.origin).searchParams.has('fixture-error')
function StartupFailure(): React.ReactNode { throw new Error('Fallo ficticio de inicialización') }
window.history.replaceState(null, '', route)
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><AppErrorBoundary>{failStartup ? <StartupFailure/> : <AuthProvider><AppThemeProvider><CssBaseline/><AppErrorBoundary><App/></AppErrorBoundary></AppThemeProvider></AuthProvider>}</AppErrorBoundary></BrowserRouter></React.StrictMode>
)

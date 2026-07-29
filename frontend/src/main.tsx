import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CssBaseline, ThemeProvider } from '@mui/material'
import App from './App'
import { theme } from './theme/theme'
import './styles/global.scss'
import { AppErrorBoundary } from './components/common/AppErrorBoundary'
import { AuthProvider } from './auth/AuthContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppErrorBoundary><AuthProvider><App /></AuthProvider></AppErrorBoundary>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)

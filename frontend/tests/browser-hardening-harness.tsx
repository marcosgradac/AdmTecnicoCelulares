import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { theme } from '../src/theme/theme'
import { AuthProvider } from '../src/auth/AuthContext'
import { ClientsPage } from '../src/pages/ClientsPage'
import { RepairDetailPage } from '../src/pages/RepairDetailPage'
import { TrackingPage } from '../src/pages/TrackingPage'
import { ResetPasswordPage } from '../src/pages/ResetPasswordPage'
import { TurnstileWidget } from '../src/components/security/TurnstileWidget'
const view=new URLSearchParams(location.search).get('view')
const testRoutes=<Routes>
  <Route path="/clients" element={<ClientsPage/>}/>
  <Route path="/repairs/:id" element={<RepairDetailPage/>}/>
  <Route path="/tracking/:token" element={<TrackingPage/>}/>
</Routes>
function Captcha(){const [token,setToken]=React.useState('');return <><TurnstileWidget onToken={setToken}/><p data-testid="captcha-token">{token?'accepted':'pending'}</p></>}
createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline/><AuthProvider>
  {view==='reset'?<BrowserRouter><ResetPasswordPage/></BrowserRouter>:view==='captcha'?<Captcha/>:<MemoryRouter initialEntries={[view==='clients'?'/clients':view==='repair'?'/repairs/r1':'/tracking/synthetic-token']} >{testRoutes}</MemoryRouter>}
</AuthProvider></ThemeProvider>)

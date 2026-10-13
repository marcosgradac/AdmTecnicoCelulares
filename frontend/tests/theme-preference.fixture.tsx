import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Button, CssBaseline, Dialog, DialogContent, Menu, MenuItem, TextField, useTheme } from '@mui/material'
import { AuthProvider, useAuth } from '../src/auth/AuthContext'
import { AppThemeProvider, useAppTheme } from '../src/theme/AppThemeProvider'
import { AppearanceCard } from '../src/features/settings/AppearanceCard'
import { AdminVisualScope } from '../src/components/admin/AdminVisualScope'
import '../src/styles/global.scss'
function Controls() {
 const auth = useAuth(), theme = useAppTheme(), mui = useTheme()
 const [dialog,setDialog] = useState(false), [anchor,setAnchor] = useState<HTMLElement|null>(null)
 return <><output data-testid="session-revision">{auth.sessionRevision}</output><output data-testid="full-name">{auth.user?.fullName}</output><output data-testid="identity">{auth.user?.id ?? 'signed-out'}</output><output data-testid="preference">{theme.preference}</output><output data-testid="mode">{theme.mode}</output><output data-testid="mui-mode">{mui.palette.mode}</output><output data-testid="saving">{String(theme.saving)}</output>
 <Button onClick={() => void auth.login('a@example.com','synthetic')}>Login A</Button><Button onClick={() => void auth.login('b@example.com','synthetic')}>Login B</Button><Button onClick={auth.logout}>Logout</Button><Button onClick={() => void theme.setPreference('SYSTEM')}>System</Button>
 {auth.user && <AppearanceCard />}<TextField label="Synthetic input"/><Button onClick={() => setDialog(true)}>Open dialog</Button><Dialog open={dialog} onClose={() => setDialog(false)}><DialogContent><TextField label="Dialog input"/><Button onClick={() => setDialog(false)}>Close dialog</Button></DialogContent></Dialog><Button onClick={event => setAnchor(event.currentTarget)}>Open menu</Button><Menu open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}><MenuItem onClick={() => setAnchor(null)}>Synthetic menu item</MenuItem></Menu></>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AuthProvider><AppThemeProvider><CssBaseline/><AdminVisualScope enabled><Controls/></AdminVisualScope></AppThemeProvider></AuthProvider></BrowserRouter></React.StrictMode>)

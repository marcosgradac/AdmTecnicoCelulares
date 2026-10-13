import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CssBaseline, ThemeProvider, Box } from '@mui/material'
import { createTheme } from '@mui/material/styles'
import { AuthProvider } from '../src/auth/AuthContext'
import { EquipmentSalesPage } from '../src/features/equipmentSales/EquipmentSalesPage'
import { theme } from '../src/theme/theme'
const dark = new URLSearchParams(location.search).has('dark')
const fixtureTheme = dark ? createTheme({ ...theme, palette: { mode: 'dark', primary: { main: '#aa96ff' }, success: { main: '#7adba9' }, error: { main: '#ff9494' } }, components: { ...theme.components, MuiCssBaseline: { styleOverrides: {} }, MuiCard: { styleOverrides: { root: { backgroundImage: 'none', borderRadius: 12 } } }, MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: 'transparent' } } } } }) : theme
createRoot(document.getElementById('root')!).render(<ThemeProvider theme={fixtureTheme}><CssBaseline /><BrowserRouter><AuthProvider><Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1280, mx: 'auto' }}><EquipmentSalesPage /></Box></AuthProvider></BrowserRouter></ThemeProvider>)

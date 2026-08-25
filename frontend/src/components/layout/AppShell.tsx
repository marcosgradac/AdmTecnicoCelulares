import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppBar, Avatar, Box, Divider, Drawer, Fab, IconButton, InputAdornment, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, TextField, Toolbar, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import { AccountCircleRounded, AdminPanelSettingsRounded, BuildRounded, DashboardRounded, GroupsRounded, LogoutRounded, MenuRounded, PeopleRounded, PointOfSaleRounded, SearchRounded, SettingsRounded, VerifiedRounded, WorkspacePremiumRounded } from '@mui/icons-material'
import { useAuth } from '../../auth/AuthContext'
import { ProfileCompletionDialog } from '../auth/ProfileCompletionDialog'
import { canAccess, type Permission } from '../../auth/permissions'
import styles from './AppShell.module.scss'
import { BrandLogo } from '../brand/BrandLogo'
import { SubscriptionProvider } from '../../features/billing/SubscriptionContext'
import { SubscriptionBanner } from '../../features/billing/SubscriptionBanner'
import { TrialStartedDialog } from '../../features/billing/TrialStartedDialog'

const navItems: Array<{ label: string; path: string; icon: typeof DashboardRounded; permission?: Permission; ownerOnly?: boolean }> = [
  { label: 'Inicio', path: '/admin', icon: DashboardRounded, ownerOnly: true },
  { label: 'Reparaciones', path: '/admin/reparaciones', icon: BuildRounded, permission: 'repairs.view' },
  { label: 'Clientes', path: '/admin/clientes', icon: PeopleRounded, permission: 'clients.view' },
  { label: 'Caja', path: '/admin/caja', icon: PointOfSaleRounded, permission: 'cash.view' },
  { label: 'Empleados', path: '/admin/empleados', icon: GroupsRounded, permission: 'team.view' },
  { label: 'Garantías', path: '/admin/garantias', icon: VerifiedRounded, ownerOnly: true },
  { label: 'Suscripción', path: '/admin/suscripcion', icon: WorkspacePremiumRounded, ownerOnly: true },
  { label: 'Configuración', path: '/admin/configuracion', icon: SettingsRounded, permission: 'settings.access' },
]

function AppShellContent() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null)
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const location = useLocation()
  const navigate = useNavigate()
  const go = (path: string) => { navigate(path); setOpen(false) }
  const selected = (path: string) => path === '/admin' ? location.pathname === path : location.pathname.startsWith(path)
  const initials = user?.fullName.split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || 'U'
  const roleLabel = user?.role === 'OWNER' ? 'Propietario' : 'Técnico'
  const closeAccount = () => setAccountAnchor(null)
  const visibleNavItems = navItems.filter(item => (!item.ownerOnly || user?.role === 'OWNER') && (!item.permission || canAccess(user, item.permission)))

  const drawer = <Box className={styles.drawer}>
    <Box className={styles.brand}><BrandLogo compact className={styles.logoMark} /><BrandLogo className={styles.logoFull} /></Box>
    <Typography className={styles.navLabel}>MENÚ PRINCIPAL</Typography>
    <List className={styles.nav}>{visibleNavItems.map(({ label, path, icon: Icon }) => <Tooltip key={path} title={!mobile ? label : ''} placement="right"><ListItemButton selected={selected(path)} onClick={() => go(path)}><ListItemIcon><Icon /></ListItemIcon><ListItemText primary={label} /></ListItemButton></Tooltip>)}</List>
    <Box className={styles.bottom}>
      <ListItemButton onClick={logout}><ListItemIcon><LogoutRounded /></ListItemIcon><ListItemText primary="Cerrar sesión" /></ListItemButton>
      <Box className={styles.account}><Avatar>{initials}</Avatar><Box><Typography fontSize={13} fontWeight={700}>{user?.fullName}</Typography><Typography variant="caption" color="text.secondary">{user?.business.name} · {roleLabel}</Typography></Box></Box>
    </Box>
  </Box>

  return <Box className={styles.shell}>
    {!mobile && <Drawer variant="permanent" open>{drawer}</Drawer>}
    <Drawer open={mobile && open} onClose={() => setOpen(false)} PaperProps={{ sx: { width: 272 } }}>{drawer}</Drawer>
    <AppBar className={styles.header} position="fixed" color="inherit" elevation={0}><Toolbar>
      {mobile && <IconButton aria-label="Abrir menú" onClick={() => setOpen(true)}><MenuRounded /></IconButton>}
      {mobile ? <Box className={styles.mobileBrand}><BrandLogo /></Box> : <TextField placeholder="Buscar reparación, cliente o equipo…" aria-label="Búsqueda global" className={styles.search} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> }} />}
      <Box flex={1} />
      <Box className={styles.headerUser} role="button" tabIndex={0} aria-label="Abrir menú de cuenta" onClick={event => setAccountAnchor(event.currentTarget)} onKeyDown={event => { if (event.key === 'Enter') setAccountAnchor(event.currentTarget) }} sx={{ cursor: 'pointer' }}><Avatar>{initials}</Avatar><Box><Typography fontSize={13} fontWeight={700}>{user?.fullName}</Typography><Typography variant="caption" color="text.secondary">{user?.business.name}</Typography></Box></Box>
    </Toolbar></AppBar>
    <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={closeAccount} slotProps={{ paper: { sx: { minWidth: 230, mt: 1 } } }}>
      <Box px={2} py={1}><Typography fontWeight={800}>{user?.fullName}</Typography><Typography variant="caption" color="text.secondary">{roleLabel} · {user?.business.name}</Typography></Box>
      <Divider />
      <MenuItem onClick={() => { closeAccount(); navigate('/admin/perfil') }}><ListItemIcon><AccountCircleRounded fontSize="small" /></ListItemIcon>Mi perfil</MenuItem>
      {user?.platformRole === 'SUPER_ADMIN' && <MenuItem onClick={() => { closeAccount(); navigate('/platform-admin') }}><ListItemIcon><AdminPanelSettingsRounded fontSize="small" /></ListItemIcon>Administración de TecnoDesk</MenuItem>}
      <MenuItem onClick={() => { closeAccount(); logout() }}><ListItemIcon><LogoutRounded fontSize="small" /></ListItemIcon>Cerrar sesión</MenuItem>
    </Menu>
    <ProfileCompletionDialog /><TrialStartedDialog />
    <Box component="main" className={styles.content}><Box className={styles.inner}><SubscriptionBanner/><Outlet /></Box></Box>
    {mobile && canAccess(user, 'repairs.create') && <Fab color="primary" aria-label="Crear nueva reparación" className={styles.repairFab} onClick={() => go('/admin/reparaciones/nueva')}><BuildRounded /></Fab>}
  </Box>
}

export function AppShell(){return <SubscriptionProvider><AppShellContent/></SubscriptionProvider>}

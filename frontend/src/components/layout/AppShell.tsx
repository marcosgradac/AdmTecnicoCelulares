import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppBar, Avatar, Badge, Box, Divider, Drawer, IconButton, InputAdornment, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, TextField, Toolbar, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import { AccountCircleRounded, AddRounded, AssessmentRounded, BuildRounded, DashboardRounded, DevicesRounded, GroupsRounded, Inventory2Rounded, KeyboardDoubleArrowLeftRounded, KeyboardDoubleArrowRightRounded, LogoutRounded, MenuRounded, MoreHorizRounded, NotificationsNoneRounded, PeopleRounded, PointOfSaleRounded, SearchRounded, SettingsRounded, VerifiedRounded } from '@mui/icons-material'
import { useAuth } from '../../auth/AuthContext'
import { ProfileCompletionDialog } from '../auth/ProfileCompletionDialog'
import { canAccess, type Permission } from '../../auth/permissions'
import styles from './AppShell.module.scss'

const navItems: Array<{ label: string; path: string; icon: typeof DashboardRounded; permission?: Permission }> = [
  { label: 'Inicio', path: '/admin', icon: DashboardRounded },
  { label: 'Reparaciones', path: '/admin/reparaciones', icon: BuildRounded },
  { label: 'Clientes', path: '/admin/clientes', icon: PeopleRounded },
  { label: 'Equipos', path: '/admin/equipos', icon: DevicesRounded },
  { label: 'Stock', path: '/admin/stock', icon: Inventory2Rounded },
  { label: 'Caja', path: '/admin/caja', icon: PointOfSaleRounded, permission: 'cash:manage' },
  { label: 'Reportes', path: '/admin/reportes', icon: AssessmentRounded, permission: 'reports:view' },
  { label: 'Equipo', path: '/admin/equipo', icon: GroupsRounded, permission: 'team:manage' },
  { label: 'Estadísticas', path: '/admin/estadisticas', icon: AssessmentRounded },
  { label: 'Garantías', path: '/admin/garantias', icon: VerifiedRounded },
  { label: 'Configuración', path: '/admin/configuracion', icon: SettingsRounded },
]

export function AppShell() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
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
  const visibleNavItems = navItems.filter(item => !item.permission || canAccess(user, item.permission))

  const drawer = <Box className={`${styles.drawer} ${collapsed && !mobile ? styles.collapsed : ''}`}>
    <Box className={styles.brand}><Box className={styles.logo}><BuildRounded /></Box><Box><Typography fontWeight={800}>CelluFix</Typography><Typography variant="caption" color="text.secondary">Gestión técnica</Typography></Box></Box>
    <Typography className={styles.navLabel}>MENÚ PRINCIPAL</Typography>
    <List className={styles.nav}>{visibleNavItems.map(({ label, path, icon: Icon }) => <ListItemButton key={path} selected={selected(path)} onClick={() => go(path)}><ListItemIcon><Icon /></ListItemIcon><ListItemText primary={label} /></ListItemButton>)}</List>
    <Box className={styles.bottom}>
      {!mobile && <ListItemButton onClick={() => setCollapsed(value => !value)}><ListItemIcon>{collapsed ? <KeyboardDoubleArrowRightRounded /> : <KeyboardDoubleArrowLeftRounded />}</ListItemIcon><ListItemText primary="Contraer menú" /></ListItemButton>}
      <ListItemButton onClick={logout}><ListItemIcon><LogoutRounded /></ListItemIcon><ListItemText primary="Cerrar sesión" /></ListItemButton>
      <Box className={styles.account}><Avatar>{initials}</Avatar><Box><Typography fontSize={13} fontWeight={700}>{user?.fullName}</Typography><Typography variant="caption" color="text.secondary">{user?.business.name} · {roleLabel}</Typography></Box></Box>
    </Box>
  </Box>

  return <Box className={`${styles.shell} ${collapsed && !mobile ? styles.shellCollapsed : ''}`}>
    {!mobile && <Drawer variant="permanent" open>{drawer}</Drawer>}
    <Drawer open={mobile && open} onClose={() => setOpen(false)} PaperProps={{ sx: { width: 272 } }}>{drawer}</Drawer>
    <AppBar className={styles.header} position="fixed" color="inherit" elevation={0}><Toolbar>
      {mobile && <IconButton aria-label="Abrir menú" onClick={() => setOpen(true)}><MenuRounded /></IconButton>}
      {mobile ? <Typography fontWeight={800} ml={1}>CelluFix</Typography> : <TextField placeholder="Buscar reparación, cliente o equipo…" aria-label="Búsqueda global" className={styles.search} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> }} />}
      <Box flex={1} /><Tooltip title="Notificaciones"><IconButton aria-label="Notificaciones"><Badge variant="dot" color="error"><NotificationsNoneRounded /></Badge></IconButton></Tooltip>
      <Box className={styles.headerUser} role="button" tabIndex={0} aria-label="Abrir menú de cuenta" onClick={event => setAccountAnchor(event.currentTarget)} onKeyDown={event => { if (event.key === 'Enter') setAccountAnchor(event.currentTarget) }} sx={{ cursor: 'pointer' }}><Avatar>{initials}</Avatar><Box><Typography fontSize={13} fontWeight={700}>{user?.fullName}</Typography><Typography variant="caption" color="text.secondary">{user?.business.name}</Typography></Box></Box>
    </Toolbar></AppBar>
    <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={closeAccount} slotProps={{ paper: { sx: { minWidth: 230, mt: 1 } } }}>
      <Box px={2} py={1}><Typography fontWeight={800}>{user?.fullName}</Typography><Typography variant="caption" color="text.secondary">{roleLabel} · {user?.business.name}</Typography></Box>
      <Divider />
      <MenuItem onClick={() => { closeAccount(); navigate('/admin/perfil') }}><ListItemIcon><AccountCircleRounded fontSize="small" /></ListItemIcon>Mi perfil</MenuItem>
      <MenuItem onClick={() => { closeAccount(); logout() }}><ListItemIcon><LogoutRounded fontSize="small" /></ListItemIcon>Cerrar sesión</MenuItem>
    </Menu>
    <ProfileCompletionDialog />
    <Box component="main" className={styles.content}><Box className={styles.inner}><Outlet /></Box></Box>
    {mobile && <Box component="nav" aria-label="Navegación principal" className={styles.mobileNav}>
      <button onClick={() => go('/admin')} className={selected('/admin') ? styles.active : ''}><DashboardRounded /><span>Inicio</span></button>
      <button onClick={() => go('/admin/reparaciones')} className={selected('/admin/reparaciones') ? styles.active : ''}><BuildRounded /><span>Reparaciones</span></button>
      <button onClick={() => go('/admin/reparaciones/nueva')} className={styles.create}><AddRounded /><span>Nueva</span></button>
      <button onClick={() => go('/admin/clientes')} className={selected('/admin/clientes') ? styles.active : ''}><PeopleRounded /><span>Clientes</span></button>
      <button onClick={() => setOpen(true)}><MoreHorizRounded /><span>Más</span></button>
    </Box>}
  </Box>
}

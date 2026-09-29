import { Box, Stack, Typography } from '@mui/material'
import AccountBalanceWalletRounded from '@mui/icons-material/AccountBalanceWalletRounded'
import BuildRounded from '@mui/icons-material/BuildRounded'
import DevicesOtherRounded from '@mui/icons-material/DevicesOtherRounded'
import GroupsRounded from '@mui/icons-material/GroupsRounded'
import LinkRounded from '@mui/icons-material/LinkRounded'
import PointOfSaleRounded from '@mui/icons-material/PointOfSaleRounded'
import VerifiedUserRounded from '@mui/icons-material/VerifiedUserRounded'

/** Anclas a las secciones reales de la landing. */
const pills = [
  { label: 'Reparaciones', href: '#reparaciones', icon: <BuildRounded /> },
  { label: 'Seguimiento', href: '#seguimiento', icon: <LinkRounded /> },
  { label: 'Caja', href: '#caja', icon: <AccountBalanceWalletRounded /> },
  { label: 'Garantías', href: '#garantias', icon: <VerifiedUserRounded /> },
  { label: 'Punto de venta', href: '#punto-de-venta', icon: <PointOfSaleRounded /> },
  { label: 'Reventa', href: '#reventa', icon: <DevicesOtherRounded /> },
  { label: 'Equipo', href: '#clientes-equipo', icon: <GroupsRounded /> },
]

export function FeaturePills() {
  return <nav className="feature-pills" aria-label="Módulos de TecnoDesk">
    <Stack direction="row" gap={1} useFlexGap flexWrap="wrap" justifyContent="center">
      {pills.map(pill => <Box key={pill.href} component="a" href={pill.href} className="feature-pill">
        <span className="feature-pill__icon" aria-hidden="true">{pill.icon}</span>
        <Typography component="span" variant="body2" fontWeight={650}>{pill.label}</Typography>
      </Box>)}
    </Stack>
  </nav>
}

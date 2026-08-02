import { Avatar, Box, Typography } from '@mui/material'

export function DashboardHeader({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || 'U'
  return <Box className="dashboard-heading">
    <Box><Typography variant="h1">Buenas tardes, {name}</Typography><Typography color="text.secondary">Este es el estado de tu servicio técnico.</Typography></Box>
    <Avatar className="dashboard-heading__avatar">{initial}</Avatar>
  </Box>
}

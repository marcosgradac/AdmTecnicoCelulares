import type { ReactNode } from 'react'
import { Box, Paper, Stack, Typography } from '@mui/material'
import { BuildRounded, PhoneAndroidRounded } from '@mui/icons-material'

export function AuthLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <Box minHeight="100vh" display="grid" sx={{
    gridTemplateColumns: { xs: '1fr', md: 'minmax(360px, 0.9fr) minmax(520px, 1.1fr)' },
    bgcolor: '#f6f7fb',
  }}>
    <Box sx={{
      display: { xs: 'none', md: 'flex' }, position: 'relative', overflow: 'hidden', p: 7,
      color: '#fff', flexDirection: 'column', justifyContent: 'space-between',
      background: 'linear-gradient(145deg, #5536d9 0%, #7658e9 48%, #42b8ed 100%)',
      '&::before': { content: '""', position: 'absolute', width: 360, height: 360, borderRadius: '50%', bgcolor: 'rgba(255,255,255,.09)', top: -120, right: -100 },
      '&::after': { content: '""', position: 'absolute', width: 280, height: 280, borderRadius: '42%', border: '1px solid rgba(255,255,255,.16)', bottom: -90, left: -80, transform: 'rotate(28deg)' },
    }}>
      <Stack direction="row" spacing={1.5} alignItems="center" zIndex={1}>
        <Box width={48} height={48} display="grid" borderRadius={3} bgcolor="rgba(255,255,255,.18)" sx={{ placeItems: 'center', backdropFilter: 'blur(8px)' }}><BuildRounded /></Box>
        <Box><Typography fontSize={22} fontWeight={900}>CelluFix</Typography><Typography variant="body2" sx={{ opacity: .8 }}>Gestión técnica, simple y conectada</Typography></Box>
      </Stack>
      <Box zIndex={1}>
        <Box width={230} height={230} mx="auto" mb={5} display="grid" sx={{ placeItems: 'center', position: 'relative' }}>
          <Box position="absolute" borderRadius="50%" bgcolor="rgba(255,255,255,.1)" sx={{ inset: 0 }} />
          <Box width={118} height={174} border="5px solid rgba(255,255,255,.92)" borderRadius={5} display="grid" sx={{ placeItems: 'center', transform: 'rotate(-7deg)', boxShadow: '0 24px 60px rgba(22,12,70,.25)' }}>
            <PhoneAndroidRounded sx={{ fontSize: 56 }} />
          </Box>
          <Box position="absolute" right={18} bottom={24} width={68} height={68} borderRadius="50%" bgcolor="#fff" color="primary.main" display="grid" sx={{ placeItems: 'center' }}><BuildRounded fontSize="large" /></Box>
        </Box>
        <Typography variant="h3" fontWeight={850} maxWidth={480}>Todo tu servicio técnico en un solo lugar.</Typography>
        <Typography mt={2} sx={{ opacity: .82, maxWidth: 460 }}>Reparaciones, clientes, stock y caja protegidos para cada negocio.</Typography>
      </Box>
      <Typography variant="caption" sx={{ opacity: .65 }} zIndex={1}>© 2026 CelluFix</Typography>
    </Box>
    <Box display="grid" px={{ xs: 2, sm: 4, md: 7 }} py={{ xs: 3, md: 5 }} sx={{ placeItems: 'center' }}>
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 560, borderRadius: 5, p: { xs: 3, sm: 4.5 }, border: '1px solid', borderColor: 'divider', boxShadow: '0 24px 70px rgba(35,27,78,.10)' }}>
        <Stack direction="row" spacing={1.25} alignItems="center" mb={3} sx={{ display: { md: 'none' } }}>
          <Box width={42} height={42} display="grid" borderRadius={2.5} bgcolor="primary.main" color="#fff" sx={{ placeItems: 'center' }}><BuildRounded /></Box>
          <Typography fontSize={20} fontWeight={900}>CelluFix</Typography>
        </Stack>
        <Typography variant="h1" fontSize={{ xs: 28, sm: 34 }}>{title}</Typography>
        <Typography color="text.secondary" mt={1} mb={3}>{description}</Typography>
        <Stack spacing={2}>{children}</Stack>
      </Paper>
    </Box>
  </Box>
}

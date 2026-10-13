import { Box, Card, CardContent, Stack, Switch, Typography } from '@mui/material'
import { DarkModeRounded, LightModeRounded } from '@mui/icons-material'
import { useAppTheme } from '../../theme/AppThemeProvider'
export function AppearanceCard() {
  const { mode, saving, setPreference } = useAppTheme()
  const dark = mode === 'dark'
  return <Card variant="outlined" aria-labelledby="appearance-title" sx={{ boxShadow: 'none' }}><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={2}>
    <Box sx={{ display: 'grid', placeItems: 'center', width: 48, height: 48, borderRadius: 3, bgcolor: 'var(--td-primary-soft, #EEE9FF)', color: 'primary.main', flexShrink: 0 }}>{dark ? <DarkModeRounded /> : <LightModeRounded />}</Box>
    <Box sx={{ flex: 1 }}><Typography id="appearance-title" variant="h3">Apariencia</Typography><Typography variant="body2" color="text.secondary" mt={.5}>Personalizá cómo se ve TecnoDesk en tu cuenta</Typography><Typography variant="body2" fontWeight={700} mt={1} aria-live="polite">{dark ? 'Modo oscuro activado' : 'Modo claro activado'}</Typography></Box>
    <Switch checked={dark} disabled={saving} onChange={(_, checked) => void setPreference(checked ? 'DARK' : 'LIGHT')} slotProps={{ input: { 'aria-label': 'Activar modo oscuro', 'aria-describedby': 'appearance-title' } }} sx={{ '& .MuiSwitch-thumb': { transition: 'transform 160ms ease' }, '@media (prefers-reduced-motion: reduce)': { '& *': { transition: 'none' } } }} />
  </Stack></CardContent></Card>
}

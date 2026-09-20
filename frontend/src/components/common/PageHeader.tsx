import type { ReactNode } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { useAdminVisual } from '../admin/AdminVisualScope'

export function PageHeader({ title, description, eyebrow, context, action }: { title: string; description: string; eyebrow?: string; context?: string; action?: ReactNode }) {
  const modern = useAdminVisual()
  if (modern) return <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ lg: 'center' }} gap={2.5} mb={3.5}>
    <Box minWidth={0} flex={1}>{(context || eyebrow) && <Typography variant="overline" color="primary.main" fontSize={10} fontWeight={800} letterSpacing=".12em">{context || eyebrow}</Typography>}<Typography variant="h1" color="text.primary" sx={{ letterSpacing: '-.035em', overflowWrap: 'anywhere' }}>{title}</Typography><Typography variant="body2" color="text.secondary" mt={.8} maxWidth={640}>{description}</Typography></Box>
    {action && <Box sx={{ flexShrink: 0, maxWidth: { lg: '52%' }, '& > .MuiStack-root': { justifyContent: { xs: 'flex-start', lg: 'flex-end' } }, '& .MuiButton-root': { flexGrow: { xs: 1, sm: 0 } } }}>{action}</Box>}
  </Stack>
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={2.5} mb={3}>
      <Box>
        {context && <Typography variant="overline" color="primary.main">{context}</Typography>}
        <Typography variant="h1" color="primary.main">{title}</Typography>
        <Typography color="text.secondary" mt={0.5}>{description}</Typography>
      </Box>
      {action}
    </Stack>
  )
}

import type { ReactNode } from 'react'
import { Box, Stack, Typography } from '@mui/material'

export function PageHeader({ title, description, eyebrow, action }: { title: string; description: string; eyebrow?: string; action?: ReactNode }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={2.5} mb={3}>
      <Box>
        {eyebrow && <Typography variant="overline" color="primary.main">{eyebrow}</Typography>}
        <Typography variant="h1">{title}</Typography>
        <Typography color="text.secondary" mt={0.5}>{description}</Typography>
      </Box>
      {action}
    </Stack>
  )
}


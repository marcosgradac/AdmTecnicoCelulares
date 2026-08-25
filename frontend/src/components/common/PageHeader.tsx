import type { ReactNode } from 'react'
import { Box, Stack, Typography } from '@mui/material'

export function PageHeader({ title, description, context, action }: { title: string; description: string; eyebrow?: string; context?: string; action?: ReactNode }) {
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

import type { ReactNode } from 'react'
import { Box, Button, Divider, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { ChevronLeftRounded, ChevronRightRounded, CloseRounded } from '@mui/icons-material'
import { useAdminVisual } from './AdminVisualScope'

export function ListPagination({ page, count, rowsPerPage, onPageChange, disabled }: { page: number; count: number; rowsPerPage: number; onPageChange: (page: number) => void; disabled?: boolean }) {
  const pages = Math.max(1, Math.ceil(count / rowsPerPage))
  if (count <= 0 || pages <= 1) return null
  const current = Math.min(Math.max(page, 0), pages - 1)
  return <Stack component="nav" aria-label="Paginación del listado" direction="row" alignItems="center" justifyContent="center" spacing={{ xs: 0.75, sm: 1 }} sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider', flexWrap: 'wrap', rowGap: 1 }}>
    <Button size="small" variant="outlined" startIcon={<ChevronLeftRounded />} disabled={disabled || current === 0} onClick={() => onPageChange(current - 1)} aria-label="Página anterior" sx={{ '& .MuiButton-startIcon': { display: { xs: 'none', sm: 'inherit' } } }}>Anterior</Button>
    <Typography component="span" variant="body2" fontWeight={700} color="primary.main" sx={{ px: { xs: 1.25, sm: 1.75 }, py: 0.6, borderRadius: 2.5, bgcolor: theme => alpha(theme.palette.primary.main, 0.09), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>Página {current + 1} de {pages}</Typography>
    <Button size="small" variant="outlined" endIcon={<ChevronRightRounded />} disabled={disabled || current >= pages - 1} onClick={() => onPageChange(current + 1)} aria-label="Página siguiente" sx={{ '& .MuiButton-endIcon': { display: { xs: 'none', sm: 'inherit' } } }}>Siguiente</Button>
  </Stack>
}

export function FilterBar({ children, onClear }: { children: ReactNode; onClear?: () => void }) {
  return <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} alignItems={{ md: 'center' }} sx={{ mb: 2.5, p: 1.5, bgcolor: '#F7F8FC', borderRadius: 3, '& > *': { minWidth: 0 }, '& .MuiTextField-root': { flex: 1 } }}>
    {children}{onClear && <Button startIcon={<CloseRounded />} onClick={onClear} sx={{ flexShrink: 0 }}>Limpiar filtros</Button>}
  </Stack>
}

export function RecordCard({ title, subtitle, status, actions, children, onOpen }: { title: ReactNode; subtitle?: ReactNode; status?: ReactNode; actions?: ReactNode; children?: ReactNode; onOpen?: () => void }) {
  return <Box component="article" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper', p: 2, minWidth: 0 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
      <Box minWidth={0} flex={1}>{status && <Box mb={1.5}>{status}</Box>}{onOpen ? <Button onClick={onOpen} sx={{ p: 0, justifyContent: 'flex-start', textAlign: 'left', color: 'text.primary', fontSize: '1rem', fontWeight: 750, overflowWrap: 'anywhere' }}>{title}</Button> : <Typography fontWeight={750} sx={{ overflowWrap: 'anywhere' }}>{title}</Typography>}{subtitle && <Typography component="div" variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{subtitle}</Typography>}</Box>
      {actions && <Box flexShrink={0}>{actions}</Box>}
    </Stack>
    {children && <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5, pt: 2, mt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>{children}</Box>}
  </Box>
}

export function RecordField({ label, children, color }: { label: string; children: ReactNode; color?: string }) {
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={650} color={color} sx={{ overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{children}</Typography></Box>
}

export function FormSection({ title, description, children, legacyHeading, legacyDivider }: { title: string; description?: string; children: ReactNode; legacyHeading?: boolean; legacyDivider?: boolean }) {
  const modern = useAdminVisual()
  if (!modern) return <>{legacyDivider && <Divider />}{legacyHeading && <Typography variant="h2">{title}</Typography>}{children}</>
  return <Stack component="section" spacing={2} sx={{ p: { xs: 2, sm: 2.5 }, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
    <Box><Typography variant="subtitle2" fontWeight={750}>{title}</Typography>{description && <Typography variant="body2" color="text.secondary" mt={.5}>{description}</Typography>}</Box>{children}
  </Stack>
}

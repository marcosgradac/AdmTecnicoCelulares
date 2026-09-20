import { ArrowDownwardRounded, ArrowUpwardRounded } from '@mui/icons-material'
import { Box, Chip, Stack, Typography } from '@mui/material'
import type { CashMovement } from '../../services/operations'
import { formatMoney } from '../../utils/format'

const origins = { GENERAL: 'General', REPAIR: 'Reparaciones', EQUIPMENT: 'Venta de equipos', COMMERCE: 'Comercio' }
const methods = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', OTHER: 'Otro' }

export function CashMovementList({ movements }: { movements: CashMovement[] }) {
  return <Stack spacing={{ xs: 1.5, md: 0 }}>{movements.map(item => {
    const income = item.type === 'INCOME'
    return <Box key={item.id} component="article" sx={{ display: 'grid', gridTemplateColumns: { xs: '36px minmax(0, 1fr)', md: '40px minmax(0, 1fr) auto' }, gap: 1.5, alignItems: 'start', py: 2, px: { xs: 1.5, md: 0 }, border: { xs: '1px solid', md: 0 }, borderBottom: '1px solid', borderColor: 'divider', borderRadius: { xs: 3, md: 0 }, '&:last-child': { borderBottomWidth: { md: 0 } } }}>
      <Box sx={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 2.5, bgcolor: income ? '#E9F8F0' : '#FFF0F0', color: income ? 'success.main' : 'error.main' }}>{income ? <ArrowUpwardRounded fontSize="small" /> : <ArrowDownwardRounded fontSize="small" />}</Box>
      <Box minWidth={0}><Typography fontWeight={700} variant="body2" sx={{ overflowWrap: 'anywhere' }}>{item.description}</Typography><Stack direction="row" gap={.75} flexWrap="wrap" my={1}><Chip size="small" variant="outlined" label={origins[item.origin]} /><Chip size="small" label={item.method ? methods[item.method] : 'Sin medio informado'} /></Stack><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{item.resaleDeviceId ? 'Equipo #' + item.resaleDeviceId.slice(-6) : item.clientName || 'Movimiento de caja'} · {new Date(item.createdAt).toLocaleString('es-AR')}</Typography></Box>
      <Box sx={{ gridColumn: { xs: 2, md: 3 }, textAlign: { md: 'right' }, minWidth: 0 }}><Typography fontWeight={800} color={income ? 'success.main' : 'error.main'} sx={{ fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{income ? '+' : '−'}{formatMoney(item.amount)}</Typography><Typography variant="caption" color="text.secondary">{income ? 'Ingreso' : 'Egreso'}</Typography></Box>
    </Box>
  })}</Stack>
}

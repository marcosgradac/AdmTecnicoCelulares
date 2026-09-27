import { ArrowDownwardRounded, ArrowUpwardRounded, CreditCardRounded, HelpOutlineRounded, PaidRounded, PaymentsRounded, SwapHorizRounded } from '@mui/icons-material'
import { Box, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery, useTheme } from '@mui/material'
import { RecordCard, RecordField } from './AdminPatterns'
import type { CashMovement } from '../../services/operations'
import { TABLE_BORDER } from '../../theme/tokens'
import { formatMoney, formatShortDate, formatShortTime } from '../../utils/format'

const origins = { GENERAL: 'General', REPAIR: 'Reparaciones', EQUIPMENT: 'Reventa de equipos', COMMERCE: 'Comercio' }
const methods = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', OTHER: 'Otro' }
const methodIcons = { CASH: PaymentsRounded, TRANSFER: SwapHorizRounded, CARD: CreditCardRounded, OTHER: PaidRounded }

const paymentMethod = (method: CashMovement['method']) => {
  const Icon = method ? methodIcons[method] ?? PaidRounded : HelpOutlineRounded
  return <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: .75, minWidth: 0, color: method ? 'text.secondary' : 'text.disabled' }}>
    <Icon sx={{ fontSize: 18, flexShrink: 0 }} />
    <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{method ? methods[method] ?? 'Otro' : 'Sin medio informado'}</Box>
  </Box>
}

/** Subtítulo del movimiento: aclara de qué trata cuando la descripción es genérica. */
const movementSubject = (item: CashMovement) =>
  item.resaleDeviceId ? `Equipo #${item.resaleDeviceId.slice(-6).toUpperCase()}` : item.clientName || null

export function CashMovementList({ movements, showOrigin = true }: { movements: CashMovement[]; showOrigin?: boolean }) {
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'))
  const amount = (item: CashMovement) => {
    const income = item.type === 'INCOME'
    return <Typography variant="body2" fontWeight={800} color={income ? 'success.dark' : 'error.dark'} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{income ? '+' : '−'}{formatMoney(item.amount)}</Typography>
  }
  const type = (item: CashMovement) => {
    const income = item.type === 'INCOME'
    return <Chip size="small" variant="outlined" label={income ? 'Ingreso' : 'Egreso'} sx={{ bgcolor: 'transparent', borderColor: 'currentColor', color: income ? 'success.dark' : 'error.dark', fontWeight: 700 }} />
  }
  if (mobile) return <Stack spacing={1.5}>{movements.map(item => <RecordCard key={item.id}
    leading={<Box sx={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 2.5, bgcolor: item.type === 'INCOME' ? '#E9F8F0' : '#FFF0F0', color: item.type === 'INCOME' ? 'success.main' : 'error.main' }}>{item.type === 'INCOME' ? <ArrowUpwardRounded fontSize="small" /> : <ArrowDownwardRounded fontSize="small" />}</Box>}
    title={item.description}
    status={<Stack direction="row" gap={.75} flexWrap="wrap">{type(item)}{showOrigin && <Chip size="small" variant="outlined" label={origins[item.origin]} />}</Stack>}
    subtitle={movementSubject(item)}>
    <RecordField label="Importe" color={item.type === 'INCOME' ? 'success.dark' : 'error.dark'}>{`${item.type === 'INCOME' ? '+' : '−'}${formatMoney(item.amount)}`}</RecordField>
    <RecordField label="Medio de pago">{paymentMethod(item.method)}</RecordField>
    <RecordField label="Fecha">{formatShortDate(item.createdAt)}</RecordField>
    <RecordField label="Hora">{formatShortTime(item.createdAt)}</RecordField>
  </RecordCard>)}</Stack>
  return <TableContainer>
    <Table aria-label="Movimientos de caja" sx={{ minWidth: showOrigin ? 860 : 690, '& .MuiTableCell-root': { borderBottom: `1px solid ${TABLE_BORDER}` }, '& .MuiTableCell-head': { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'text.secondary', lineHeight: 1.4, py: 1, background: 'transparent' } }}>
      <TableHead><TableRow>
        <TableCell>Movimiento</TableCell>
        {showOrigin && <TableCell sx={{ width: 170 }}>Origen</TableCell>}
        <TableCell sx={{ width: 165 }}>Medio de pago</TableCell>
        <TableCell sx={{ width: 120 }}>Fecha</TableCell>
        <TableCell sx={{ width: 78 }}>Hora</TableCell>
        <TableCell sx={{ width: 120 }}>Tipo</TableCell>
        <TableCell align="right" sx={{ width: 150 }}>Importe</TableCell>
      </TableRow></TableHead>
      <TableBody>{movements.map(item => {
        const subject = movementSubject(item)
        return <TableRow key={item.id} hover sx={{ '&:last-of-type td': { borderBottom: 0 } }}>
          <TableCell sx={{ maxWidth: 320 }}>
            <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{item.description}</Typography>
            {subject && <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{subject}</Typography>}
          </TableCell>
          {showOrigin && <TableCell><Chip size="small" variant="outlined" label={origins[item.origin]} sx={{ bgcolor: 'transparent', borderColor: 'divider' }} /></TableCell>}
          <TableCell><Typography variant="body2">{paymentMethod(item.method)}</Typography></TableCell>
          <TableCell><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatShortDate(item.createdAt)}</Typography></TableCell>
          <TableCell><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatShortTime(item.createdAt)}</Typography></TableCell>
          <TableCell>{type(item)}</TableCell>
          <TableCell align="right">{amount(item)}</TableCell>
        </TableRow>
      })}</TableBody>
    </Table>
  </TableContainer>
}

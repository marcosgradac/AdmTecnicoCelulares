import { RecordCard, RecordField } from './AdminPatterns'
import { Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery, useTheme } from '@mui/material'
import type { CommercePaymentMethod, CommerceSale } from '../../services/commerce'
import { formatDate, formatMoney, formatTime } from '../../utils/format'

const paymentLabels: Record<CommercePaymentMethod, string> = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', OTHER: 'Otro' }

const saleSummary = (sale: CommerceSale) => {
  const lines = sale.lines ?? []
  return {
    items: lines.reduce((sum, line) => sum + line.quantity, 0),
    names: lines.map(line => line.productName).join(', '),
  }
}

const profitColor = (profit: number) => profit < 0 ? 'error.main' : 'success.main'

export function CommerceSalesList({ sales }: { sales: CommerceSale[] }) {
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'))

  if (mobile) return <Stack spacing={1.5}>{sales.map(sale => {
    const { items, names } = saleSummary(sale)
    return <RecordCard key={sale.id} title={formatMoney(sale.total)} status={<Chip size="small" variant="outlined" label={paymentLabels[sale.paymentMethod]} />} subtitle={<>{formatDate(sale.createdAt)} · {formatTime(sale.createdAt)}{names ? ` · ${names}` : ''}</>}>
      <RecordField label="Ganancia" color={profitColor(sale.profit)}>{formatMoney(sale.profit)}</RecordField>
      <RecordField label="Ítems">{items} {items === 1 ? 'ítem' : 'ítems'}</RecordField>
    </RecordCard>
  })}</Stack>

  return <TableContainer><Table size="small">
    <TableHead><TableRow>
      <TableCell>Fecha</TableCell>
      <TableCell>Detalle</TableCell>
      <TableCell>Medio de pago</TableCell>
      <TableCell align="right">Total</TableCell>
      <TableCell align="right">Ganancia</TableCell>
    </TableRow></TableHead>
    <TableBody>{sales.map(sale => {
      const { items, names } = saleSummary(sale)
      return <TableRow key={sale.id} hover>
        <TableCell sx={{ whiteSpace: 'nowrap' }}><Typography variant="body2" fontWeight={650}>{formatDate(sale.createdAt)}</Typography><Typography variant="caption" color="text.secondary">{formatTime(sale.createdAt)}</Typography></TableCell>
        <TableCell sx={{ minWidth: 220 }}><Typography variant="body2" fontWeight={650}>{items} {items === 1 ? 'ítem' : 'ítems'}</Typography>{names && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{names}</Typography>}</TableCell>
        <TableCell><Chip size="small" variant="outlined" label={paymentLabels[sale.paymentMethod]} /></TableCell>
        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}><Typography variant="body2" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(sale.total)}</Typography></TableCell>
        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}><Typography variant="body2" fontWeight={700} color={profitColor(sale.profit)} sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(sale.profit)}</Typography></TableCell>
      </TableRow>
    })}</TableBody>
  </Table></TableContainer>
}

import { CreditCardRounded, HelpOutlineRounded, PaidRounded, PaymentsRounded, SwapHorizRounded } from '@mui/icons-material'
import { Box, Chip, Stack, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import type { GroupedCashMovement, LooseRepairMovements } from '../../services/operations'
import { formatMoney, formatShortDate, formatShortTime } from '../../utils/format'
import { CASH_ORIGIN_LABELS, CASH_LOOSE_EMPTY_HINT, CASH_LOOSE_EMPTY_TITLE, CashEmptyRow, CashTableFrame, CashTablePanel, LOOSE_COLUMN_COUNT, MOVEMENT_COLUMN_WIDTHS, useCashMobile } from './cashTableTokens'

const methods = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', OTHER: 'Otro' }
const methodIcons = { CASH: PaymentsRounded, TRANSFER: SwapHorizRounded, CARD: CreditCardRounded, OTHER: PaidRounded }

const paymentMethod = (method: GroupedCashMovement['method']) => {
  const Icon = method ? methodIcons[method] ?? PaidRounded : HelpOutlineRounded
  return <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: .75, minWidth: 0, color: method ? 'text.secondary' : 'text.disabled' }}>
    <Icon sx={{ fontSize: 18, flexShrink: 0 }} />
    <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{method ? methods[method] ?? 'Otro' : 'Sin medio informado'}</Box>
  </Box>
}

const movementAmount = (movement: GroupedCashMovement) => {
  const income = movement.type === 'INCOME'
  return <Typography variant="body2" fontWeight={800} color={income ? 'success.dark' : 'error.dark'} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{income ? '+' : '−'}{formatMoney(movement.amount)}</Typography>
}

const movementType = (movement: GroupedCashMovement) => {
  const income = movement.type === 'INCOME'
  return <Chip size="small" variant="outlined" label={income ? 'Ingreso' : 'Egreso'} sx={{ bgcolor: 'transparent', borderColor: 'currentColor', color: income ? 'success.dark' : 'error.dark', fontWeight: 700 }} />
}

/**
 * Tabla secundaria de una caja: los movimientos que se cargaron a mano y no están vinculados
 * a una reparación, un equipo ni una venta.
 *
 * Es un panel independiente —propio borde, radio, título y encabezado— y comparte tokens con la
 * tabla principal, así que en las cuatro cajas se leen como dos tablas hermanas. En desktop es
 * tabla y en mobile se convierte en tarjetas, sin barra horizontal. NUNCA desaparece: si no hay
 * movimientos manuales, conserva encabezado y muestra el estado vacío dentro del cuerpo, con el
 * `colSpan` de todas sus columnas.
 */
export function LooseMovementsTable({ loose, showOrigin = false, description }: { loose?: LooseRepairMovements | null; showOrigin?: boolean; description?: string }) {
  const mobile = useCashMobile()
  const rows = loose?.movements ?? []
  const widths = MOVEMENT_COLUMN_WIDTHS
  const columnCount = showOrigin ? LOOSE_COLUMN_COUNT + 1 : LOOSE_COLUMN_COUNT

  return <CashTablePanel title="Otros movimientos" description={description}>
    {mobile
      ? rows.length ? <LooseCards rows={rows} showOrigin={showOrigin} /> : <Box sx={{ py: 4, px: 2, textAlign: 'center' }}>
        <Typography variant="subtitle2" fontWeight={750}>{CASH_LOOSE_EMPTY_TITLE}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{CASH_LOOSE_EMPTY_HINT}</Typography>
      </Box>
      : <CashTableFrame label="Otros movimientos de caja" minWidth={showOrigin ? 860 : 690}>
        <TableHead><TableRow>
          <TableCell>Movimiento</TableCell>
          {showOrigin && <TableCell sx={{ width: widths.origin }}>Origen</TableCell>}
          <TableCell sx={{ width: widths.method }}>Medio de pago</TableCell>
          <TableCell sx={{ width: widths.date }}>Fecha</TableCell>
          <TableCell sx={{ width: widths.time }}>Hora</TableCell>
          <TableCell sx={{ width: widths.kind }}>Tipo</TableCell>
          <TableCell align="right" sx={{ width: widths.amount }}>Importe</TableCell>
        </TableRow></TableHead>
        <TableBody>{rows.length
          ? rows.map(movement => <TableRow key={movement.id} hover>
            <TableCell sx={{ maxWidth: 320 }}><Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{movement.description}</Typography></TableCell>
            {showOrigin && <TableCell><Chip size="small" variant="outlined" label={CASH_ORIGIN_LABELS[movement.origin] ?? movement.origin} sx={{ borderColor: 'divider' }} /></TableCell>}
            <TableCell><Typography variant="body2">{paymentMethod(movement.method)}</Typography></TableCell>
            <TableCell><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatShortDate(movement.createdAt)}</Typography></TableCell>
            <TableCell><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatShortTime(movement.createdAt)}</Typography></TableCell>
            <TableCell>{movementType(movement)}</TableCell>
            <TableCell align="right">{movementAmount(movement)}</TableCell>
          </TableRow>)
          : <CashEmptyRow colSpan={columnCount} title={CASH_LOOSE_EMPTY_TITLE} description={CASH_LOOSE_EMPTY_HINT} />}</TableBody>
      </CashTableFrame>}
  </CashTablePanel>
}

const LooseCards = ({ rows, showOrigin }: { rows: GroupedCashMovement[]; showOrigin: boolean }) => <Stack spacing={1.25}>{rows.map(movement => <Box key={movement.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2, minWidth: 0 }}>
  <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{movement.description}</Typography>
  <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center" sx={{ mt: .5 }}>
    {paymentMethod(movement.method)}
    <Typography variant="caption" color="text.secondary">{formatShortDate(movement.createdAt)} {formatShortTime(movement.createdAt)}</Typography>
  </Stack>
  <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mt: 1 }}>
    <Stack direction="row" gap={.75} flexWrap="wrap">{movementType(movement)}{showOrigin && <Chip size="small" variant="outlined" label={CASH_ORIGIN_LABELS[movement.origin] ?? movement.origin} />}</Stack>
    {movementAmount(movement)}
  </Stack>
</Box>)}</Stack>


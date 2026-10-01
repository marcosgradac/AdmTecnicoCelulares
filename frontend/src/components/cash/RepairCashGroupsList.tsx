import { Fragment, useState } from 'react'
import { CreditCardRounded, ExpandLessRounded, ExpandMoreRounded, HelpOutlineRounded, PaidRounded, PaymentsRounded, SwapHorizRounded } from '@mui/icons-material'
import { Box, Chip, Collapse, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { TABLE_BORDER } from '../../theme/tokens'
import type { GroupedCashMovement, RepairCashGroup } from '../../services/operations'
import { formatMoney, formatShortDate, formatShortTime } from '../../utils/format'
import { CashEmptyRow, CashTableFrame, useCashMobile } from './cashTableTokens'

const methods = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', OTHER: 'Otro' }
const methodIcons = { CASH: PaymentsRounded, TRANSFER: SwapHorizRounded, CARD: CreditCardRounded, OTHER: PaidRounded }

/** Importes con signo: verde para ingresos, rojo para egresos. */
export const signedMoney = (amount: number, kind: 'income' | 'expense' | 'net') => {
  const sign = kind === 'expense' ? '−' : kind === 'income' ? '+' : amount > 0 ? '+' : amount < 0 ? '−' : ''
  const color = kind === 'expense' ? 'error.dark' : kind === 'income' ? 'success.dark' : amount > 0 ? 'success.dark' : amount < 0 ? 'error.dark' : 'text.primary'
  return { text: `${sign}${formatMoney(Math.abs(amount))}`, color }
}

const paymentMethod = (method: GroupedCashMovement['method']) => {
  const Icon = method ? methodIcons[method] ?? PaidRounded : HelpOutlineRounded
  return <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: .75, minWidth: 0, color: method ? 'text.secondary' : 'text.disabled' }}>
    <Icon sx={{ fontSize: 18, flexShrink: 0 }} />
    <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{method ? methods[method] ?? 'Otro' : 'Sin medio informado'}</Box>
  </Box>
}

const movementType = (movement: GroupedCashMovement) => {
  const income = movement.type === 'INCOME'
  return <Chip size="small" variant="outlined" label={income ? 'Ingreso' : 'Egreso'} sx={{ bgcolor: 'transparent', borderColor: 'currentColor', color: income ? 'success.dark' : 'error.dark', fontWeight: 700 }} />
}

const movementAmount = (movement: GroupedCashMovement) => {
  const income = movement.type === 'INCOME'
  return <Typography variant="body2" fontWeight={800} color={income ? 'success.dark' : 'error.dark'} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{income ? '+' : '−'}{formatMoney(movement.amount)}</Typography>
}

/** Datos comunes de un grupo, sea una reparación o el bloque de movimientos sueltos. */
export interface CashGroupSummary {
  key: string
  title: string
  /** Cliente y equipo por separado: la tabla los muestra en celdas distintas. */
  clientName: string
  deviceLabel?: string
  subtitle?: string
  income: number
  expense: number
  net: number
  movementCount: number
  lastMovementAt: string
  movements: GroupedCashMovement[]
}

/** Importe de una columna numérica, alineado a la derecha y con dígitos de ancho fijo. */
const AmountCell = ({ amount, kind }: { amount: number; kind: 'income' | 'expense' | 'net' }) => {
  const { text, color } = signedMoney(amount, kind)
  return <Typography variant="body2" fontWeight={kind === 'net' ? 800 : 750} color={color} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{text}</Typography>
}

const movementBadge = (count: number) =>
  <Chip size="small" variant="outlined" label={`${count} ${count === 1 ? 'movimiento' : 'movimientos'}`} sx={{ borderColor: 'divider', bgcolor: 'transparent' }} />

/** Estilo compartido por los encabezados de las dos tablas. */
const headCellSx = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase' as const, color: 'text.secondary', lineHeight: 1.4, py: 1, background: 'transparent', whiteSpace: 'nowrap' as const }

const totalsRow = (group: CashGroupSummary) => {
  const income = signedMoney(group.income, 'income')
  const expense = signedMoney(group.expense, 'expense')
  const net = signedMoney(group.net, 'net')
  return <Stack direction="row" flexWrap="wrap" gap={{ xs: 1.5, sm: 3 }}>
    <Box><Typography variant="caption" color="text.secondary">Ingresos</Typography><Typography variant="body2" fontWeight={750} color={income.color} sx={{ fontVariantNumeric: 'tabular-nums' }}>{income.text}</Typography></Box>
    <Box><Typography variant="caption" color="text.secondary">Egresos</Typography><Typography variant="body2" fontWeight={750} color={expense.color} sx={{ fontVariantNumeric: 'tabular-nums' }}>{expense.text}</Typography></Box>
    <Box><Typography variant="caption" color="text.secondary">Neto</Typography><Typography variant="body2" fontWeight={800} color={net.color} sx={{ fontVariantNumeric: 'tabular-nums' }}>{net.text}</Typography></Box>
  </Stack>
}

const device = (group: RepairCashGroup) =>
  [group.deviceBrand, group.deviceModel].filter(Boolean).join(' ')

/** Movimientos de un grupo desplegado. En escritorio usan tabla; en móvil, tarjetas apiladas. */
const MovementDetails = ({ movements, mobile }: { movements: GroupedCashMovement[]; mobile: boolean }) => {
  if (mobile) return <Stack spacing={1.25} sx={{ pt: 1.5 }}>{movements.map(movement => <Box key={movement.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 1.5, bgcolor: 'background.default', minWidth: 0 }}>
    <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{movement.description}</Typography>
    <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center" sx={{ mt: .5 }}>
      {paymentMethod(movement.method)}
      <Typography variant="caption" color="text.secondary">{formatShortDate(movement.createdAt)} {formatShortTime(movement.createdAt)}</Typography>
    </Stack>
    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mt: 1 }}>
      {movementType(movement)}
      {movementAmount(movement)}
    </Stack>
  </Box>)}</Stack>
  return <Box sx={{ bgcolor: 'background.default', px: 1, py: 1 }}>
    <Table aria-label="Movimientos de la reparación" sx={{ '& .MuiTableCell-root': { borderBottom: `1px solid ${TABLE_BORDER}`, py: .9 }, '& .MuiTableCell-head': headCellSx }}>
      <TableHead><TableRow>
        <TableCell>Movimiento</TableCell><TableCell sx={{ width: 165 }}>Medio de pago</TableCell>
        <TableCell sx={{ width: 120 }}>Fecha</TableCell><TableCell sx={{ width: 78 }}>Hora</TableCell>
        <TableCell sx={{ width: 120 }}>Tipo</TableCell><TableCell align="right" sx={{ width: 150 }}>Importe</TableCell>
      </TableRow></TableHead>
      <TableBody>{movements.map(movement => <TableRow key={movement.id}>
        <TableCell sx={{ maxWidth: 320 }}><Typography variant="body2" fontWeight={650} sx={{ overflowWrap: 'anywhere' }}>{movement.description}</Typography></TableCell>
        <TableCell><Typography variant="body2">{paymentMethod(movement.method)}</Typography></TableCell>
        <TableCell><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatShortDate(movement.createdAt)}</Typography></TableCell>
        <TableCell><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatShortTime(movement.createdAt)}</Typography></TableCell>
        <TableCell>{movementType(movement)}</TableCell>
        <TableCell align="right">{movementAmount(movement)}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </Box>
}

/**
 * Encabezado de un grupo. Toda la fila es activable: es un botón nativo, por lo que llega
 * con foco y activación por teclado, y `aria-expanded` comunica el estado a lectores de pantalla.
 */
const GroupHeader = ({ group, expanded, onToggle }: { group: CashGroupSummary; expanded: boolean; onToggle: () => void }) => {
  const Chevron = expanded ? ExpandLessRounded : ExpandMoreRounded
  return <Box
    component="button"
    type="button"
    onClick={onToggle}
    aria-expanded={expanded}
    sx={{
      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', bgcolor: 'transparent',
      border: 0, p: 0, color: 'inherit', font: 'inherit', '&:hover': { bgcolor: 'action.hover' },
      '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: -2, borderRadius: 1 },
    }}
  >
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} gap={1.5} justifyContent="space-between">
      <Box minWidth={0} flex={1}>
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
          <Typography component="span" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{group.title}</Typography>
          <Chip size="small" variant="outlined" label={`${group.movementCount} ${group.movementCount === 1 ? 'movimiento' : 'movimientos'}`} sx={{ borderColor: 'divider' }} />
        </Stack>
        {group.subtitle && <Typography component="span" variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{group.subtitle}</Typography>}
        <Box sx={{ mt: .75 }}>{totalsRow(group)}</Box>
      </Box>
      <Stack direction="row" alignItems="center" gap={.75} sx={{ flexShrink: 0, color: 'text.secondary', justifyContent: { xs: 'flex-end', sm: 'initial' } }}>
        <Typography component="span" variant="caption" sx={{ whiteSpace: 'nowrap' }}>{formatShortDate(group.lastMovementAt)}</Typography>
        <Chevron fontSize="small" />
      </Stack>
    </Stack>
  </Box>
}

const toSummary = (group: RepairCashGroup): CashGroupSummary => {
  const model = device(group)
  return {
    key: group.repairId,
    title: group.repairNumber ? `Reparación #${group.repairNumber}` : 'Reparación eliminada',
    clientName: group.clientName,
    deviceLabel: model || undefined,
    subtitle: [group.clientName, model].filter(Boolean).join(' · '),
    income: group.income,
    expense: group.expense,
    net: group.net,
    movementCount: group.movementCount,
    lastMovementAt: group.lastMovementAt,
    movements: group.movements,
  }
}

/**
 * Tabla de reparaciones: el nivel principal es una tabla real, con una fila por reparación y
 * columnas fijas, así todos los ingresos, egresos, netos, fechas y chevrons quedan alineados
 * verticalmente. El detalle se despliega en una fila propia con `colSpan`, de modo que abrir
 * un grupo nunca desalinea la tabla ni altera el orden.
 *
 * La fila completa es clickeable para el mouse y contiene un botón nativo con `aria-expanded`
 * para que también sea navegable y anunciable por teclado.
 */
const RepairTable = ({ summaries, openKey, onToggle }: { summaries: CashGroupSummary[]; openKey: string | null; onToggle: (key: string) => void }) => (
  <CashTableFrame label="Caja de reparaciones agrupada por reparación" minWidth={980}>
      <TableHead><TableRow>
        <TableCell sx={{ width: 170 }}>Reparación</TableCell>
        <TableCell sx={{ minWidth: 220 }}>Cliente / equipo</TableCell>
        <TableCell sx={{ width: 140 }}>Movimientos</TableCell>
        <TableCell align="right" sx={{ width: 120 }}>Ingresos</TableCell>
        <TableCell align="right" sx={{ width: 120 }}>Egresos</TableCell>
        <TableCell align="right" sx={{ width: 120 }}>Neto</TableCell>
        <TableCell sx={{ width: 140 }}>Última actividad</TableCell>
        <TableCell align="right" sx={{ width: 56 }} aria-label="Expandir" />
      </TableRow></TableHead>
      <TableBody>{summaries.length ? summaries.map(group => {
        const expanded = openKey === group.key
        const Chevron = expanded ? ExpandLessRounded : ExpandMoreRounded
        const toggle = () => onToggle(group.key)
        return <Fragment key={group.key}>
          <TableRow hover onClick={toggle} sx={{ cursor: 'pointer', '& > .MuiTableCell-root': { py: 1.25 } }}>
            <TableCell>
              {/* El botón es el punto de foco: el teclado activa el grupo sin depender del click de fila. */}
              <Box
                component="button"
                type="button"
                aria-expanded={expanded}
                onClick={event => { event.stopPropagation(); toggle() }}
                sx={{ display: 'block', width: '100%', textAlign: 'left', bgcolor: 'transparent', border: 0, p: 0, m: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', borderRadius: 1, '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 2 } }}
              >
                <Typography component="span" variant="body2" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{group.title}</Typography>
              </Box>
            </TableCell>
            <TableCell>
              <Typography variant="body2" fontWeight={650} sx={{ overflowWrap: 'anywhere' }}>{group.clientName}</Typography>
              {group.deviceLabel && <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }} display="block">{group.deviceLabel}</Typography>}
            </TableCell>
            <TableCell>{movementBadge(group.movementCount)}</TableCell>
            <TableCell align="right"><AmountCell amount={group.income} kind="income" /></TableCell>
            <TableCell align="right"><AmountCell amount={group.expense} kind="expense" /></TableCell>
            <TableCell align="right"><AmountCell amount={group.net} kind="net" /></TableCell>
            <TableCell>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatShortDate(group.lastMovementAt)}</Typography>
              <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }} display="block">{formatShortTime(group.lastMovementAt)}</Typography>
            </TableCell>
            <TableCell align="right"><Chevron fontSize="small" sx={{ color: 'text.secondary', verticalAlign: 'middle' }} /></TableCell>
          </TableRow>
          <TableRow>
            {/* Sin relleno ni borde propio: con el Collapse cerrado la fila mide cero. */}
            <TableCell colSpan={8} sx={{ p: 0, borderBottom: 'none' }}>
              <Collapse in={expanded} unmountOnExit>
                <Box sx={{ borderTop: `1px solid ${TABLE_BORDER}`, borderBottom: `1px solid ${TABLE_BORDER}` }}>
                  <MovementDetails movements={group.movements} mobile={false} />
                </Box>
              </Collapse>
            </TableCell>
          </TableRow>
        </Fragment>
      }) : <CashEmptyRow colSpan={8} title="Todavía no hay reparaciones con movimientos." description="Cuando se registre un cobro o un egreso de una reparación, va a aparecer acá agrupado por reparación." />}</TableBody>
  </CashTableFrame>
)

/**
 * Caja de reparaciones agrupada por reparación.
 *
 * En pantallas medianas y grandes el nivel principal es una tabla con columnas fijas y el
 * detalle se abre en una fila propia. En mobile se mantienen tarjetas compactas, sin tabla
 * horizontal. Al desplegar un grupo se pliega el anterior: así la vista sigue siendo legible.
 */
export function RepairCashGroupsList({ groups }: { groups: RepairCashGroup[] }) {
  // A partir de `md` el nivel principal es la tabla de columnas fijas; abajo, tarjetas.
  const mobile = useCashMobile()
  const [openKey, setOpenKey] = useState<string | null>(null)
  const toggle = (key: string) => setOpenKey(current => current === key ? null : key)
  // La tabla principal es SÓLO de reparaciones: los movimientos manuales no son un grupo más.
  const repairSummaries = groups.map(toSummary)

  if (!repairSummaries.length) return <RepairTable summaries={[]} openKey={openKey} onToggle={toggle} />

  if (mobile) return <Stack spacing={1.5}>{repairSummaries.map(group => {
    const expanded = openKey === group.key
    return <Box key={group.key} component="article" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2, minWidth: 0 }}>
      <GroupHeader group={group} expanded={expanded} onToggle={() => toggle(group.key)} />
      <Collapse in={expanded} unmountOnExit><MovementDetails movements={group.movements} mobile /></Collapse>
    </Box>
  })}</Stack>

  return <RepairTable summaries={repairSummaries} openKey={openKey} onToggle={toggle} />
}


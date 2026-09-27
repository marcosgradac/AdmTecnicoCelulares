import { useCallback, useEffect, useState } from 'react'
import {
  Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material'
import { DeleteOutlineRounded } from '@mui/icons-material'
import { cancelCommerceSale, getCommerceSales, type CommercePaymentMethod, type CommerceSale } from '../../services/commerce'
import { formatMoney, formatShortDate, formatShortTime } from '../../utils/format'
import { ListPagination } from '../admin/AdminPatterns'
import { RowActionsMenu } from '../common/RowActionsMenu'
import { UiState } from '../common/UiState'
import { TABLE_BORDER } from '../../theme/tokens'

const PAGE_SIZE = 10
/** Texto solo para lectores de pantalla en columnas sin encabezado visible. */
const SR_ONLY = { position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' } as const

const paymentLabels: Record<CommercePaymentMethod, string> = {
  CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', OTHER: 'Otro',
}

function SaleStatusChip({ cancelled }: { cancelled: boolean }) {
  return cancelled
    ? <Chip size="small" variant="outlined" label="Cancelada" sx={{ borderColor: 'error.main', color: 'error.dark', bgcolor: 'transparent', fontWeight: 700 }} />
    : <Chip size="small" variant="outlined" label="Completada" sx={{ borderColor: 'success.main', color: 'success.dark', bgcolor: 'transparent', fontWeight: 700 }} />
}

/**
 * Historial de ventas de Comercio, con cancelación histórica.
 *
 * Reutiliza el mismo origen que el resto del módulo (`getCommerceSales` y
 * `cancelCommerceSale`). Cancelar no borra nada: el backend marca la venta,
 * restaura el stock y deja la reversión en Caja.
 */
export function CommerceSalesTable({ revision, canManage, onCancelled }: { revision: number; canManage: boolean; onCancelled: () => void }) {
  const [items, setItems] = useState<CommerceSale[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState('')
  const [confirming, setConfirming] = useState<CommerceSale | null>(null)
  const [actionError, setActionError] = useState('')

  const load = useCallback(() => {
    let active = true
    setLoading(true); setError('')
    getCommerceSales({ page: page + 1, pageSize: PAGE_SIZE })
      .then(data => { if (!active) return; setItems(data.items); setTotal(data.total) })
      .catch(() => { if (active) { setItems([]); setTotal(0); setError('No pudimos cargar las últimas ventas.') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page])

  useEffect(() => load(), [load, revision])

  const runCancel = async (sale: CommerceSale) => {
    setPending(sale.id); setActionError('')
    try {
      await cancelCommerceSale(sale.id)
      setConfirming(null)

      // Refresca el historial y avisa al padre para recargar productos y stock.
      load()
      onCancelled()
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : 'No pudimos cancelar la venta.')
    } finally { setPending('') }
  }

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Typography variant="h2" sx={{ mb: 0.5 }}>Últimas ventas</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Historial de ventas del comercio. Cancelar una venta restaura el stock y deja la reversión registrada en Caja.
        </Typography>

        {actionError && <Box sx={{ mb: 2 }}><Typography variant="body2" color="error.main" fontWeight={650}>{actionError}</Typography></Box>}

        {loading ? <UiState loading />
          : error ? <UiState title="No pudimos cargar las ventas" description={error} action={load} actionLabel="Reintentar" />
            : items.length === 0 ? <UiState title="Todavía no hay ventas" description="Cuando confirmes una venta va a aparecer acá." />
              : (
                <TableContainer>
                  <Table sx={{ minWidth: 800, '& .MuiTableCell-root': { borderBottom: `1px solid ${TABLE_BORDER}` }, '& .MuiTableCell-head': { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'text.secondary', lineHeight: 1.4, py: 1, background: 'transparent' } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 110 }}>Venta</TableCell>
                        <TableCell sx={{ width: 120 }}>Fecha</TableCell>
                        <TableCell sx={{ width: 78 }}>Hora</TableCell>
                        <TableCell>Productos</TableCell>
                        <TableCell sx={{ width: 160 }}>Medio de pago</TableCell>
                        <TableCell align="right" sx={{ width: 130 }}>Total</TableCell>
                        <TableCell sx={{ width: 140 }}>Estado</TableCell>
                        <TableCell align="right" sx={{ width: 56 }}><Box component="span" sx={SR_ONLY}>Acciones</Box></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.map(sale => {
                        const cancelled = Boolean(sale.cancelledAt)
                        const units = sale.lines.reduce((sum, line) => sum + line.quantity, 0)
                        const names = sale.lines.map(line => line.productName).join(', ')
                        return (
                          <TableRow key={sale.id} hover sx={{ '&:last-of-type td': { borderBottom: 0 } }}>
                            <TableCell><Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>#{sale.id.slice(-6).toUpperCase()}</Typography></TableCell>
                            <TableCell><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatShortDate(sale.createdAt)}</Typography></TableCell>
                            <TableCell><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatShortTime(sale.createdAt)}</Typography></TableCell>
                            <TableCell><Tooltip title={names}><Typography variant="body2" sx={{ overflowWrap: 'anywhere', cursor: names ? 'help' : 'default' }}>{units} {units === 1 ? 'producto' : 'productos'}</Typography></Tooltip></TableCell>
                            <TableCell><Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{paymentLabels[sale.paymentMethod]}</Typography></TableCell>
                            <TableCell align="right"><Typography variant="body2" fontWeight={800} sx={{ color: sale.cancelledAt ? 'text.disabled' : 'success.dark', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(sale.total)}</Typography></TableCell>
                            <TableCell><SaleStatusChip cancelled={cancelled} /></TableCell>
                            <TableCell align="right" sx={{ width: 56 }}>
                          {cancelled
                            ? <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>—</Typography>
                            : canManage ? <RowActionsMenu label={`Acciones de la venta #${sale.id.slice(-6).toUpperCase()}`} actions={[{ label: 'Cancelar venta', icon: <DeleteOutlineRounded />, destructive: true, onClick: () => setConfirming(sale) }]} /> : null}
                        </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

        <ListPagination count={total} page={page} rowsPerPage={PAGE_SIZE} onPageChange={setPage} />

        {confirming && (
          <Box role="alertdialog" aria-modal="true" aria-label="Confirmar cancelación de venta" sx={{ position: 'fixed', inset: 0, zIndex: theme => theme.zIndex.modal, display: 'grid', placeItems: 'center', p: 2, bgcolor: 'rgba(23,26,35,.45)' }}>
            <Card sx={{ maxWidth: 460, width: '100%' }}>
              <CardContent>
                <Typography variant="h2" sx={{ mb: 1 }}>Cancelar la venta #{confirming.id.slice(-6).toUpperCase()}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  La venta se va a marcar como cancelada y se va a restaurar el stock de todos sus productos.
                  En Caja se va a registrar una devolución por {formatMoney(confirming.total)}, así el impacto financiero queda en cero.
                  La venta y sus productos NO se borran: se conserva todo el historial.
                </Typography>
                <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
                  <Button onClick={() => setConfirming(null)} disabled={Boolean(pending)} color="inherit">Volver</Button>
                  <Button variant="contained" color="error" onClick={() => void runCancel(confirming)} disabled={Boolean(pending)} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
                    {pending ? 'Cancelando…' : 'Cancelar venta'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

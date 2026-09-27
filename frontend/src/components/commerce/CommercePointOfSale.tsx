import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Card, CardContent, CircularProgress,
  Divider, Grid, IconButton, InputAdornment, MenuItem, Paper,
  Stack, TextField, Typography
} from '@mui/material'
import {
  AddRounded, ClearRounded, DeleteOutlineRounded,
  PointOfSaleRounded, RemoveRounded, SearchRounded, ShoppingCartOutlined
} from '@mui/icons-material'
import type { CommercePaymentMethod, CommerceProduct } from '../../services/commerce'
import { getCommerceProducts } from '../../services/commerce'
import { formatMoney } from '../../utils/format'
import { ListPagination } from '../admin/AdminPatterns'
import { UiState } from '../common/UiState'

export type CartItem = { product: CommerceProduct; quantity: number }

interface Props {
  canSell: boolean
  cart: Record<string, CartItem>
  paymentMethod: CommercePaymentMethod
  saving: boolean
  error: string
  onCartChange: (product: CommerceProduct, delta: number) => void
  onRemoveCartLine: (productId: string) => void
  onPaymentMethodChange: (method: CommercePaymentMethod) => void
  onConfirmSale: () => void
  revision: number
}

const paymentOptions: Array<[CommercePaymentMethod, string]> = [
  ['CASH', 'Efectivo'],
  ['TRANSFER', 'Transferencia'],
  ['CARD', 'Tarjeta'],
  ['OTHER', 'Otro'],
]

export function CommercePointOfSale({
  canSell, cart, paymentMethod, saving, error,
  onCartChange, onRemoveCartLine, onPaymentMethodChange,
  onConfirmSale, revision,
}: Props) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [products, setProducts] = useState<CommerceProduct[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(0) }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let active = true
    setLoading(true); setSearchError('')
    getCommerceProducts({
      search: debouncedSearch.trim() || undefined,
      inStock: true,
      page: page + 1,
      pageSize: 20,
    }).then(data => {
      if (!active) return
      if (page > 0 && !data.items.length) { setPage(Math.max(0, data.pages - 1)); return }
      setProducts(data.items); setTotal(data.total)
    }).catch(() => {
      if (active) { setProducts([]); setTotal(0); setSearchError('No pudimos buscar productos con stock.') }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [debouncedSearch, page, revision, reloadKey])

  const cartLines = Object.values(cart)
  const cartTotal = cartLines.reduce((sum, item) => sum + item.product.salePrice * item.quantity, 0)

  return (
    <Grid container spacing={2.5}>
      {/* Columna Izquierda: Preparar venta (60%) */}
      <Grid size={{ xs: 12, lg: 7, xl: 7.5 }} sx={{ minWidth: 0 }}>
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" alignItems="center" spacing={1.5} mb={2}>
              <PointOfSaleRounded color="primary" />
              <Box>
                <Typography variant="h2">Preparar venta</Typography>
                <Typography variant="body2" color="text.secondary">
                  Buscá y agregá productos con stock disponible al carrito.
                </Typography>
              </Box>
            </Stack>

            <Box sx={{ mb: 2 }}>
              <TextField
                fullWidth
                size="small"
                label="Buscar productos para vender"
                value={search}
                onChange={e => setSearch(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" color="action" /></InputAdornment>,
                    endAdornment: search ? <InputAdornment position="end"><IconButton size="small" aria-label="Limpiar búsqueda" onClick={() => setSearch('')} edge="end"><ClearRounded fontSize="small" /></IconButton></InputAdornment> : null,
                  },
                }}
              />
            </Box>

            {searchError && (
              <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => setReloadKey(k => k + 1)}>Reintentar</Button>}>
                {searchError}
              </Alert>
            )}

            {loading ? (
              <UiState loading />
            ) : searchError ? null : products.length > 0 ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, flex: 1 }}>
                {products.map(prod => {
                  const inCartQty = cart[prod.id]?.quantity ?? 0
                  const availableToAdd = prod.currentStock - inCartQty
                  return (
                    <Paper
                      key={prod.id}
                      variant="outlined"
                      sx={{
                        p: 1.75,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        borderRadius: 2.5,
                        borderColor: inCartQty > 0 ? 'primary.light' : 'divider',
                        bgcolor: inCartQty > 0 ? 'action.hover' : 'background.paper',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Box sx={{ mb: 1.5 }}>
                        <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere', fontSize: '0.95rem' }}>{prod.name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{prod.category}</Typography>
                      </Box>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
                        <Box>
                          <Typography variant="body1" fontWeight={800} color="primary.main">{formatMoney(prod.salePrice)}</Typography>
                          <Typography variant="caption" color={availableToAdd > 0 ? 'text.secondary' : 'error.main'}>
                            Stock {prod.currentStock} {inCartQty > 0 ? `(${inCartQty} en carrito)` : ''}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          variant="contained"
                          color="primary"
                          startIcon={<AddRounded />}
                          disabled={!canSell || availableToAdd <= 0 || saving}
                          onClick={() => onCartChange(prod, 1)}
                          sx={{ minWidth: 90 }}
                        >
                          {availableToAdd <= 0 ? 'Sin cupo' : 'Agregar'}
                        </Button>
                      </Stack>
                    </Paper>
                  )
                })}
              </Box>
            ) : (
              <UiState
                title={debouncedSearch.trim() ? 'No encontramos productos' : 'No hay productos con stock disponibles.'}
                description={debouncedSearch.trim() ? 'Probá con otra búsqueda.' : 'Cargá stock a tus productos para poder venderlos.'}
              />
            )}

            <ListPagination count={total} page={page} rowsPerPage={20} onPageChange={setPage} />
          </CardContent>
        </Card>
      </Grid>
      {/* Columna Derecha: Carrito y Cobro (40%) */}
      <Grid size={{ xs: 12, lg: 5, xl: 4.5 }} sx={{ minWidth: 0 }}>
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" alignItems="center" spacing={1.5} mb={2}>
              <ShoppingCartOutlined color="primary" />
              <Box>
                <Typography variant="h2">Carrito</Typography>
                <Typography variant="body2" color="text.secondary">
                  {cartLines.length} {cartLines.length === 1 ? 'producto seleccionado' : 'productos seleccionados'}
                </Typography>
              </Box>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {cartLines.length === 0 ? (
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6, px: 2, textAlign: 'center', bgcolor: 'action.hover', borderRadius: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Agregá productos para preparar la venta.
                </Typography>
              </Box>
            ) : (
              <Stack spacing={1.5} sx={{ flex: 1, mb: 2.5, overflowY: 'auto', maxHeight: { lg: 380 } }}>
                {cartLines.map(({ product, quantity }) => (
                  <Paper key={product.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                      <Box minWidth={0} flex={1}>
                        <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere', fontSize: '0.925rem' }}>{product.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatMoney(product.salePrice)} c/u · Stock máx: {product.currentStock}
                        </Typography>
                      </Box>
                      <IconButton size="small" aria-label={`Quitar ${product.name} del carrito`} onClick={() => onRemoveCartLine(product.id)} disabled={!canSell || saving} edge="end" sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}>
                        <DeleteOutlineRounded fontSize="small" />
                      </IconButton>
                    </Stack>
                    <Divider sx={{ my: 1 }} />
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <IconButton size="small" aria-label="Restar una unidad" onClick={() => onCartChange(product, -1)} disabled={!canSell || saving} sx={{ border: 1, borderColor: 'divider', p: 0.5 }}>
                          <RemoveRounded fontSize="small" />
                        </IconButton>
                        <Typography fontWeight={700} sx={{ px: 1, minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                          {quantity}
                        </Typography>
                        <IconButton size="small" aria-label="Sumar una unidad" onClick={() => onCartChange(product, 1)} disabled={!canSell || saving || quantity >= product.currentStock} sx={{ border: 1, borderColor: 'divider', p: 0.5 }}>
                          <AddRounded fontSize="small" />
                        </IconButton>
                      </Stack>
                      {/* Importe de la línea: es ingreso, por lo que se lee en verde. */}
                      <Typography variant="body2" fontWeight={800} color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatMoney(product.salePrice * quantity)}
                      </Typography>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}

            <Box sx={{ mt: 'auto', pt: 2, borderTop: 1, borderColor: 'divider' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h2" sx={{ fontSize: '1.15rem' }}>Total</Typography>
                <Typography variant="h1" color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(cartTotal)}
                </Typography>
              </Stack>

              <TextField
                select
                fullWidth
                size="small"
                label="Medio de pago"
                value={paymentMethod}
                onChange={e => onPaymentMethodChange(e.target.value as CommercePaymentMethod)}
                disabled={!canSell || saving || !cartLines.length}
                sx={{ mb: 2 }}
              >
                {paymentOptions.map(opt => (
                  <MenuItem key={opt[0]} value={opt[0]}>{opt[1]}</MenuItem>
                ))}
              </TextField>

              <Button
                fullWidth
                variant="contained"
                size="large"
                disabled={!canSell || !cartLines.length || saving}
                onClick={onConfirmSale}
                startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <PointOfSaleRounded />}
                sx={{ py: 1.25, fontWeight: 700 }}
              >
                {saving ? 'Confirmando venta…' : 'Confirmar venta'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  )
}

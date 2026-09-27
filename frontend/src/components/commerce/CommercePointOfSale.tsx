import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Drawer,
  IconButton, InputAdornment, MenuItem, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
  useMediaQuery, useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import {
  AddRounded, ClearRounded, DeleteOutlineRounded,
  LocalShippingRounded, PointOfSaleRounded, RemoveRounded,
  SearchRounded, ShoppingCartOutlined,
} from '@mui/icons-material'
import type { CommercePaymentMethod, CommerceProduct } from '../../services/commerce'
import { getCommerceCategories, getCommerceProducts } from '../../services/commerce'
import { formatMoney } from '../../utils/format'
import { ListPagination } from '../admin/AdminPatterns'
import { UiState } from '../common/UiState'
import { categoryIcon } from './categoryIcons'
import { TABLE_BORDER } from '../../theme/tokens'

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

/** Máximo de productos por página. La paginación es del backend: no se traen de más. */
const PAGE_SIZE = 10

/** Por debajo de este stock el aviso pasa a tono suave: informa sin alarmar. */
const LOW_STOCK = 3
/** Texto solo para lectores de pantalla en columnas sin encabezado visible. */
const SR_ONLY = { position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' } as const

export function CommercePointOfSale({
  canSell, cart, paymentMethod, saving, error,
  onCartChange, onRemoveCartLine, onPaymentMethodChange,
  onConfirmSale, revision,
}: Props) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [products, setProducts] = useState<CommerceProduct[]>([])
  /** Icono de cada categoría por nombre. El producto guarda la categoría como texto,
   *  así que se resuelve contra el catálogo real para no inventar otro sistema de iconos. */
  const [categoryIconKeys, setCategoryIconKeys] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  /** En mobile el carrito vive en un drawer; en desktop es una columna fija. Solo presentación. */
  const [cartOpen, setCartOpen] = useState(false)
  const theme = useTheme()
  const compact = useMediaQuery(theme.breakpoints.down('lg'))

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(0) }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let active = true
    getCommerceCategories()
      .then(list => { if (active) setCategoryIconKeys(Object.fromEntries(list.map(entry => [entry.name, entry.iconKey ?? 'generic']))) })
      .catch(() => { if (active) setCategoryIconKeys({}) })
    return () => { active = false }
  }, [revision])

  useEffect(() => {
    let active = true
    setLoading(true); setSearchError('')
    getCommerceProducts({
      search: debouncedSearch.trim() || undefined,
      inStock: true,
      page: page + 1,
      pageSize: PAGE_SIZE,
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

  /** Card de producto. Solo presentación: el click sigue delegando en onCartChange. */
  /**
   * Fila de producto. En desktop se renderiza dentro de la tabla de productos;
   * en mobile mantiene la card actual. Solo presentación: el click y el botón
   * delegan siempre en `onCartChange`, igual que antes.
   */
  const productCell = (product: CommerceProduct) => {
    const inCartQty = cart[product.id]?.quantity ?? 0
    const availableToAdd = product.currentStock - inCartQty
    const soldOut = product.currentStock <= 0
    const lowStock = !soldOut && product.currentStock <= LOW_STOCK
    const disabled = !canSell || availableToAdd <= 0 || saving
    const add = () => { if (!disabled) onCartChange(product, 1) }
    const stockLabel = soldOut
      ? <Typography variant="caption" fontWeight={700} sx={{ color: 'error.main' }}>Sin stock</Typography>
      : <Typography variant="body2" fontWeight={650} sx={{ color: lowStock ? 'warning.dark' : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{product.currentStock}</Typography>
    const priceLabel = <Typography variant="body2" fontWeight={800} sx={{ color: 'success.dark', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(product.salePrice)}</Typography>
    const CategoryIcon = categoryIcon(categoryIconKeys[product.category])
    const categoryCell = (
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
        <Box sx={{ width: 26, height: 26, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '8px', bgcolor: 'action.hover', color: 'text.secondary' }}>
          <CategoryIcon sx={{ fontSize: 15 }} />
        </Box>
        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 140 }}>{product.category}</Typography>
      </Stack>
    )
    return {
      disabled, soldOut, lowStock, inCartQty, availableToAdd,
      desktop: (
        <TableRow key={product.id} hover sx={{ cursor: disabled ? 'default' : 'pointer', transition: 'background-color .15s ease', '&:last-of-type td': { borderBottom: 0 } }} onClick={add}>
          <TableCell>
            <Box minWidth={0}>
              <Typography fontWeight={700} sx={{ fontSize: '.9rem', overflowWrap: 'anywhere' }}>{product.name}</Typography>
              {inCartQty > 0 && <Typography variant="caption" color="primary.main" fontWeight={650}>{inCartQty} en carrito</Typography>}
            </Box>
          </TableCell>
          <TableCell>{categoryCell}</TableCell>
          <TableCell>{stockLabel}</TableCell>
          <TableCell align="right">{priceLabel}</TableCell>
          <TableCell align="right" sx={{ width: 52 }}>
            <IconButton aria-label={`Agregar ${product.name} al carrito`} disabled={disabled} onClick={event => { event.stopPropagation(); add() }} size="small" sx={{ width: 32, height: 32, borderRadius: '9px', border: '1px solid', borderColor: availableToAdd > 0 ? alpha(theme.palette.primary.main, 0.28) : TABLE_BORDER, color: availableToAdd > 0 ? 'primary.main' : 'text.disabled', '&:hover': { bgcolor: t => alpha(t.palette.primary.main, 0.08) } }}>
              <AddRounded sx={{ fontSize: 18 }} />
            </IconButton>
          </TableCell>
        </TableRow>
      ),
      mobile: (
        <Card
          key={product.id}
          variant="outlined"
          onClick={add}
          aria-disabled={disabled}
          sx={{
            p: '18px', display: 'flex', flexDirection: 'column', gap: '14px',
            borderRadius: '14px',
            borderColor: inCartQty > 0 ? 'primary.main' : TABLE_BORDER,
            backgroundColor: soldOut ? 'action.hover' : 'background.paper',
            cursor: disabled ? 'default' : 'pointer',
            opacity: soldOut ? 0.72 : 1,
            transition: 'border-color .18s ease, box-shadow .18s ease, background-color .18s ease, transform .18s ease',
            '&:hover': disabled ? undefined : { transform: 'translateY(-2px)', borderColor: t => alpha(t.palette.primary.main, 0.38) },
          }}
        >
          <Box minWidth={0}>
            <Typography sx={{ fontWeight: 700, fontSize: '.94rem', lineHeight: 1.3, color: 'text.primary', overflowWrap: 'anywhere' }}>{product.name}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{product.category}</Typography>
          </Box>
          <Stack direction="row" alignItems="flex-end" justifyContent="space-between" gap={1} sx={{ mt: 'auto' }}>
            <Box minWidth={0}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2, color: 'success.dark', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(product.salePrice)}</Typography>
              {soldOut
                ? <Typography variant="caption" fontWeight={700} sx={{ color: 'error.main' }}>Sin stock</Typography>
                : lowStock
                  ? <Typography variant="caption" sx={{ color: 'warning.dark', fontWeight: 650 }}>Quedan {product.currentStock}{inCartQty > 0 ? ` · ${inCartQty} en carrito` : ''}</Typography>
                  : <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600 }}>Stock {product.currentStock}{inCartQty > 0 ? ` · ${inCartQty} en carrito` : ''}</Typography>}
            </Box>
            <IconButton aria-label={`Agregar ${product.name} al carrito`} disabled={disabled} onClick={event => { event.stopPropagation(); add() }} sx={{ flexShrink: 0, width: 38, height: 38, borderRadius: '11px', border: '1px solid', borderColor: availableToAdd > 0 ? alpha(theme.palette.primary.main, 0.28) : TABLE_BORDER, color: availableToAdd > 0 ? 'primary.main' : 'text.disabled', '&:hover': { bgcolor: t => alpha(t.palette.primary.main, 0.08) } }}>
              <AddRounded fontSize="small" />
            </IconButton>
          </Stack>
        </Card>
      ),
    }
  }
  /**
   * Carrito completo: header, líneas, medio de pago, total y confirmación.
   * Se usa igual en la columna de desktop y dentro del drawer mobile, así no
   * hay dos versiones que se puedan desincronizar.
   */
  const cartPanel = (
    <Card sx={{ display: 'flex', flexDirection: 'column', borderRadius: '15px' }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ pb: 2, borderBottom: '1px solid', borderColor: TABLE_BORDER }}>
          <Box sx={{ width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '10px', bgcolor: t => alpha(t.palette.primary.main, 0.08), color: 'primary.main' }}>
            <ShoppingCartOutlined sx={{ fontSize: 20 }} />
          </Box>
          <Box minWidth={0}>
            <Typography sx={{ fontWeight: 750, fontSize: '1.05rem', lineHeight: 1.2 }}>Carrito de venta</Typography>
            <Typography variant="caption" color="text.secondary">
              {cartLines.length ? `${cartLines.length} ${cartLines.length === 1 ? 'producto' : 'productos'}` : 'Sin productos'}
            </Typography>
          </Box>
        </Stack>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {cartLines.length === 0 ? (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', py: 7, px: 2 }}>
            <Box>
              <Box sx={{ width: 46, height: 46, mx: 'auto', mb: 1.5, display: 'grid', placeItems: 'center', borderRadius: '14px', bgcolor: 'action.hover', color: 'text.disabled' }}>
                <ShoppingCartOutlined sx={{ fontSize: 22 }} />
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: '.94rem' }}>Carrito vacío</Typography>
              <Typography variant="body2" color="text.secondary">Agregá productos para preparar la venta.</Typography>
            </Box>
          </Box>
        ) : (
          <Stack sx={{ flex: 1, minHeight: 0, my: 0.5 }}>
            {cartLines.map(({ product, quantity }) => (
              <Box key={product.id} sx={{ py: '18px', borderBottom: '1px solid', borderColor: TABLE_BORDER, '&:last-of-type': { borderBottom: 0 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                  <Box minWidth={0} flex={1}>
                    <Typography sx={{ fontWeight: 700, fontSize: '.9rem', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{product.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(product.salePrice)} c/u</Typography>
                  </Box>
                  <Stack direction="row" alignItems="center" spacing={0.25} sx={{ flexShrink: 0 }}>
                    <IconButton aria-label={`Restar una unidad de ${product.name}`} onClick={() => onCartChange(product, -1)} disabled={!canSell || saving} size="small" sx={{ width: 28, height: 28, border: '1px solid', borderColor: TABLE_BORDER, borderRadius: '8px', color: 'text.secondary', '&:hover': { borderColor: 'primary.main', color: 'primary.main' } }}>
                      <RemoveRounded sx={{ fontSize: 15 }} />
                    </IconButton>
                    <Typography sx={{ minWidth: 24, textAlign: 'center', fontWeight: 700, fontSize: '.9rem', fontVariantNumeric: 'tabular-nums' }}>{quantity}</Typography>
                    <IconButton aria-label={`Sumar una unidad de ${product.name}`} onClick={() => onCartChange(product, 1)} disabled={!canSell || saving || quantity >= product.currentStock} size="small" sx={{ width: 28, height: 28, border: '1px solid', borderColor: TABLE_BORDER, borderRadius: '8px', color: 'text.secondary', '&:hover': { borderColor: 'primary.main', color: 'primary.main' } }}>
                      <AddRounded sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Stack>
                </Stack>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mt: 0.75 }}>
                  <Typography variant="caption" color="text.disabled">
                    {quantity} {quantity === 1 ? 'unidad' : 'unidades'}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography sx={{ fontWeight: 800, fontSize: '.95rem', color: 'success.dark', fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(product.salePrice * quantity)}
                    </Typography>
                    <IconButton aria-label={`Quitar ${product.name} del carrito`} onClick={() => onRemoveCartLine(product.id)} disabled={!canSell || saving} size="small" sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                      <DeleteOutlineRounded sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>
        )}

        <Box sx={{ mt: 'auto', pt: 2.5, borderTop: '1px solid', borderColor: TABLE_BORDER }}>
          <TextField
            select fullWidth size="small"
            label="Medio de pago"
            value={paymentMethod}
            onChange={e => onPaymentMethodChange(e.target.value as CommercePaymentMethod)}
            disabled={!canSell || saving || !cartLines.length}
            sx={{ mb: 2.5 }}
          >
            {paymentOptions.map(opt => (
              <MenuItem key={opt[0]} value={opt[0]}>{opt[1]}</MenuItem>
            ))}
          </TextField>

          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 2.5 }}>
            <Typography sx={{ fontWeight: 700 }}>Total</Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '1.75rem', lineHeight: 1.1, letterSpacing: '-.02em', color: 'success.dark', fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(cartTotal)}
            </Typography>
          </Stack>

          <Button
            fullWidth
            variant="contained"
            size="large"
            disabled={!canSell || !cartLines.length || saving}
            onClick={onConfirmSale}
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <PointOfSaleRounded />}
            sx={{ py: 1.35, fontWeight: 700, borderRadius: '12px' }}
          >
            {saving ? 'Confirmando venta…' : 'Confirmar venta'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: { xs: 2, lg: 2.5 }, alignItems: 'flex-start' }}>
      {/* Productos: en desktop cede el alto al carrito, que es el que ancla el scroll. */}
      <Box sx={{ flex: '1 1 0', minWidth: 0, width: { xs: '100%', lg: 'auto' } }}>
        <Card sx={{ display: 'flex', flexDirection: 'column', borderRadius: '15px' }}>
          <CardContent>
            {/* Sin instrucción redundante: la card clickeable se explica sola. */}
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 2.5 }}>
              <Box sx={{ width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '10px', bgcolor: t => alpha(t.palette.primary.main, 0.08), color: 'primary.main' }}>
                <PointOfSaleRounded sx={{ fontSize: 20 }} />
              </Box>
              <Typography variant="h2" sx={{ fontSize: '1.05rem', lineHeight: 1.2 }}>Productos</Typography>
            </Stack>

            <TextField
              fullWidth size="small"
              label="Buscar productos para vender"
              value={search}
              onChange={e => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" color="action" /></InputAdornment>,
                  endAdornment: search ? <InputAdornment position="end"><IconButton size="small" aria-label="Limpiar búsqueda" onClick={() => setSearch('')} edge="end"><ClearRounded fontSize="small" /></IconButton></InputAdornment> : null,
                },
              }}
              sx={{ mb: 2.5 }}
            />

            {searchError && (
              <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => setReloadKey(k => k + 1)}>Reintentar</Button>}>
                {searchError}
              </Alert>
            )}

            {loading ? (
              <UiState loading />
            ) : searchError ? null : products.length > 0 ? (
              // Desktop: tabla, igual que el resto del admin. Mobile: se mantiene el grid de cards.
              <>
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  <Table sx={{ minWidth: 620, '& .MuiTableCell-root': { borderBottom: `1px solid ${TABLE_BORDER}` }, '& .MuiTableCell-head': { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'text.secondary', lineHeight: 1.4, py: 1, background: 'transparent' } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Producto</TableCell>
                        <TableCell>Categoría</TableCell>
                        <TableCell align="right" sx={{ width: 90 }}>Stock</TableCell>
                        <TableCell align="right" sx={{ width: 130 }}>Precio</TableCell>
                        <TableCell align="right" sx={{ width: 52 }}><Box component="span" sx={SR_ONLY}>Acción</Box></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>{products.map(product => productCell(product).desktop)}</TableBody>
                  </Table>
                </Box>
                <Box sx={{ display: { xs: 'grid', md: 'none' }, gridTemplateColumns: '1fr', gap: 1.5 }}>
                  {products.map(product => productCell(product).mobile)}
                </Box>
              </>
            ) : (
              <UiState
                title={debouncedSearch.trim() ? 'No encontramos productos' : 'No hay productos con stock disponibles.'}
                description={debouncedSearch.trim() ? 'Probá con otra búsqueda.' : 'Cargá stock a tus productos para poder venderlos.'}
              />
            )}

            <ListPagination count={total} page={page} rowsPerPage={PAGE_SIZE} onPageChange={setPage} />
          </CardContent>
        </Card>
      </Box>

      {/* Carrito lateral. Sticky para que siga a la vista al recorrer productos, sin scroll propio en mobile. */}
      <Box sx={{ flex: '0 0 380px', maxWidth: '100%', display: { xs: 'none', lg: 'block' }, position: 'sticky', top: 88 }}>
        {cartPanel}
      </Box>

      {/* Barra compacta de mobile: el carrito no vive abajo en la página, se abre acá. */}
      {compact && cartLines.length > 0 && (
        <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: theme => theme.zIndex.appBar, p: 1.5, pb: 'max(12px, env(safe-area-inset-bottom))', bgcolor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(8px)', borderTop: '1px solid', borderColor: TABLE_BORDER }}>
          <Button
            fullWidth variant="contained" size="large"
            onClick={() => setCartOpen(true)}
            startIcon={<ShoppingCartOutlined />}
            endIcon={<Box component="span" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(cartTotal)}</Box>}
            sx={{ py: 1.25, borderRadius: '12px', justifyContent: 'space-between' }}
          >
            Ver carrito ({cartLines.length})
          </Button>
        </Box>
      )}

      {/* Mismo panel del carrito, en drawer, para mobile. */}
      <Drawer
        anchor="bottom"
        open={compact && cartOpen}
        onClose={() => setCartOpen(false)}
        slotProps={{ paper: { sx: { maxHeight: '92vh', borderTopLeftRadius: 20, borderTopRightRadius: 20, p: 2 } } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', pb: 1.5 }}>
          <Box sx={{ width: 40, height: 4, borderRadius: '999px', bgcolor: 'divider' }} />
        </Box>
        {cartPanel}
        <Button fullWidth onClick={() => setCartOpen(false)} sx={{ mt: 1.5, color: 'text.secondary' }}>Volver a productos</Button>
      </Drawer>
    </Box>
  )
}

import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Card, CardContent, IconButton, InputAdornment, Stack, TextField, Typography,
} from '@mui/material'
import { ClearRounded, SearchRounded } from '@mui/icons-material'
import { getCommerceProducts, type CommerceProduct } from '../../services/commerce'
import { ListPagination } from '../admin/AdminPatterns'
import { UiState } from '../common/UiState'
import { CommerceProductsTable } from './CommerceProductsTable'
import { GRADIENT_TEXT_SX } from '../../theme/tokens'

/** La tabla general pagina contra la API: nunca se traen los productos de golpe. */
const PAGE_SIZE = 10

interface Props {
  canManage: boolean
  onNewProduct: () => void
  onEditProduct: (product: CommerceProduct) => void
  onDeleteProduct: (product: CommerceProduct) => void
  revision: number
}

/**
 * Tabla general de productos: el catálogo completo del comercio, sin depender de una
 * categoría seleccionada. Reutiliza CommerceProductsTable, que ya resuelve la lectura
 * en tabla (desktop) y en fichas (mobile); acá solo se aporta la capa de datos.
 */
export function CommerceProductsSection({ canManage, onNewProduct, onEditProduct, onDeleteProduct, revision }: Props) {
  const [products, setProducts] = useState<CommerceProduct[]>([])
  const [totalProducts, setTotalProducts] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  // Cada cambio de búsqueda vuelve a la primera página: si no, se buscaría dentro de un
  // fragmento arbitrario del catálogo.
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(0) }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    void getCommerceProducts({
      search: debouncedSearch.trim() || undefined,
      page: page + 1,
      pageSize: PAGE_SIZE,
    }).then(data => {
      if (!active) return
      // Si la última página quedó vacía (por ejemplo tras eliminar su único producto),
      // se retrocede en lugar de mostrar un listado en blanco.
      if (page > 0 && !data.items.length) { setPage(Math.max(0, data.pages - 1)); return }
      setProducts(data.items); setTotalProducts(data.total)
    }).catch(() => {
      if (active) { setProducts([]); setTotalProducts(0); setError('No pudimos cargar los productos del comercio.') }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [debouncedSearch, page, revision, retry])

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="h2" sx={GRADIENT_TEXT_SX}>Productos</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Administrá el stock, costos y precios de todos tus productos.
          </Typography>
        </Box>
        <TextField
          fullWidth
          size="small"
          label="Buscar productos"
          placeholder="Buscar por nombre o categoría"
          value={search}
          onChange={event => setSearch(event.target.value)}
          sx={{ mb: 2 }}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" color="action" /></InputAdornment>,
              endAdornment: search ? <InputAdornment position="end"><IconButton size="small" aria-label="Limpiar búsqueda" onClick={() => setSearch('')} edge="end"><ClearRounded fontSize="small" /></IconButton></InputAdornment> : null,
            },
          }}
        />

        {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={() => setRetry(value => value + 1)}>Reintentar</Button>}>{error}</Alert>}

        {loading && !error ? (
          <UiState loading />
        ) : products.length > 0 ? (
          <CommerceProductsTable products={products} canManage={canManage} onEdit={onEditProduct} onDelete={onDeleteProduct} />
        ) : (
          <UiState
            title={debouncedSearch.trim() ? 'No encontramos productos' : 'Todavía no cargaste productos.'}
            description={debouncedSearch.trim() ? 'Probá buscando con otro nombre o limpiá el filtro.' : 'Cargá el primer producto para comenzar a gestionarlo.'}
            action={canManage && !debouncedSearch.trim() ? onNewProduct : undefined}
            actionLabel="Nuevo producto"
          />
        )}

        <ListPagination count={totalProducts} page={page} rowsPerPage={PAGE_SIZE} onPageChange={setPage} disabled={loading} />
      </CardContent>
    </Card>
  )
}
import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Card, CardContent, Chip, IconButton,
  InputAdornment, Stack, TextField, Typography
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import {
  ArrowBackRounded, AddRounded, ClearRounded, DeleteOutlineRounded,
  EditRounded, SearchRounded
} from '@mui/icons-material'
import { getCommerceProducts, type CommerceCategory, type CommerceProduct } from '../../services/commerce'
import { ListPagination } from '../admin/AdminPatterns'
import { RowActionsMenu } from '../common/RowActionsMenu'
import { CommerceProductsTable } from './CommerceProductsTable'
import { categoryIcon } from './categoryIcons'
import { UiState } from '../common/UiState'

interface Props {
  category: CommerceCategory
  canManage: boolean
  onBack: () => void
  onNewProduct: () => void
  onEditCategory: () => void
  onDeleteCategory: () => void
  onEditProduct: (product: CommerceProduct) => void
  onDeleteProduct: (product: CommerceProduct) => void
  revision: number
}

export function CommerceCategoryWorkspace({
  category, canManage, onBack, onNewProduct, onEditCategory,
  onDeleteCategory, onEditProduct, onDeleteProduct, revision,
}: Props) {
  const [products, setProducts] = useState<CommerceProduct[]>([])
  const [totalProducts, setTotalProducts] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const CategoryIcon = categoryIcon(category.iconKey)

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(0) }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    void getCommerceProducts({
      category: category.name,
      search: debouncedSearch.trim() || undefined,
      page: page + 1,
      pageSize: 20,
    }).then(data => {
      if (!active) return
      if (page > 0 && !data.items.length) { setPage(Math.max(0, data.pages - 1)); return }
      setProducts(data.items); setTotalProducts(data.total)
    }).catch(() => {
      if (active) { setProducts([]); setTotalProducts(0); setError('No pudimos cargar los productos de esta categoría.') }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [category.name, debouncedSearch, page, revision, retry])

  return (
    <Box>
      <Box sx={{ mb: 2.5 }}>
        <Button startIcon={<ArrowBackRounded />} onClick={onBack} sx={{ mb: 1.5, color: 'text.secondary', fontWeight: 600 }}>
          Volver al punto de venta
        </Button>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" gap={2}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
              <Box sx={{ width: 44, height: 44, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 2.5, bgcolor: theme => alpha(theme.palette.primary.main, 0.1), color: 'primary.main' }}>
                <CategoryIcon sx={{ fontSize: 23 }} />
              </Box>
              <Box minWidth={0}>
                <Stack direction="row" alignItems={{ xs: 'flex-start', sm: 'center' }} gap={1.5} flexWrap="wrap">
                  <Typography variant="h1" sx={{ overflowWrap: 'anywhere', maxWidth: '100%' }}>{category.name}</Typography>
                  <Chip size="small" label={`${category.productCount} ${category.productCount === 1 ? 'producto activo' : 'productos activos'}`} color="primary" variant="outlined" sx={{ fontWeight: 650 }} />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Administrá los productos y el stock correspondientes a esta categoría.
                </Typography>
              </Box>
            </Stack>
          </Box>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Button variant="outlined" startIcon={<EditRounded />} onClick={onEditCategory} disabled={!canManage}>Editar categoría</Button>
            {canManage && (
              <RowActionsMenu label={`Acciones para ${category.name}`} actions={[
                { label: 'Eliminar categoría', icon: <DeleteOutlineRounded />, destructive: true, onClick: onDeleteCategory },
              ]} />
            )}
          </Stack>
        </Stack>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={() => setRetry(value => value + 1)}>Reintentar</Button>}>{error}</Alert>}

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
            <Box minWidth={0}>
              <Typography variant="h2">Productos</Typography>
              <Typography variant="body2" color="text.secondary">
                {debouncedSearch.trim() ? `Resultados para «${debouncedSearch.trim()}»` : 'Listado completo con stock, costos y márgenes por unidad.'}
              </Typography>
            </Box>
            {canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={onNewProduct} sx={{ alignSelf: { xs: 'flex-start', sm: 'auto' }, flexShrink: 0 }}>Nuevo producto</Button>}
          </Stack>
          <TextField
            fullWidth
            size="small"
            label="Buscar productos en esta categoría"
            placeholder="Buscar por nombre"
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ mb: 2 }}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" color="action" /></InputAdornment>,
                endAdornment: search ? <InputAdornment position="end"><IconButton size="small" aria-label="Limpiar búsqueda" onClick={() => setSearch('')} edge="end"><ClearRounded fontSize="small" /></IconButton></InputAdornment> : null,
              },
            }}
          />

          {loading ? (
            <UiState loading />
          ) : error ? null : products.length > 0 ? (
            <CommerceProductsTable products={products} canManage={canManage} onEdit={onEditProduct} onDelete={onDeleteProduct} />
          ) : (
            <UiState
              title={debouncedSearch.trim() ? 'No encontramos productos' : 'Esta categoría todavía no tiene productos.'}
              description={debouncedSearch.trim() ? 'Probá buscando con otro nombre o limpiá el filtro.' : 'Cargá el primer producto para comenzar a gestionarlo.'}
              action={canManage ? onNewProduct : undefined}
              actionLabel="Nuevo producto"
            />
          )}

          <ListPagination count={totalProducts} page={page} rowsPerPage={20} onPageChange={setPage} />
        </CardContent>
      </Card>
    </Box>
  )
}

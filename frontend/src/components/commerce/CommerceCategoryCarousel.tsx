import { Box, Button, Card, CardContent, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import {
  AddRounded, ClearRounded, DeleteOutlineRounded,
  EditRounded, Inventory2Rounded, SearchRounded,
} from '@mui/icons-material'
import type { CommerceCategory } from '../../services/commerce'
import { RowActionsMenu } from '../common/RowActionsMenu'
import { CircularCategoryCarousel } from './CircularCategoryCarousel'
import { categoryIcon } from './categoryIcons'
import { useAdaptiveRow } from './useAdaptiveRow'

interface Props {
  categories: CommerceCategory[]
  canManage: boolean
  searchQuery: string
  onSearchChange: (value: string) => void
  onNewCategory: () => void
  onSelectCategory: (category: CommerceCategory) => void
  onEditCategory: (category: CommerceCategory) => void
  onDeleteCategory: (category: CommerceCategory) => void
}

/** Ancho mínimo cómodo de una card antes de preferir el carrusel circular. */
const MIN_CARD_WIDTH = 208

export function CommerceCategoryCarousel({
  categories, canManage, searchQuery, onSearchChange, onNewCategory,
  onSelectCategory, onEditCategory, onDeleteCategory,
}: Props) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredCategories = categories.filter(cat => cat.name.toLocaleLowerCase().includes(normalizedQuery))
  // Grid mientras la fila se lea cómoda; carrusel desde las cinco categorías o cuando el ancho no alcanza.
  const { containerRef, useCarousel } = useAdaptiveRow(filteredCategories.length, { minCardWidth: MIN_CARD_WIDTH })

  const card = (cat: CommerceCategory) => {
    const Icon = categoryIcon(cat.iconKey)
    return (
    <Card
      key={cat.id}
      variant="outlined"
      onClick={() => onSelectCategory(cat)}
      sx={{
        minWidth: 0,
        height: '100%',
        cursor: 'pointer',
        borderRadius: 2,
        width: '100%',
        transition: 'border-color .18s ease, box-shadow .18s ease, transform .18s ease',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: theme => `0 6px 18px ${alpha(theme.palette.primary.main, 0.12)}`,
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, height: '100%' }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Box sx={{ width: 38, height: 38, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, bgcolor: theme => alpha(theme.palette.primary.main, 0.1), color: 'primary.main' }}>
            <Icon sx={{ fontSize: 20 }} />
          </Box>
          {canManage && (
            <Box onClick={event => event.stopPropagation()} sx={{ flexShrink: 0, mr: -0.75, mt: -0.75, opacity: { xs: 1, md: 0.55 }, transition: 'opacity .15s ease', '&:hover, &:focus-within': { opacity: 1 } }}>
              <RowActionsMenu label={`Acciones de categoría ${cat.name}`} actions={[
                { label: 'Editar nombre', icon: <EditRounded />, onClick: () => onEditCategory(cat) },
                { label: 'Eliminar', icon: <DeleteOutlineRounded />, destructive: true, onClick: () => onDeleteCategory(cat) },
              ]} />
            </Box>
          )}
        </Stack>
        <Box sx={{ mt: 1.5, minWidth: 0 }}>
          <Typography fontWeight={750} title={cat.name} sx={{ fontSize: '.95rem', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{cat.name}</Typography>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25, color: 'text.secondary' }}>
            <Inventory2Rounded sx={{ fontSize: 14 }} />
            <Typography variant="caption">{cat.productCount} {cat.productCount === 1 ? 'producto activo' : 'productos activos'}</Typography>
          </Stack>
        </Box>
      </CardContent>
    </Card>
    )
  }

  return (
    <Card sx={{ mb: 2.5 }}>
      <CardContent>
        <Box minWidth={0} sx={{ mb: 2 }}>
          <Typography variant="h2">Categorías</Typography>
          <Typography variant="body2" color="text.secondary">Organizá tus productos y administrá su inventario.</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mb: 2 }}>
          <TextField
            size="small"
            label="Buscar categoría"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            slotProps={{
              input: {
                startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" color="action" /></InputAdornment>,
                endAdornment: searchQuery ? <InputAdornment position="end"><IconButton size="small" aria-label="Limpiar búsqueda" onClick={() => onSearchChange('')} edge="end"><ClearRounded fontSize="small" /></IconButton></InputAdornment> : null,
              },
            }}
            sx={{ flex: 1, minWidth: 0 }}
          />
          {canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={onNewCategory} sx={{ flexShrink: 0 }}>Nueva categoría</Button>}
        </Stack>
        <Box ref={containerRef} sx={{ minWidth: 0 }}>
          {filteredCategories.length === 0 ? (
            <Box sx={{ py: 3.5, px: 2, textAlign: 'center', borderRadius: 2, bgcolor: 'action.hover' }}>
              <Typography variant="body2" color="text.secondary">
                {searchQuery.trim() ? 'No encontramos categorías que coincidan con la búsqueda.' : 'Todavía no hay categorías creadas.'}
              </Typography>
            </Box>
          ) : useCarousel ? (
            <CircularCategoryCarousel
              categories={filteredCategories}
              canManage={canManage}
              onSelectCategory={onSelectCategory}
              onEditCategory={onEditCategory}
              onDeleteCategory={onDeleteCategory}
            />
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
              {filteredCategories.map(card)}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

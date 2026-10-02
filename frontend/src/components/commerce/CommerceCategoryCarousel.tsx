import { Box, Card, CardContent, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import {
  ClearRounded, SearchRounded,
} from '@mui/icons-material'
import type { CommerceCategory } from '../../services/commerce'
import { CategoryCard } from './CategoryCard'
import { CircularCategoryCarousel } from './CircularCategoryCarousel'
import { useAdaptiveRow } from './useAdaptiveRow'
import { GRADIENT_TEXT_SX } from '../../theme/tokens'

interface Props {
  categories: CommerceCategory[]
  canManage: boolean
  searchQuery: string
  onSearchChange: (value: string) => void
  onSelectCategory: (category: CommerceCategory) => void
  onEditCategory: (category: CommerceCategory) => void
  onDeleteCategory: (category: CommerceCategory) => void
}

/** Ancho mínimo cómodo de una card antes de preferir el carrusel circular. */
const MIN_CARD_WIDTH = 208

export function CommerceCategoryCarousel({
  categories, canManage, searchQuery, onSearchChange,
  onSelectCategory, onEditCategory, onDeleteCategory,
}: Props) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredCategories = categories.filter(cat => cat.name.toLocaleLowerCase().includes(normalizedQuery))
  // Grid mientras la fila se lea cómoda; carrusel desde las cinco categorías o cuando el ancho no alcanza.
  const { containerRef, useCarousel } = useAdaptiveRow(filteredCategories.length, { minCardWidth: MIN_CARD_WIDTH })

  const card = (cat: CommerceCategory) => (
    <CategoryCard
      key={cat.id}
      category={cat}
      canManage={canManage}
      onSelect={onSelectCategory}
      onEditCategory={onEditCategory}
      onDeleteCategory={onDeleteCategory}
    />
  )

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box minWidth={0} sx={{ mb: 1.5 }}>
          <Typography variant="h2" sx={GRADIENT_TEXT_SX}>Categorías</Typography>
          <Typography variant="body2" color="text.secondary">Organizá tus productos y administrá su inventario.</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mb: 2.5 }}>
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
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.5, sm: 2 } }}>
              {filteredCategories.map(card)}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

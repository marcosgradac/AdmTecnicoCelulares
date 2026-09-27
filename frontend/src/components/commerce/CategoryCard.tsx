import { Box, Card, CardContent, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { DeleteOutlineRounded, EditRounded, Inventory2Rounded } from '@mui/icons-material'
import type { CommerceCategory } from '../../services/commerce'
import { RowActionsMenu } from '../common/RowActionsMenu'
import { CATEGORY_TONES, categoryIcon, categoryTone } from './categoryIcons'

interface Props {
  category: CommerceCategory
  canManage: boolean
  /** Solo presentación: resalta la card sin cambiar la navegación existente. */
  selected?: boolean
  onSelect: (category: CommerceCategory) => void
  onEditCategory: (category: CommerceCategory) => void
  onDeleteCategory: (category: CommerceCategory) => void
}

/** Borde hairline neutro: define la card sin agregar peso visual. */
const CARD_BORDER = '#E7E8F0'

/** El chip de productos cambia de tono según haya stock o no. */
const COUNT_TONES = {
  active: { background: '#E9F8F0', color: '#1F8E55', border: '#D2EFE0' },
  empty: { background: '#F1F2F6', color: '#687083', border: '#E5E7EF' },
} as const

/**
 * Card de categoría compartida por el grid y el carrusel.
 *
 * Es estrictamente presentacional: no guarda estado ni decide nada. Las wrappers
 * de grid y de carrusel siguen siendo las responsables del click, del menú y de
 * la navegación.
 */
export function CategoryCard({ category, canManage, selected = false, onSelect, onEditCategory, onDeleteCategory }: Props) {
  const Icon = categoryIcon(category.iconKey)
  const tone = CATEGORY_TONES[categoryTone(category.iconKey)]
  const count = category.productCount
  const countTone = count > 0 ? COUNT_TONES.active : COUNT_TONES.empty
  const countLabel = count === 0
    ? 'Sin productos'
    : `${count} ${count === 1 ? 'producto activo' : 'productos activos'}`

  return (
    <Card
      variant="outlined"
      onClick={() => onSelect(category)}
      sx={{
        width: '100%',
        minWidth: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        borderRadius: '15px',
        borderColor: selected ? 'primary.main' : CARD_BORDER,
        backgroundColor: selected ? '#F7F5FF' : 'background.paper',
        boxShadow: selected
          ? theme => `0 2px 6px ${alpha(theme.palette.primary.main, 0.06)}, 0 10px 24px ${alpha(theme.palette.primary.main, 0.10)}`
          : '0 1px 2px rgba(23,26,35,.04), 0 6px 18px rgba(32,25,74,.045)',
        transition: 'border-color .18s ease, box-shadow .18s ease, background-color .18s ease, transform .18s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: theme => alpha(theme.palette.primary.main, selected ? 0.9 : 0.38),
          backgroundColor: selected ? '#F7F5FF' : 'background.paper',
          boxShadow: theme => `0 2px 6px ${alpha(theme.palette.primary.main, 0.05)}, 0 14px 30px ${alpha(theme.palette.primary.main, 0.12)}`,
        },
      }}
    >
      <CardContent sx={{ p: '18px 16px 16px', '&:last-child': { pb: '16px' }, display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Box sx={{
            width: 48, height: 48, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '12px',
            backgroundColor: tone.background,
            border: `1px solid ${tone.border}`,
            color: tone.color,
            transition: 'transform .18s ease',
          }}>
            <Icon sx={{ fontSize: 25 }} />
          </Box>

          {canManage && (
            // stopPropagation: abrir el menú ⋮ NO debe abrir la categoría.
            <Box
              onClick={event => event.stopPropagation()}
              sx={{
                flexShrink: 0, mr: -1, mt: -1,
                opacity: { xs: 1, md: 0.5 },
                transition: 'opacity .15s ease',
                '&:hover, &:focus-within': { opacity: 1 },
                // Menú más discreto: gris neutral y hover circular suave.
                color: 'text.disabled',
                '& .MuiIconButton-root': { color: 'inherit' },
                '& .MuiIconButton-root::before': { borderRadius: '50%' },
                '& .MuiIconButton-root:hover::before': { backgroundColor: 'rgba(23,26,35,.06)' },
                '& .MuiIconButton-root.Mui-focusVisible::before': { backgroundColor: 'rgba(23,26,35,.09)' },
              }}
            >
              <RowActionsMenu label={`Acciones de categoría ${category.name}`} actions={[
                { label: 'Editar categoría', icon: <EditRounded />, onClick: () => onEditCategory(category) },
                { label: 'Eliminar', icon: <DeleteOutlineRounded />, destructive: true, onClick: () => onDeleteCategory(category) },
              ]} />
            </Box>
          )}
        </Stack>

        <Typography
          fontWeight={700}
          title={category.name}
          sx={{ mt: '14px', fontSize: '1.0625rem', lineHeight: 1.25, letterSpacing: '-.012em', color: 'text.primary', overflowWrap: 'anywhere' }}
        >
          {category.name}
        </Typography>

        {/* El chip va contra el fondo de la card: todas alinean y la altura se lee uniforme. */}
        <Box sx={{ mt: 'auto', pt: '12px', minWidth: 0 }}>
          <Box
            component="span"
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              maxWidth: '100%',
              px: '9px', py: '3px',
              borderRadius: '999px',
              border: `1px solid ${countTone.border}`,
              backgroundColor: countTone.background,
              color: countTone.color,
              fontSize: '.72rem', fontWeight: 700, lineHeight: 1.6,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            <Inventory2Rounded sx={{ fontSize: 13, flexShrink: 0 }} />
            {countLabel}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

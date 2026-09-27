import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { DeleteOutlineRounded } from '@mui/icons-material'
import type { CommerceCategory } from '../../services/commerce'

interface Props {
  category: CommerceCategory | null
  deleting: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
}

export function DeleteCategoryDialog({ category, deleting, error, onClose, onConfirm }: Props) {
  return (
    <Dialog open={Boolean(category)} onClose={deleting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Eliminar categoría</DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mt: 1 }}>
          ¿Querés eliminar la categoría <strong>{category?.name}</strong>?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          La categoría dejará de estar disponible junto con sus productos activos. El historial de ventas se conservará.
        </Typography>
        {category && category.productCount > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Contiene {category.productCount} {category.productCount === 1 ? 'producto activo' : 'productos activos'}: {category.productCount === 1 ? 'quedará' : 'quedarán'} inactivo{category.productCount === 1 ? '' : 's'} en el catálogo y en el punto de venta.
          </Typography>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={deleting}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={onConfirm}
          disabled={deleting}
          startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <DeleteOutlineRounded />}
        >
          {deleting ? 'Eliminando…' : 'Eliminar categoría'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

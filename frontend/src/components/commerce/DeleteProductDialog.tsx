import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { DeleteOutlineRounded } from '@mui/icons-material'
import type { CommerceProduct } from '../../services/commerce'

interface Props {
  product: CommerceProduct | null
  deleting: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
}

export function DeleteProductDialog({ product, deleting, error, onClose, onConfirm }: Props) {
  return (
    <Dialog open={Boolean(product)} onClose={deleting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Eliminar producto</DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mt: 1 }}>
          ¿Querés eliminar <strong>{product?.name}</strong> del catálogo?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          El producto dejará de estar disponible para nuevas ventas. Las ventas anteriores se conservarán.
        </Typography>
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
          {deleting ? 'Eliminando…' : 'Eliminar producto'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

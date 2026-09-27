import {
  Box, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { DeleteOutlineRounded, EditRounded, Inventory2Rounded } from '@mui/icons-material'
import type { CommerceProduct } from '../../services/commerce'
import { formatMoney } from '../../utils/format'
import { RecordCard, RecordField } from '../admin/AdminPatterns'
import { RowActionsMenu } from '../common/RowActionsMenu'

interface Props {
  products: CommerceProduct[]
  canManage: boolean
  onEdit: (product: CommerceProduct) => void
  onDelete: (product: CommerceProduct) => void
}

/** Umbral a partir del cual el stock se marca como bajo y no solo "hay". */
const LOW_STOCK = 3

/** Texto solo para lectores de pantalla. */
const SR_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' } as const

const stockState = (stock: number) => {
  if (stock <= 0) return { label: 'Sin stock', color: 'error' as const }
  if (stock <= LOW_STOCK) return { label: `${stock} en stock`, color: 'warning' as const }
  return { label: `${stock} en stock`, color: 'success' as const }
}

const profitColor = (profit: number) => profit < 0 ? 'error.main' : 'success.main'

/** Importe con jerarquía: el precio de venta manda, el costo acompaña. */
function Money({ value, emphasis }: { value: number; emphasis?: 'strong' | 'normal' }) {
  return <Typography
    variant="body2"
    fontWeight={emphasis === 'strong' ? 800 : 650}
    sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', lineHeight: 1.3 }}
  >{formatMoney(value)}</Typography>
}

function StockCell({ product }: { product: CommerceProduct }) {
  const state = stockState(product.currentStock)
  return <Chip
    size="small"
    icon={<Inventory2Rounded sx={{ fontSize: '15px !important' }} />}
    color={state.color}
    variant="outlined"
    label={state.label}
    sx={{ fontWeight: 650 }}
  />
}

/** Badge de ganancia: se lee de un vistazo y marca el rojo cuando se vende bajo costo. */
function ProfitCell({ product }: { product: CommerceProduct }) {
  const positive = product.unitProfit >= 0
  return <Box
    component="span"
    sx={{
      display: 'inline-block',
      px: 1,
      py: 0.35,
      borderRadius: 2,
      bgcolor: theme => alpha(positive ? theme.palette.success.main : theme.palette.error.main, 0.1),
    }}
  >
    <Typography variant="body2" fontWeight={800} color={profitColor(product.unitProfit)} sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      {formatMoney(product.unitProfit)}
    </Typography>
  </Box>
}

function RowMenu({ product, canManage, onEdit, onDelete }: { product: CommerceProduct; canManage: boolean } & Pick<Props, 'onEdit' | 'onDelete'>) {
  if (!canManage) return null
  return <RowActionsMenu label={`Acciones de ${product.name}`} actions={[
    { label: 'Editar', icon: <EditRounded />, onClick: () => onEdit(product) },
    { label: 'Eliminar', icon: <DeleteOutlineRounded />, destructive: true, onClick: () => onDelete(product) },
  ]} />
}

/**
 * Productos de una categoría en tabla, con la misma lectura del resto del admin.
 * En mobile no se fuerza una tabla imposible de leer: cada producto se muestra como
 * ficha apilada con los mismos datos, importes y acciones.
 */
export function CommerceProductsTable({ products, canManage, onEdit, onDelete }: Props) {
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'))

  if (mobile) return <Stack spacing={1.5}>{products.map(product => (
    <RecordCard
      key={product.id}
      title={product.name}
      subtitle={product.category}
      status={<StockCell product={product} />}
      actions={<RowMenu product={product} canManage={canManage} onEdit={onEdit} onDelete={onDelete} />}
    >
      <RecordField label="Precio de venta"><Money value={product.salePrice} emphasis="strong" /></RecordField>
      <RecordField label="Ganancia por unidad" color={profitColor(product.unitProfit)}>{formatMoney(product.unitProfit)}</RecordField>
      <RecordField label="Costo"><Money value={product.purchaseCost} /></RecordField>
      <RecordField label="Stock">{product.currentStock > 0 ? `${product.currentStock} unidades` : 'Sin unidades'}</RecordField>
    </RecordCard>
  ))}</Stack>

  return <TableContainer>
    <Table size="small" aria-label="Productos de la categoría" sx={{ tableLayout: 'fixed', minWidth: 700 }}>
      <TableHead>
        <TableRow sx={{ '& th': { fontWeight: 700, whiteSpace: 'nowrap' } }}>
          <TableCell sx={{ width: '30%' }}>Producto</TableCell>
          <TableCell sx={{ width: '16%' }}>Categoría</TableCell>
          <TableCell sx={{ width: '14%' }}>Stock</TableCell>
          <TableCell align="right" sx={{ width: '12%' }}>Costo</TableCell>
          <TableCell align="right" sx={{ width: '14%' }}>Precio de venta</TableCell>
          <TableCell align="right" sx={{ width: '13%' }}>Ganancia</TableCell>
          {/* Columna de acciones sin texto visible: el ícono ⋮ ya la identifica. */}
          <TableCell align="right" sx={{ width: 56 }}><Box component="span" sx={SR_ONLY}>Acciones</Box></TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {products.map(product => (
          <TableRow
            key={product.id}
            hover
            sx={{
              '& td': { overflowWrap: 'anywhere' },
              // El stock en cero tiene que saltar a la vista, no pasar desapercibido.
              ...(product.currentStock <= 0 && { bgcolor: theme => alpha(theme.palette.error.main, 0.045) }),
            }}
          >
            <TableCell><Typography variant="body2" fontWeight={700} title={product.name}>{product.name}</Typography></TableCell>
            <TableCell><Typography variant="body2" color="text.secondary" title={product.category}>{product.category}</Typography></TableCell>
            <TableCell><StockCell product={product} /></TableCell>
            <TableCell align="right"><Money value={product.purchaseCost} /></TableCell>
            <TableCell align="right"><Money value={product.salePrice} emphasis="strong" /></TableCell>
            <TableCell align="right"><ProfitCell product={product} /></TableCell>
            <TableCell align="right" sx={{ pr: 0.5 }}><Box sx={{ display: 'inline-flex' }}><RowMenu product={product} canManage={canManage} onEdit={onEdit} onDelete={onDelete} /></Box></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
}
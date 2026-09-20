import { EditRounded, SellRounded } from '@mui/icons-material'
import { Box, Card, CardContent, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery, useTheme } from '@mui/material'
import { RowActionsMenu } from '../../components/common/RowActionsMenu'
import type { ResaleDevice } from '../../services/equipmentSales'
import { formatMoney } from '../../utils/format'
import { paymentLabels, statusColors, statusLabels } from './equipmentPresentation'

export function EquipmentDeviceList({ devices, canManage, canSell, onEdit, onSell }: { devices: ResaleDevice[]; canManage: boolean; canSell: boolean; onEdit: (device: ResaleDevice) => void; onSell: (device: ResaleDevice) => void }) {
  const mobile = useMediaQuery(useTheme().breakpoints.down('lg'))
  const actions = (device: ResaleDevice) => device.status === 'SOLD' ? <Typography variant="caption" color="text.secondary">Venta registrada</Typography> : <RowActionsMenu label={`Acciones de ${device.brand} ${device.model}`} actions={[
    { label: 'Editar equipo', icon: <EditRounded />, disabled: !canManage, onClick: () => onEdit(device) },
    ...(device.status === 'READY_FOR_SALE' ? [{ label: 'Registrar venta', icon: <SellRounded />, disabled: !canSell, onClick: () => onSell(device) }] : []),
  ]} />
  const status = (device: ResaleDevice) => <Chip size="small" label={statusLabels[device.status]} color={statusColors[device.status]} />
  const saleDetail = (device: ResaleDevice) => device.soldAt && <Typography variant="caption" color="text.secondary">{new Date(device.soldAt).toLocaleString('es-AR')}{device.salePaymentMethod ? ` · ${paymentLabels[device.salePaymentMethod]}` : ''}</Typography>
  const values = (device: ResaleDevice) => [
    ['Compra', device.purchasePrice], ['Gastos', device.repairExpenses], ['Costo total', device.totalCost],
    [device.status === 'SOLD' ? 'Venta real' : 'Venta estimada', device.actualSalePrice ?? device.estimatedSalePrice],
    [device.status === 'SOLD' ? 'Ganancia real' : 'Ganancia estimada', device.realizedProfit ?? device.estimatedProfit],
  ] as const
  if (mobile) return <Stack spacing={1.5}>{devices.map(device => <Card key={device.id} variant="outlined"><CardContent>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}><Box sx={{ minWidth: 0 }}><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{device.brand} {device.model}</Typography>{saleDetail(device)}</Box>{actions(device)}</Stack>
    <Box my={1.5}>{status(device)}</Box>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>{values(device).map(([label, value]) => <Box key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={700} color={label.startsWith('Ganancia') ? value < 0 ? 'error.main' : 'success.main' : 'text.primary'}>{formatMoney(value)}</Typography></Box>)}</Box>
  </CardContent></Card>)}</Stack>
  return <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Equipo</TableCell><TableCell>Estado</TableCell><TableCell align="right">Compra</TableCell><TableCell align="right">Gastos</TableCell><TableCell align="right">Costo total</TableCell><TableCell align="right">Venta / estimada</TableCell><TableCell align="right">Ganancia / estimada</TableCell><TableCell align="right">Acciones</TableCell></TableRow></TableHead><TableBody>{devices.map(device => <TableRow key={device.id} hover>
    <TableCell sx={{ maxWidth: 220, overflowWrap: 'anywhere' }}><Typography fontWeight={800}>{device.brand} {device.model}</Typography>{saleDetail(device)}</TableCell><TableCell>{status(device)}</TableCell>
    {values(device).map(([label, value]) => <TableCell key={label} align="right" sx={{ whiteSpace: 'nowrap' }}><Typography variant="body2" fontWeight={label === 'Costo total' || label.startsWith('Ganancia') ? 700 : 400} color={label.startsWith('Ganancia') ? value < 0 ? 'error.main' : 'success.main' : 'text.primary'}>{formatMoney(value)}</Typography>{label.startsWith('Venta') && <Typography variant="caption" color="text.secondary">{device.status === 'SOLD' ? 'Real' : 'Estimada'}</Typography>}</TableCell>)}
    <TableCell align="right">{actions(device)}</TableCell>
  </TableRow>)}</TableBody></Table></TableContainer>
}

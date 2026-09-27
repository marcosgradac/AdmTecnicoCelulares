import { RecordCard, RecordField } from '../../components/admin/AdminPatterns'
import { BuildRounded, EditRounded, SellRounded } from '@mui/icons-material'
import { Box, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery, useTheme } from '@mui/material'
import { DeviceBrandAvatar } from '../../components/common/DeviceBrandAvatar'
import { RowActionsMenu } from '../../components/common/RowActionsMenu'
import type { ResaleDevice } from '../../services/equipmentSales'
import { formatMoney, formatShortDate, formatShortTime } from '../../utils/format'
import { paymentLabels, statusColors, statusLabels } from './equipmentPresentation'
import { TABLE_BORDER } from '../../theme/tokens'

/** Los equipos no vendidos no tienen fecha, hora ni medio de pago de venta. */
const NO_SALE = '—'

/** Columnas de dinero. Los vendidos muestran el valor real en lugar del estimado. */
function deviceValues(device: ResaleDevice) {
  const sold = device.status === 'SOLD'
  return [
    { label: 'Precio de compra', value: device.purchasePrice, strong: false as const, caption: '', color: 'error.dark' },
    { label: 'Gastos', value: device.repairExpenses, strong: false as const, caption: '', color: 'error.dark' },
    { label: 'Inversión total', value: device.totalCost, strong: true as const, caption: '', color: 'error.dark' },
    { label: sold ? 'Precio real de venta' : 'Precio estimado de venta', value: device.actualSalePrice ?? device.estimatedSalePrice, strong: false as const, caption: sold ? 'Real' : 'Estimado', color: 'success.dark' },
    { label: sold ? 'Ganancia real' : 'Ganancia estimada', value: device.realizedProfit ?? device.estimatedProfit, strong: true as const, caption: sold ? 'Real' : 'Estimado', color: (device.realizedProfit ?? device.estimatedProfit) < 0 ? 'error.dark' : 'success.dark' },
  ]
}

export function EquipmentDeviceList({ devices, canManage, canSell, onEdit, onSell, onChangeStatus }: { devices: ResaleDevice[]; canManage: boolean; canSell: boolean; onEdit: (device: ResaleDevice) => void; onSell: (device: ResaleDevice) => void; onChangeStatus: (device: ResaleDevice) => void }) {
  const mobile = useMediaQuery(useTheme().breakpoints.down('lg'))
  const actions = (device: ResaleDevice) => device.status === 'SOLD' ? <Typography variant="caption" color="text.secondary">Venta registrada</Typography> : <RowActionsMenu label={`Acciones de ${device.brand} ${device.model}`} actions={[
    { label: 'Editar equipo', icon: <EditRounded />, disabled: !canManage, onClick: () => onEdit(device) },
    { label: 'Cambiar estado', icon: <BuildRounded />, disabled: !canManage, onClick: () => onChangeStatus(device) },
    ...(device.status === 'READY_FOR_SALE' ? [{ label: 'Registrar venta', icon: <SellRounded />, disabled: !canSell, onClick: () => onSell(device) }] : []),
  ]} />
  const status = (device: ResaleDevice) => <Chip size="small" variant="outlined" label={statusLabels[device.status]} color={statusColors[device.status]} sx={{ bgcolor: 'transparent', borderColor: 'currentColor', color: statusColors[device.status] === 'default' ? 'text.secondary' : `${statusColors[device.status]}.dark` }} />
  /** Fecha, hora y medio de pago son de la venta. Sin venta, se muestra "—". */
  const sold = (device: ResaleDevice) => device.status === 'SOLD' && Boolean(device.soldAt)
  const saleDate = (device: ResaleDevice) => <Typography variant="body2" color={sold(device) ? 'text.secondary' : 'text.disabled'} sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{sold(device) ? formatShortDate(device.soldAt) : NO_SALE}</Typography>
  const saleTime = (device: ResaleDevice) => <Typography variant="body2" color={sold(device) ? 'text.secondary' : 'text.disabled'} sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{sold(device) ? formatShortTime(device.soldAt) : NO_SALE}</Typography>
  const saleMethod = (device: ResaleDevice) => <Typography variant="body2" color={sold(device) ? 'text.secondary' : 'text.disabled'} sx={{ whiteSpace: 'nowrap' }}>{sold(device) && device.salePaymentMethod ? paymentLabels[device.salePaymentMethod] : NO_SALE}</Typography>
  if (mobile) return <Stack spacing={1.5}>{devices.map(device => <RecordCard key={device.id} leading={<DeviceBrandAvatar brand={device.brand} />} title={device.brand} status={status(device)} actions={actions(device)} subtitle={device.model}>{deviceValues(device).map(column => <RecordField key={column.label} label={column.label} color={column.color}>{formatMoney(column.value)}</RecordField>)}<RecordField label="Fecha de venta">{formatShortDate(device.soldAt)}</RecordField><RecordField label="Hora de venta">{formatShortTime(device.soldAt)}</RecordField><RecordField label="Medio de pago">{device.salePaymentMethod ? paymentLabels[device.salePaymentMethod] : NO_SALE}</RecordField></RecordCard>)}</Stack>
  return <TableContainer><Table aria-label="Equipos para reventa" sx={{ minWidth: 1420, tableLayout: 'fixed', '& .MuiTableCell-root': { px: 1.5, py: 1.25, borderBottom: `1px solid ${TABLE_BORDER}` }, '& .MuiTableCell-head': { fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'text.secondary', lineHeight: 1.4, py: 1, background: 'transparent', whiteSpace: 'normal' } }}><TableHead><TableRow><TableCell sx={{ width: 190 }}>Equipo</TableCell><TableCell sx={{ width: 140 }}>Estado</TableCell><TableCell align="right" sx={{ width: 130 }}>Precio de compra</TableCell><TableCell align="right" sx={{ width: 118 }}>Gastos</TableCell><TableCell align="right" sx={{ width: 140 }}>Inversión total</TableCell><TableCell align="right" sx={{ width: 190 }}>Precio estimado / real de venta</TableCell><TableCell align="right" sx={{ width: 175 }}>Ganancia estimada / real</TableCell><TableCell sx={{ width: 120 }}>Fecha</TableCell><TableCell sx={{ width: 78 }}>Hora</TableCell><TableCell sx={{ width: 150 }}>Medio de pago</TableCell><TableCell align="right" sx={{ width: 110 }}>Acciones</TableCell></TableRow></TableHead><TableBody>{devices.map(device => <TableRow key={device.id} hover>
    <TableCell><Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}><DeviceBrandAvatar brand={device.brand} size={36} /><Box minWidth={0}><Typography variant="body2" fontWeight={750} noWrap>{device.brand}</Typography><Typography variant="body2" color="text.secondary" noWrap>{device.model}</Typography></Box></Stack></TableCell><TableCell>{status(device)}</TableCell>
    {deviceValues(device).map(column => <TableCell key={column.label} align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}><Typography variant="body2" fontWeight={column.strong ? 700 : 400} color={column.color}>{formatMoney(column.value)}</Typography>{column.caption && <Typography variant="caption" color="text.secondary">{column.caption}</Typography>}</TableCell>)}
    <TableCell>{saleDate(device)}</TableCell><TableCell>{saleTime(device)}</TableCell><TableCell>{saleMethod(device)}</TableCell>
    <TableCell align="right">{actions(device)}</TableCell>
  </TableRow>)}</TableBody></Table></TableContainer>
}

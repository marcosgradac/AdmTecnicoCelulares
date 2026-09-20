import { Box, Stack, Typography } from '@mui/material'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { repairStatusConfig } from '../../config/repairStatus'
import type { DashboardOverview, DashboardOrigin } from '../../services/dashboard'
import { formatMoney } from '../../utils/format'
import { UiState } from '../common/UiState'

type Charts = NonNullable<DashboardOverview['charts']>
export const originLabels: Record<DashboardOrigin, string> = { REPAIR: 'Reparaciones', COMMERCE: 'Comercio', EQUIPMENT: 'Equipos', GENERAL: 'General' }
const originColors: Record<DashboardOrigin, string> = { REPAIR: '#5B3FD6', COMMERCE: '#2879C2', EQUIPMENT: '#1F9254', GENERAL: '#A66B00' }
const compactMoney = (value: number) => '$' + new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const tooltipStyle = { border: '1px solid #E8EAF3', borderRadius: 12, fontSize: 13 }

export function FinancialChart({ data }: { data: Charts['cashFlow'] }) {
  if (!data.some(point => point.income || point.expense)) return <UiState title="Todavía no hay movimientos en este período" description="Los ingresos y egresos registrados en Caja aparecerán acá." />
  return <Box aria-label="Ingresos y egresos por fecha" sx={{ width: '100%', minWidth: 0, height: { xs: 240, sm: 290 } }}>
    <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 12, right: 0, left: -12, bottom: 0 }} accessibilityLayer>
      <CartesianGrid stroke="#EEF0F6" vertical={false} /><XAxis dataKey="label" minTickGap={26} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} /><YAxis tickFormatter={compactMoney} width={66} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
      <Tooltip formatter={value => formatMoney(Number(value))} contentStyle={tooltipStyle} cursor={{ fill: '#F7F8FC' }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
      <Bar name="Ingresos" dataKey="income" fill="#5B3FD6" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} /><Bar name="Egresos" dataKey="expense" fill="#2F9BFF" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
    </BarChart></ResponsiveContainer>
  </Box>
}

export function RepairStatusChart({ data }: { data: Charts['byStatus'] }) {
  const rows = data.filter(row => row.value > 0 && repairStatusConfig[row.status]).map(row => ({ ...row, label: repairStatusConfig[row.status].label }))
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  if (!total) return <UiState title="Sin reparaciones registradas" description="La distribución se completa con los ingresos del taller." />
  return <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems="center">
    <Box sx={{ width: 190, height: 190, position: 'relative', flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%"><PieChart accessibilityLayer><Pie data={rows} dataKey="value" nameKey="label" innerRadius={60} outerRadius={86} stroke="none" paddingAngle={2} isAnimationActive={false}>{rows.map(row => <Cell key={row.status} fill={repairStatusConfig[row.status].color} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer>
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center', pointerEvents: 'none' }}><Typography variant="h2">{total}</Typography><Typography variant="caption" color="text.secondary">registros</Typography></Box>
    </Box>
    <Stack component="ul" gap={1} sx={{ flex: 1, m: 0, p: 0, listStyle: 'none', minWidth: 0, width: '100%' }}>{rows.map(row => <Stack component="li" key={row.status} direction="row" alignItems="center" gap={1}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: repairStatusConfig[row.status].color, flexShrink: 0 }} /><Typography variant="caption" sx={{ flex: 1 }}>{row.label}</Typography><Typography variant="body2" fontWeight={700}>{row.value}</Typography></Stack>)}</Stack>
  </Stack>
}

export function IncomeAreaChart({ data }: { data: Charts['incomeByArea'] }) {
  const rows = data.map(row => ({ ...row, label: originLabels[row.origin] }))
  return <Box><Box sx={{ height: 220, width: '100%', minWidth: 0 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} layout="vertical" margin={{ left: 0, right: 10, bottom: 0 }} accessibilityLayer>
    <CartesianGrid horizontal={false} stroke="#EEF0F6" /><XAxis type="number" tickFormatter={compactMoney} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={value => [formatMoney(Number(value)), 'Ingresos']} contentStyle={tooltipStyle} cursor={{ fill: '#F7F8FC' }} /><Bar dataKey="value" maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive={false}>{rows.map(row => <Cell key={row.origin} fill={originColors[row.origin]} />)}</Bar>
  </BarChart></ResponsiveContainer></Box><Typography variant="caption" color="text.secondary">Ingresos de Caja por origen. Incluye ajustes compensatorios; no equivale a ganancia.</Typography></Box>
}

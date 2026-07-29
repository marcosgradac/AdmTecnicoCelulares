import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Box, Stack, Typography } from '@mui/material'
import type { RepairStatus } from '../../types'
import { repairStatusConfig } from '../../config/repairStatus'

export function RepairsByStatusChart({ data }: { data: { status: RepairStatus; value: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  if (!total) return null
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" justifyContent="center" gap={2}>
      <Box position="relative" width={190} height={190}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart><Pie data={data} dataKey="value" nameKey="status" innerRadius={62} outerRadius={86} paddingAngle={3} stroke="none">{data.map(item => <Cell key={item.status} fill={repairStatusConfig[item.status].color} />)}</Pie><Tooltip formatter={(value, _name, item) => [value, repairStatusConfig[item.payload.status as RepairStatus].label]} /></PieChart>
        </ResponsiveContainer>
        <Box position="absolute" display="grid" sx={{ inset: 0, placeItems: 'center', pointerEvents: 'none' }}><Box textAlign="center"><Typography variant="h5">{total}</Typography><Typography variant="caption" color="text.secondary">Total</Typography></Box></Box>
      </Box>
      <Stack spacing={1} minWidth={170}>{data.map(item => <Stack direction="row" alignItems="center" gap={1} key={item.status}><Box width={9} height={9} borderRadius="50%" bgcolor={repairStatusConfig[item.status].color}/><Typography variant="body2" flex={1}>{repairStatusConfig[item.status].label}</Typography><Typography variant="body2" fontWeight={800}>{item.value}</Typography></Stack>)}</Stack>
    </Stack>
  )
}

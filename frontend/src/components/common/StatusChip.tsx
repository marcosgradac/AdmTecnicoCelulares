import { Chip } from '@mui/material'
import type { RepairStatus } from '../../types'
import { repairStatusConfig } from '../../config/repairStatus'

export function StatusChip({ status }: { status: RepairStatus }) {
  const config = repairStatusConfig[status]
  const Icon = config.icon
  return <Chip size="small" icon={<Icon />} label={config.label} sx={{ color: config.color, bgcolor: config.background, border: `1px solid ${config.color}22`, '& .MuiChip-icon': { color: config.color } }} />
}


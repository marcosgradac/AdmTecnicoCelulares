import { Chip } from '@mui/material'
import { workflowRepairStatus } from '../../config/workflowRepairStatus'
import type { WorkflowRepairStatus } from '../../types/repair.types'

export function RepairStatusChip({ status }: { status: WorkflowRepairStatus }) {
  const config = workflowRepairStatus[status]
  const Icon = config.icon
  return <Chip size="small" icon={<Icon />} label={config.label} sx={{
    color: config.color, bgcolor: config.background, border: `1px solid ${config.color}22`,
    '& .MuiChip-icon': { color: config.color },
  }} />
}

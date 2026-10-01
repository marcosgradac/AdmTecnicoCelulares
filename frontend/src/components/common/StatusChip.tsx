import { Chip } from '@mui/material'
import type { RepairStatus } from '../../types'
import { canonicalStatusConfig, isLegacyStatus } from '../../config/repairStatus'

/**
 * Un estado histórico (BUDGET, APPROVED, TESTING) se muestra como el paso del flujo al que
 * equivale, para que el equipo nunca vea un paso que ya no existe en el flujo nuevo.
 */
export function StatusChip({ status }: { status: RepairStatus }) {
  const config = canonicalStatusConfig(status)
  const Icon = config.icon
  return <Chip size="small" icon={<Icon />} label={config.label} title={isLegacyStatus(status) ? `Registro histórico: ${config.label}` : undefined} sx={{ color: config.color, bgcolor: config.background, border: `1px solid ${config.color}22`, '& .MuiChip-icon': { color: config.color } }} />
}


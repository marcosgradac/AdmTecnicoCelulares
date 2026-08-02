import { Button, MenuItem, Stack, TextField } from '@mui/material'
import type { ReportFilters } from '../reports.api'
import type { ReportPeriodKey } from '../types'

const options: Array<{ value: ReportPeriodKey; label: string }> = [
  { value: 'today', label: 'Hoy' }, { value: 'last_7_days', label: 'Últimos 7 días' },
  { value: 'this_month', label: 'Este mes' }, { value: 'previous_month', label: 'Mes anterior' },
  { value: 'last_3_months', label: 'Últimos 3 meses' }, { value: 'this_year', label: 'Este año' },
  { value: 'custom', label: 'Personalizado' },
]

export function PeriodSelector({ draft, applied, onDraftChange, onApply }: { draft: ReportFilters; applied: ReportFilters; onDraftChange: (value: ReportFilters) => void; onApply: () => void }) {
  const customInvalid = draft.period === 'custom' && (!draft.from || !draft.to || draft.from > draft.to)
  return <Stack className="reports-period" direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
    <TextField select size="small" label="Período" value={draft.period} onChange={event => onDraftChange({ period: event.target.value as ReportPeriodKey })}>
      {options.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
    </TextField>
    {draft.period === 'custom' && <><TextField size="small" type="date" label="Desde" slotProps={{ inputLabel: { shrink: true } }} value={draft.from ?? ''} onChange={event => onDraftChange({ ...draft, from: event.target.value })}/><TextField size="small" type="date" label="Hasta" slotProps={{ inputLabel: { shrink: true } }} value={draft.to ?? ''} onChange={event => onDraftChange({ ...draft, to: event.target.value })}/></>}
    <Button variant="contained" disabled={customInvalid || JSON.stringify(draft) === JSON.stringify(applied)} onClick={onApply}>Aplicar</Button>
  </Stack>
}

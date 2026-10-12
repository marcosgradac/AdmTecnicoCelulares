import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material'
import axios from 'axios'
import { repairStatusConfig, repairStatuses } from '../../config/repairStatus'
import { updateRepairStatus } from '../../services/repairs'
import type { Repair, RepairStatus } from '../../types'

export function RepairStatusDialog({ repair, onClose, onUpdated }: { repair?: Repair; onClose: () => void; onUpdated: (repair: Repair) => void }) {
  const [status, setStatus] = useState<RepairStatus>('received'), [saving, setSaving] = useState(false), [error, setError] = useState('')
  useEffect(() => { if (repair) { setStatus(repair.status); setError('') } }, [repair])
  const save = async () => { if (!repair || status === repair.status) return; setSaving(true); setError(''); try { onUpdated(await updateRepairStatus(repair.id, status)) } catch (cause) { setError(axios.isAxiosError<{message?:string}>(cause) ? cause.response?.data?.message ?? 'No pudimos actualizar el estado.' : 'No pudimos actualizar el estado.') } finally { setSaving(false) } }
  return <Dialog open={Boolean(repair)} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs"><DialogTitle>Cambiar estado</DialogTitle><DialogContent><Stack spacing={2} mt={1}>{error && <Alert severity="error">{error}</Alert>}<TextField select fullWidth label="Nuevo estado" value={status} onChange={event => setStatus(event.target.value as RepairStatus)}>{repairStatuses.map(value => <MenuItem key={value} value={value}>{repairStatusConfig[value].label}</MenuItem>)}</TextField></Stack></DialogContent><DialogActions><Button onClick={onClose} disabled={saving}>Cancelar</Button><Button variant="contained" onClick={() => void save()} disabled={saving || !repair || status === repair.status}>{saving ? 'Actualizando…' : 'Actualizar estado'}</Button></DialogActions></Dialog>
}

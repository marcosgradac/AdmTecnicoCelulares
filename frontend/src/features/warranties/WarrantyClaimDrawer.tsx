import { Alert, TextField } from '@mui/material'
import { useState } from 'react'
import { FormDrawer } from '../../components/common/FormDrawer'
import { createWarrantyClaim, type WarrantyClaim } from './warranties.api'

export function WarrantyClaimDrawer({ open, repairId, onClose, onCreated }: { open: boolean; repairId?: string; onClose: () => void; onCreated: (claim: WarrantyClaim) => void }) {
  const [description, setDescription] = useState(''), [saving, setSaving] = useState(false), [error, setError] = useState('')
  const save = async () => { if (!repairId) return; setSaving(true); setError(''); try { const claim = await createWarrantyClaim(repairId, description.trim()); setDescription(''); onCreated(claim) } catch { setError('No pudimos registrar el reclamo. Verificá que la garantía esté activa.') } finally { setSaving(false) } }
  return <FormDrawer open={open} eyebrow="GARANTÍAS" title="Nuevo reclamo" saving={saving} submitLabel="Registrar reclamo" submitDisabled={!repairId || description.trim().length < 5} onClose={onClose} onSubmit={() => void save()}>{error && <Alert severity="error">{error}</Alert>}<TextField multiline minRows={6} label="Descripción del problema" required value={description} onChange={event => setDescription(event.target.value)} helperText="Indicá qué falla reapareció y en qué condiciones."/></FormDrawer>
}

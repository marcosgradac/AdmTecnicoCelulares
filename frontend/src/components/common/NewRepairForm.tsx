import React from 'react'
import { Stack, TextField, MenuItem } from '@mui/material'
import { AppButton } from './AppButton'
import { SaveRounded } from '@mui/icons-material'
import { CurrencyField } from './CurrencyField'

type Values = {
  clientName: string
  phone: string
  brand: string
  model: string
  imei: string
  issue: string
  observations: string
  total: number
}

export default function NewRepairForm({ values, onChange, onSave }: { values: Values; onChange: (key: string) => (e: any) => void; onSave: () => void }) {
  return (
    <Stack spacing={2}>
      <TextField size="small" fullWidth label="Nombre del cliente" value={values.clientName} onChange={onChange('clientName')} />
      <TextField size="small" fullWidth label="WhatsApp / teléfono" value={values.phone} onChange={onChange('phone')} />
      <TextField size="small" fullWidth select label="Marca" value={values.brand} onChange={onChange('brand')}>
        <MenuItem value="Apple">Apple</MenuItem>
        <MenuItem value="Samsung">Samsung</MenuItem>
        <MenuItem value="Motorola">Motorola</MenuItem>
        <MenuItem value="Xiaomi">Xiaomi</MenuItem>
      </TextField>
      <TextField size="small" fullWidth label="Modelo" placeholder="Ej. iPhone 13 Pro" value={values.model} onChange={onChange('model')} />
      <TextField size="small" fullWidth label="IMEI" value={values.imei} onChange={onChange('imei')} />
      <CurrencyField size="small" label="Monto" value={values.total} onValueChange={(value) => onChange('total')({ target: { value } })} />
      <TextField size="small" fullWidth multiline minRows={3} label="Falla" value={values.issue} onChange={onChange('issue')} />
      <TextField size="small" fullWidth multiline minRows={3} label="Observaciones" value={values.observations} onChange={onChange('observations')} />
      <AppButton fullWidth variant="contained" startIcon={<SaveRounded />} onClick={onSave} sx={{ background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)', boxShadow: '0 8px 24px rgba(124, 58, 237, 0.3)' }}>Guardar reparación</AppButton>
    </Stack>
  )
}

import React from 'react'
import { Box, Card, CardContent, Typography } from '@mui/material'
import BuildRounded from '@mui/icons-material/BuildRounded'
import NewRepairForm from './NewRepairForm'

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

export default function NewRepairCard({ values, onChange, onSave }: { values: Values; onChange: (key: string) => (e: any) => void; onSave: () => void }) {
  return (
    <Card
      sx={{
        border: '1px solid rgba(124, 58, 237, 0.08)',
        borderRadius: 3,
        overflow: 'visible',
        maxWidth: 420,
        mx: 'auto',
        transition: 'transform 240ms ease, box-shadow 240ms ease',
        boxShadow: '0 8px 24px rgba(15,23,42,0.06)'
      }}
    >
      <CardContent sx={{ pt: 0, pb: 2 }}>
        <Box sx={{
          background: 'linear-gradient(90deg,#7C3AED 0%, #A855F7 100%)',
          borderRadius: '12px',
          color: '#fff',
          px: 2,
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          transform: 'translateY(-20px)',
          boxShadow: '0 8px 24px rgba(124,58,237,0.12)'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: '8px', width: 36, height: 36 }}>
            <BuildRounded sx={{ color: '#fff', fontSize: 20 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Registrar reparación</Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>Rápido y seguro</Typography>
          </Box>
        </Box>
        <Box sx={{ maxWidth: 360, width: '100%', mx: 'auto', mt: -1 }}>
          <NewRepairForm values={values} onChange={onChange} onSave={onSave} />
        </Box>
      </CardContent>
    </Card>
  )
}

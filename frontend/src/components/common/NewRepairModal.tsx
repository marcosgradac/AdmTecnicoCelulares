import React from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, Stack, Button } from '@mui/material'
import DonutChart from './DonutChart'
import type { Repair } from '../../types'

export function NewRepairModal({ open, onClose, onConfirm, values, breakdown }: { open: boolean; onClose: () => void; onConfirm: () => void; values: Partial<Repair>; breakdown: { label: string; value: number; color: string }[] }) {
  const total = values?.total ?? breakdown.reduce((s, b) => s + b.value, 0)
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { border: '1px solid rgba(124, 58, 237, 0.08)', borderRadius: 3, boxShadow: '0 20px 50px rgba(124,58,237,0.08)' } }}>
      <DialogTitle>Resumen de la reparación</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={2} alignItems="center">
          <DonutChart data={breakdown} size={140} inner={64} centerText={<div style={{ fontWeight: 800 }}>{breakdown.reduce((s, b) => s + b.value, 0)}</div>} />
          <div>
            <Typography variant="subtitle1" fontWeight={800}>{values?.device || '—'}</Typography>
            <Typography color="text.secondary">{values?.clientName || '—'}</Typography>
            <Typography color="text.secondary" mt={1}>Falla: {values?.issue || '—'}</Typography>
            <Typography variant="h6" fontWeight={900} mt={2}>Monto: ${total}</Typography>
          </div>
        </Stack>
        <Typography mt={2} color="text.secondary">Este modal muestra una vista previa con un gráfico del estado actual de las reparaciones y el resumen del equipo. Confirmá para crear la reparación.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={onConfirm} sx={{ background: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)', color: 'white' }}>Confirmar</Button>
      </DialogActions>
    </Dialog>
  )
}

export default NewRepairModal

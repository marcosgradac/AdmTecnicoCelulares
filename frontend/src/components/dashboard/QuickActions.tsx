import { AddRounded, PaymentsRounded, PersonAddRounded } from '@mui/icons-material'
import { Button } from '@mui/material'
import { useNavigate } from 'react-router-dom'

export function QuickActions() {
  const navigate = useNavigate()
  return <div className="quick-actions">
    <Button variant="contained" startIcon={<AddRounded />} onClick={() => navigate('/admin/reparaciones?new=1')}>Nueva reparación</Button>
    <Button variant="outlined" startIcon={<PaymentsRounded />} onClick={() => navigate('/caja')}>Registrar pago</Button>
    <Button variant="outlined" startIcon={<PersonAddRounded />} onClick={() => navigate('/clientes')}>Agregar cliente</Button>
  </div>
}

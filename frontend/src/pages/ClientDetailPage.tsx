import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Button, Card, CardContent, Grid, Stack, Typography } from '@mui/material'
import { AddRounded, ArrowBackRounded, ArrowForwardRounded, DevicesRounded, PaymentsRounded, ReceiptLongRounded, WalletRounded } from '@mui/icons-material'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard } from '../components/common/StatCard'
import { StatusChip } from '../components/common/StatusChip'
import { UiState } from '../components/common/UiState'
import { getClient, type ClientRecord } from '../services/operations'
import { formatDate, formatMoney } from '../utils/format'
import type { RepairStatus } from '../types'

const apiStatus: Record<string, RepairStatus> = { RECEIVED: 'received', REVIEW: 'review', BUDGET: 'budget', APPROVED: 'approved', REPAIRING: 'repairing', TESTING: 'testing', READY: 'ready', DELIVERED: 'delivered' }

export function ClientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState<ClientRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    if (!id) return
    setLoading(true); setError(false)
    try { setClient(await getClient(id)) } catch { setError(true) } finally { setLoading(false) }
  }, [id])
  useEffect(() => { void load() }, [load])
  if (loading) return <Card><UiState loading/></Card>
  if (error || !client) return <Card><UiState title="Cliente no encontrado" description="No pudimos cargar los datos del cliente." action={() => void load()}/></Card>
  const totalPaid = client.repairs.reduce((sum, repair) => sum + repair.paid, 0)
  const pending = client.repairs.reduce((sum, repair) => sum + Math.max(0, repair.total - repair.paid), 0)
  const devices = new Set(client.repairs.map(repair => `${repair.deviceBrand} ${repair.deviceModel}`))
  const newest = client.repairs[0]?.createdAt
  const newRepairUrl = `/reparaciones/nueva?clientId=${encodeURIComponent(client.id)}&clientName=${encodeURIComponent(client.name)}&phone=${encodeURIComponent(client.phone ?? '')}`
  return <Box>
    <Button startIcon={<ArrowBackRounded/>} onClick={() => navigate('/clientes')} sx={{ mb: 1 }}>Volver</Button>
    <PageHeader eyebrow="DETALLE DE CLIENTE" title={client.name} description={`${client.phone || 'Sin teléfono'} · Cliente desde ${formatDate(client.createdAt)}`} action={<Button variant="contained" startIcon={<AddRounded/>} onClick={() => navigate(newRepairUrl)}>Nueva reparación para este cliente</Button>}/>
    <Grid container spacing={1.5} mb={2.2}><Grid size={{ xs: 6, md: 3 }}><StatCard label="Reparaciones" value={String(client.repairs.length)} icon={<ReceiptLongRounded/>}/></Grid><Grid size={{ xs: 6, md: 3 }}><StatCard label="Total pagado" value={formatMoney(totalPaid)} icon={<PaymentsRounded/>} tone="success"/></Grid><Grid size={{ xs: 6, md: 3 }}><StatCard label="Saldo pendiente" value={formatMoney(pending)} icon={<WalletRounded/>} tone="warning"/></Grid><Grid size={{ xs: 6, md: 3 }}><StatCard label="Equipos asociados" value={String(devices.size)} icon={<DevicesRounded/>} tone="info"/></Grid></Grid>
    <Grid container spacing={2.2}><Grid size={{ xs: 12, lg: 4 }}><Card><CardContent><Typography variant="h2">Datos del cliente</Typography><Stack spacing={1.5} mt={2}><Info label="Nombre" value={client.name}/><Info label="Teléfono" value={client.phone || 'No informado'}/><Info label="Email" value="No disponible en el modelo actual"/><Info label="Fecha de alta" value={formatDate(client.createdAt)}/><Info label="Última visita" value={newest ? formatDate(newest) : 'Sin visitas'}/><Info label="Equipos" value={devices.size ? Array.from(devices).join(', ') : 'Sin equipos asociados'}/></Stack></CardContent></Card></Grid>
      <Grid size={{ xs: 12, lg: 8 }}><Card><CardContent><Typography variant="h2">Historial de reparaciones</Typography><Typography variant="body2" color="text.secondary" mb={2}>Todos los equipos asociados a este cliente</Typography>{client.repairs.length ? <Stack divider={<Box borderTop="1px solid" borderColor="divider"/>}>{client.repairs.map(repair => <Stack key={repair.id} direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={2} py={1.7}><Box flex={1}><Typography fontWeight={750}>#{repair.number} · {repair.deviceBrand} {repair.deviceModel}</Typography><Typography variant="body2" color="text.secondary">{repair.issue} · {formatDate(repair.createdAt)}</Typography></Box><StatusChip status={apiStatus[repair.status] ?? 'received'}/><Box minWidth={105}><Typography variant="caption" color="text.secondary">Total / pagado</Typography><Typography fontWeight={700}>{formatMoney(repair.total)} / {formatMoney(repair.paid)}</Typography><Typography variant="caption" color={repair.total - repair.paid > 0 ? 'error.main' : 'success.main'}>Saldo {formatMoney(Math.max(0, repair.total - repair.paid))}</Typography></Box><Button endIcon={<ArrowForwardRounded/>} onClick={() => navigate(`/reparaciones/${repair.id}`)}>Abrir</Button></Stack>)}</Stack> : <UiState title="Sin reparaciones registradas"/>}</CardContent></Card></Grid>
    </Grid>
  </Box>
}
function Info({ label, value }: { label: string; value: string }) { return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={700}>{value}</Typography></Box> }

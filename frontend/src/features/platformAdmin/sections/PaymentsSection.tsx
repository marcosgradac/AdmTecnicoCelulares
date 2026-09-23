import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Box, Button, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Typography, useMediaQuery, useTheme } from '@mui/material'
import { RecordCard, RecordField } from '../../../components/admin/AdminPatterns'
import { TableSkeleton } from '../../../components/common/TableSkeleton'
import { formatARS, formatDate } from '../../billing/billing.utils'
import { approveAdminPayment, getAdminPayments, rejectAdminPayment, type AdminPayment, type PaymentStatus } from '../platformAdmin.api'
import { usePlatformAction, usePlatformResource } from '../platformAdmin.hooks'
import { PaymentStatusChip, PlatformEmpty, PlatformError, PlatformLoading, RefreshingBar } from '../platformAdmin.shared'
import { ConfirmDialog, RejectPaymentDialog } from '../platformAdmin.dialogs'

const tabs: Array<[PaymentStatus, string]> = [['PENDING', 'Pendientes'], ['APPROVED', 'Aprobados'], ['REJECTED', 'Rechazados']]
const emptyCopy: Record<PaymentStatus, { title: string; description: string }> = {
  PENDING: { title: 'No hay pagos pendientes', description: 'Cuando un negocio informe una transferencia, la vas a ver acá para aprobarla o rechazarla.' },
  APPROVED: { title: 'Todavía no hay pagos aprobados', description: 'Los pagos que apruebes van a quedar registrados en esta solapa.' },
  REJECTED: { title: 'Todavía no hay pagos rechazados', description: 'Los pagos que rechaces van a quedar registrados en esta solapa con su motivo.' },
}

function PaymentTable({ rows, loading, onApprove, onReject }: { rows: AdminPayment[]; loading: boolean; onApprove: (payment: AdminPayment) => void; onReject: (payment: AdminPayment) => void }) {
  return <TableContainer>
    <Table size="small" sx={{ minWidth: 900 }}>
      <TableHead><TableRow>
        <TableCell>Negocio</TableCell><TableCell>Plan</TableCell><TableCell>Monto esperado</TableCell><TableCell>Monto informado</TableCell><TableCell>Fecha</TableCell><TableCell>Estado</TableCell><TableCell align="right">Acciones</TableCell>
      </TableRow></TableHead>
      <TableBody>
        {loading ? <TableSkeleton columns={7} /> : rows.map(payment => <TableRow key={payment.id} hover>
          <TableCell><Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{payment.business?.name ?? 'Negocio'}</Typography><Typography variant="caption" color="text.secondary">{payment.payerName}</Typography></TableCell>
          <TableCell>{payment.plan?.name ?? payment.planCode}</TableCell>
          <TableCell>{formatARS(payment.expectedAmount)}</TableCell>
          <TableCell><Typography fontWeight={700}>{formatARS(payment.reportedAmount)}</Typography>{payment.reference && <Typography variant="caption" color="text.secondary">Ref. {payment.reference}</Typography>}</TableCell>
          <TableCell>{formatDate(payment.transferDate)}<Typography variant="caption" color="text.secondary" display="block">Informado el {formatDate(payment.createdAt)}</Typography></TableCell>
          <TableCell><PaymentStatusChip status={payment.status} />{payment.rejectionReason && <Typography variant="caption" color="text.secondary" display="block" sx={{ overflowWrap: 'anywhere' }}>{payment.rejectionReason}</Typography>}</TableCell>
          <TableCell align="right">{payment.status === 'PENDING' && <Stack direction="row" gap={1} justifyContent="flex-end"><Button size="small" color="error" onClick={() => onReject(payment)}>Rechazar</Button><Button size="small" variant="contained" onClick={() => onApprove(payment)}>Aprobar</Button></Stack>}</TableCell>
        </TableRow>)}
      </TableBody>
    </Table>
  </TableContainer>
}

function PaymentCard({ payment, actions }: { payment: AdminPayment; actions: ReactNode }) {
  return <RecordCard title={payment.business?.name ?? 'Negocio'} subtitle={`${payment.plan?.name ?? payment.planCode} · ${payment.payerName}`} status={<PaymentStatusChip status={payment.status} />} actions={actions}>
    <RecordField label="Monto esperado">{formatARS(payment.expectedAmount)}</RecordField>
    <RecordField label="Monto informado">{formatARS(payment.reportedAmount)}</RecordField>
    <RecordField label="Fecha de transferencia">{formatDate(payment.transferDate)}</RecordField>
    <RecordField label="Informado el">{formatDate(payment.createdAt)}</RecordField>
    {payment.reference && <RecordField label="Referencia">{payment.reference}</RecordField>}
    {payment.rejectionReason && <RecordField label="Motivo del rechazo" color="error.main">{payment.rejectionReason}</RecordField>}
    {payment.notes && <RecordField label="Observación">{payment.notes}</RecordField>}
  </RecordCard>
}

export function PaymentsSection({ refreshToken, onDataChanged }: { refreshToken: number; onDataChanged: () => void }) {
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const [tab, setTab] = useState<PaymentStatus>('PENDING')
  const [approving, setApproving] = useState<AdminPayment | null>(null)
  const [rejecting, setRejecting] = useState<AdminPayment | null>(null)
  const list = usePlatformResource(() => getAdminPayments(tab), `payments:${tab}:${refreshToken}`)
  const action = usePlatformAction()
  const rows = list.data ?? []
  useEffect(() => { action.clear() }, [tab, action.clear])
  const runApprove = async () => {
    if (!approving) return
    const done = await action.run(() => approveAdminPayment(approving.id), 'Pago aprobado. La suscripción del negocio quedó activa.')
    if (done) { setApproving(null); list.reload(); onDataChanged() }
  }
  const runReject = async (reason: string) => {
    if (!rejecting) return
    const done = await action.run(() => rejectAdminPayment(rejecting.id, reason), 'Pago rechazado. El negocio puede informar uno nuevo.')
    if (done) { setRejecting(null); list.reload(); onDataChanged() }
  }
  return <Stack spacing={2.5}>
    {action.message && <Alert severity="success" onClose={action.clear}>{action.message}</Alert>}
    <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
      <Tabs value={tab} onChange={(_, value) => setTab(value as PaymentStatus)} variant="scrollable" allowScrollButtonsMobile>
        {tabs.map(([value, label]) => <Tab key={value} value={value} label={label} />)}
      </Tabs>
    </Box>
    {list.loading && !list.data ? <PlatformLoading label="Cargando pagos…" />
      : list.error ? <PlatformError message={list.error} onRetry={list.reload} />
        : <Stack spacing={2}>
          {list.loading && <RefreshingBar />}
          {rows.length === 0
            ? <PlatformEmpty title={emptyCopy[tab].title} description={emptyCopy[tab].description} />
            : mobile
              ? <Stack spacing={1.5}>{rows.map(payment => <PaymentCard key={payment.id} payment={payment} actions={payment.status === 'PENDING' ? <Stack direction="row" gap={1}><Button size="small" color="error" onClick={() => setRejecting(payment)}>Rechazar</Button><Button size="small" variant="contained" onClick={() => setApproving(payment)}>Aprobar</Button></Stack> : undefined} />)}</Stack>
              : <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper', overflow: 'hidden' }}><PaymentTable rows={rows} loading={list.loading} onApprove={setApproving} onReject={setRejecting} /></Box>}
        </Stack>}
    <ConfirmDialog open={Boolean(approving)} title="Aprobar pago" confirmLabel="Aprobar pago" saving={action.saving} error={action.error} onClose={() => { setApproving(null); action.clear() }} onConfirm={() => void runApprove()}
      description={approving ? <>Se activa el plan <b>{approving.plan?.name ?? approving.planCode}</b> del negocio <b>{approving.business?.name ?? ''}</b> con el pago informado de <b>{formatARS(approving.reportedAmount)}</b>. Si la cuenta está vigente, el período se extiende un mes desde el vencimiento actual; si está vencida, el nuevo período comienza hoy.</> : ''} />
    <RejectPaymentDialog open={Boolean(rejecting)} businessName={rejecting?.business?.name} saving={action.saving} error={action.error} onClose={() => { setRejecting(null); action.clear() }} onConfirm={reason => void runReject(reason)} />
  </Stack>
}


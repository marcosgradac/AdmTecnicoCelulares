import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, TextField, Typography } from '@mui/material'
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded'
import BuildRounded from '@mui/icons-material/BuildRounded'
import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded'
import axios from 'axios'
import { getBillingPayments, getPlans, getTransferDetails, submitBillingPayment } from './billing.api'
import type { BillingPayment, Plan, PlanCode, TransferDetails } from './billing.types'
import { PlanCards } from './PlanCards'
import { useSubscription } from './SubscriptionContext'
import { formatARS, formatDate } from './billing.utils'
import './billing.scss'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const formatPeriodDate = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}` }
type UsageState = 'primary' | 'warning' | 'error'
const usageState = (used: number, limit: number): UsageState => used >= limit ? 'error' : used / limit >= 0.8 ? 'warning' : 'primary'

/** Bloque compacto de uso real por recurso. Los límites salen siempre de usage.entitlements y null significa ilimitado. */
function UsageMeter({ icon, title, used, limit, usedLabel, noun, unlimitedLabel }: { icon: ReactNode; title: string; used: number; limit: number | null; usedLabel: string; noun: string; unlimitedLabel: string }) {
  const limited = typeof limit === 'number' && limit > 0
  const total = limited ? limit as number : 0
  const state: UsageState = limited ? usageState(used, total) : 'primary'
  const percent = limited ? Math.min(100, Math.round(used / total * 100)) : 0
  const remaining = limited ? Math.max(0, total - used) : 0
  const reached = limited && used >= total
  const near = limited && !reached && used / total >= 0.8
  const tone = `${state}.main`
  return <Box sx={{ p: 2, minWidth: 0, border: '1px solid #e6e3ef', borderRadius: '12px', bgcolor: '#fff' }}>
    <Stack direction="row" alignItems="center" spacing={1.25}>
      <Box sx={{ display: 'grid', placeItems: 'center', width: 38, height: 38, flexShrink: 0, borderRadius: '10px', bgcolor: 'rgb(91 63 214 / 8%)', color: 'primary.main' }}>{icon}</Box>
      <Typography fontWeight={800} sx={{ flex: 1, minWidth: 0 }}>{title}</Typography>
      {!limited && <Chip size="small" variant="outlined" label={unlimitedLabel} sx={{ fontWeight: 800, color: 'primary.main', bgcolor: 'rgb(91 63 214 / 6%)', borderColor: 'rgb(91 63 214 / 30%)' }} />}
    </Stack>
    <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'baseline', gap: .75, flexWrap: 'wrap' }}>
      <Typography component="span" sx={{ fontSize: '1.6rem', lineHeight: 1.1, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: limited ? tone : 'primary.main' }}>{used}</Typography>
      <Typography component="span" fontWeight={700} color="text.secondary">{limited ? `de ${total}` : usedLabel}</Typography>
    </Box>
    {limited && <Box sx={{ mt: 1.5 }}>
      <LinearProgress variant="determinate" value={percent} color={state} sx={{ height: 8, borderRadius: 999, bgcolor: 'rgb(91 63 214 / 10%)' }} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" mt={.75}>
        <Typography variant="caption" color="text.secondary">{remaining} disponibles</Typography>
        <Typography variant="caption" fontWeight={800} color={tone}>{percent}%</Typography>
      </Stack>
    </Box>}
    {reached && <Typography variant="body2" fontWeight={700} color="error.main" mt={1}>Alcanzaste el límite de este período.</Typography>}
    {near && <Typography variant="body2" fontWeight={700} color="warning.main" mt={1}>Te quedan {remaining} {noun} disponibles.</Typography>}
  </Box>
}

export function SubscriptionPage(){
  const {subscription,refresh}=useSubscription();const[plans,setPlans]=useState<Plan[]>([]);const[payments,setPayments]=useState<BillingPayment[]>([]);const[selected,setSelected]=useState<PlanCode|null>(null);const[details,setDetails]=useState<TransferDetails|null>(null);const[detailsError,setDetailsError]=useState('');const[formOpen,setFormOpen]=useState(false);const[saving,setSaving]=useState(false);const[message,setMessage]=useState('');
  const[form,setForm]=useState({reportedAmount:'',payerName:'',transferDate:new Date().toISOString().slice(0,10),reference:'',notes:''});
  const load=()=>Promise.all([getPlans().then(setPlans),getBillingPayments().then(setPayments),refresh()]);useEffect(()=>{void load()},[])
  const plan=plans.find(item=>item.code===selected);const end=subscription?.status==='TRIALING'?subscription.trialEndsAt:subscription?.currentPeriodEnd;
  const statusLabel={TRIALING:'PRUEBA GRATUITA',ACTIVE:'ACTIVA',GRACE:'EN GRACIA',PAST_DUE:'VENCIDA',SUSPENDED:'SUSPENDIDA',CANCELED:'CANCELADA'} as const;
  const usage=useMemo(()=>subscription?.usage,[subscription]);
  const choose=async(code:PlanCode)=>{setSelected(code);setMessage('');try{setDetails(await getTransferDetails());setDetailsError('')}catch(error){setDetails(null);setDetailsError(axios.isAxiosError<{message?:string}>(error)?error.response?.data?.message??'Datos de cobro no disponibles':'Datos de cobro no disponibles')}}
  const submit=async(e:FormEvent)=>{e.preventDefault();if(!selected||!plan)return;setSaving(true);try{await submitBillingPayment({planCode:selected,reportedAmount:Number(form.reportedAmount),payerName:form.payerName,transferDate:form.transferDate,reference:form.reference||undefined,notes:form.notes||undefined});setFormOpen(false);setMessage('Pago informado. Estamos verificando tu transferencia.');await load()}catch{setMessage('No pudimos registrar el pago.')}finally{setSaving(false)}}
  if(!subscription)return <LinearProgress/>;
  const effectivePlanName=plans.find(item=>item.code===subscription.effectivePlanCode)?.name??(subscription.status==='TRIALING'?'Plan Completo':subscription.plan.name);
  const period=usage&&usage.periodStart&&usage.periodEnd?`${formatPeriodDate(usage.periodStart)} – ${formatPeriodDate(usage.periodEnd)}`:'';

  return <Box className="billing-page"><Box><Typography variant="h4" fontWeight={900} color="primary.main">Tu plan de TecnoDesk</Typography></Box>{message&&<Alert severity={message.startsWith('Pago informado')?'success':'error'}>{message}</Alert>}
    <section className="billing-summary"><article><small>Plan actual</small><strong>{subscription.status==='TRIALING'?'Plan Completo':subscription.plan.name}</strong></article><article><small>Estado</small><strong>{statusLabel[subscription.status]}</strong></article><article><small>Próximo vencimiento</small><strong>{formatDate(end)}</strong></article><article><small>Días restantes</small><strong>{subscription.daysRemaining}</strong></article></section>
    {subscription.status==='TRIALING'&&<Alert severity="info">Estás disfrutando todas las funciones gratis hasta el {formatDate(subscription.trialEndsAt)}.</Alert>}
    {usage&&<section className="billing-panel billing-usage"><Box><Typography variant="h6" fontWeight={900}>Uso del plan <Box component="span" sx={{color:'primary.main'}}>{effectivePlanName}</Box></Typography>{period&&<Typography variant="body2" color="text.secondary" mt={.5}>Período actual: {period}</Typography>}</Box><Box sx={{display:'grid',gap:1.5,gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'}}}><UsageMeter icon={<BuildRounded/>} title="Reparaciones" used={usage.repairs} limit={usage.entitlements.repairLimitPerPeriod} usedLabel="realizadas" noun="reparaciones" unlimitedLabel="Ilimitadas"/><UsageMeter icon={<NotificationsActiveRounded/>} title="Seguimientos" used={usage.trackingLinks} limit={usage.entitlements.trackingLimitPerPeriod} usedLabel="creados" noun="seguimientos" unlimitedLabel="Ilimitados"/></Box></section>}
    <Box><Typography variant="h5" fontWeight={900} mb={3}>{subscription.status==='ACTIVE'?'Renovar o cambiar plan':'Elegí tu plan'}</Typography><PlanCards plans={plans} actionLabel="Pagar por transferencia" onSelect={choose}/></Box>
    {selected&&plan&&<section className="billing-panel"><Typography variant="h5" fontWeight={900}>Realizá la transferencia</Typography><Typography mt={1} mb={2}>{plan.name} · <b>{formatARS(plan.priceARS)}</b></Typography>{detailsError&&<Alert severity="warning">{detailsError}</Alert>}{details&&<><div className="billing-transfer-grid">{[['Titular',details.holderName],['Banco',details.bankName],['Alias',details.alias],['CBU/CVU',details.cbuCvu],['CUIT',details.taxId]].map(([label,value])=><div className="billing-transfer-field" key={label}><small>{label}</small><strong>{value}</strong>{(label==='Alias'||label==='CBU/CVU')&&<Button size="small" startIcon={<ContentCopyRounded/>} onClick={()=>void navigator.clipboard.writeText(value)}>Copiar</Button>}</div>)}</div>{details.additionalText&&<Typography mt={2}>{details.additionalText}</Typography>}<Button variant="contained" size="large" sx={{mt:3}} onClick={()=>{setForm(current=>({...current,reportedAmount:String(plan.priceARS)}));setFormOpen(true)}}>Ya realicé la transferencia</Button></>}</section>}
    <section className="billing-panel"><Typography variant="h6" fontWeight={900} mb={2}>Pagos informados</Typography><div className="billing-payments">{payments.length?payments.map(payment=><article className="billing-payment" key={payment.id}><div><b>{payment.plan.name}</b><Typography variant="body2">Informado el {formatDate(payment.createdAt)}</Typography>{payment.rejectionReason&&<Typography color="error" variant="body2">{payment.rejectionReason}</Typography>}</div><div><b>{formatARS(payment.reportedAmount)}</b><Typography variant="body2">{payment.status==='PENDING'?'Pendiente':payment.status==='APPROVED'?'Aprobado':'Rechazado'}</Typography></div></article>):<Typography color="text.secondary">Todavía no informaste pagos.</Typography>}</div></section>
    <Dialog open={formOpen} onClose={()=>setFormOpen(false)} fullWidth maxWidth="sm"><Box component="form" onSubmit={submit}><DialogTitle>Informar transferencia</DialogTitle><DialogContent><Stack spacing={2} mt={1}><TextField label="Plan" value={plan?.name??''} disabled/><TextField label="Importe esperado" value={plan?formatARS(plan.priceARS):''} disabled/><TextField required label="Importe transferido" type="number" value={form.reportedAmount} onChange={e=>setForm({...form,reportedAmount:e.target.value})}/><TextField required label="Titular / origen" value={form.payerName} onChange={e=>setForm({...form,payerName:e.target.value})}/><TextField required label="Fecha de transferencia" type="date" InputLabelProps={{shrink:true}} value={form.transferDate} onChange={e=>setForm({...form,transferDate:e.target.value})}/><TextField label="Referencia (opcional)" value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}/><TextField label="Observación (opcional)" multiline minRows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Stack></DialogContent><DialogActions><Button onClick={()=>setFormOpen(false)}>Cancelar</Button><Button type="submit" variant="contained" disabled={saving}>{saving?'Enviando…':'Informar pago'}</Button></DialogActions></Box></Dialog>
  </Box>
}

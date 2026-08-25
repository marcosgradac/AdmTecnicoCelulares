import { AccountBalanceWalletRounded, BuildRounded, CheckRounded, DashboardRounded, LinkRounded, PersonAddRounded, SmartphoneRounded, TrendingDownRounded, TrendingUpRounded } from '@mui/icons-material'
import { useEffect, useState } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import type { TutorialDemo } from '../types/tutorial.types'
import styles from '../styles/onboarding.module.scss'

export function TutorialDemoPanel({ demo, onAction }: { demo?: TutorialDemo; onAction?: (path: string) => void }) {
  if (!demo) return null
  if (demo === 'dashboard') return <Box className={styles.demo}><Chip size="small" label="Ejemplo visual"/><Stack direction="row" gap={1}><Mini icon={<BuildRounded/>} label="Activas" value="12"/><Mini icon={<AccountBalanceWalletRounded/>} label="Ingresos" value="$485.000"/></Stack></Box>
  if (demo === 'repair') return <Box className={styles.demo}><Typography fontWeight={800}>Reparación #1048</Typography><Box className={styles.demoGrid}><span>Cliente<b>Juan Pérez</b></span><span>Equipo<b>iPhone 13</b></span><span>Falla<b>No enciende</b></span><span>Estado<b>En revisión</b></span></Box></Box>
  if (demo === 'form') return <Box className={styles.demo}><Stack direction="row" gap={1} flexWrap="wrap">{['1. Cliente', '2. Equipo', '3. Reparación', '4. Presupuesto'].map((label, i)=><Chip key={label} color={i === 0 ? 'primary' : 'default'} label={label} size="small"/>)}</Stack><Typography variant="caption" color="text.secondary">Podés crear el cliente sin perder lo que ya completaste.</Typography></Box>
  if (demo === 'status') { const states=['Recibido','En revisión','Presupuesto informado','Presupuesto aceptado','En reparación','Control de calidad','Listo para retirar','Entregado']; return <Box className={styles.statusDemo}>{states.map((state,i)=><div key={state}><i>{i < 4 ? <CheckRounded/> : i === 4 ? <BuildRounded/> : null}</i><span>{state}</span></div>)}</Box> }
  if (demo === 'tracking') return <TrackingDemo />
  if (demo === 'cash') return <Box className={styles.demo}><Stack spacing={1}><Typography color="success.main" fontWeight={800}><TrendingUpRounded fontSize="small"/> + $85.000 Reparación</Typography><Typography color="error.main" fontWeight={800}><TrendingDownRounded fontSize="small"/> − $20.000 Repuesto</Typography><Typography borderTop="1px solid" borderColor="divider" pt={1} fontWeight={900}>Resultado visual: +$65.000</Typography></Stack></Box>
  return <Box className={styles.finishLinks}>
    <button onClick={()=>onAction?.('/admin/clientes')}><PersonAddRounded/><b>Crear cliente</b><small>Registrá un nuevo cliente</small></button>
    <button onClick={()=>onAction?.('/admin/reparaciones?new=1')}><BuildRounded/><b>Nueva reparación</b><small>Ingresá un equipo</small></button>
    <button onClick={()=>onAction?.('/admin')}><DashboardRounded/><b>Ver dashboard</b><small>Volvé al inicio</small></button>
  </Box>
}

function Mini({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <Box className={styles.mini}>{icon}<small>{label}</small><b>{value}</b></Box>}

function TrackingDemo(){
  const [advanced,setAdvanced]=useState(false)
  useEffect(()=>{const timer=window.setTimeout(()=>setAdvanced(true),850);return()=>window.clearTimeout(timer)},[])
  const stages=[['Recibido',true],['Revisión',true],['Reparación',advanced],['Listo',false]] as const
  return <Box className={styles.trackingStage}>
    <Box className={styles.publicPreview}>
      <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={900} color="primary.main">TecnoDesk</Typography><span className={styles.live}><i/> EN VIVO</span></Stack>
      <Stack direction="row" gap={1.2} alignItems="center"><Box className={styles.deviceIcon}><SmartphoneRounded/></Box><Box><Typography fontWeight={850}>iPhone 13</Typography><Typography variant="caption" color="text.secondary">Reparación #TD-1024</Typography></Box></Stack>
      <Box><Typography variant="caption" color="text.secondary">Estado actual</Typography><Stack className={styles.stateChange} key={advanced?'repairing':'review'} direction="row" gap={1} alignItems="center"><BuildRounded color="primary"/><Typography fontWeight={850} color="primary.main">{advanced?'En reparación':'En revisión'}</Typography>{advanced&&<small>Actualizado</small>}</Stack></Box>
      <Box className={styles.trackingSteps}>{stages.map(([label,active],index)=><div className={active?styles.stageActive:''} key={label}><i>{active?(index<2?<CheckRounded/>:null):null}</i><span>{label}</span></div>)}</Box>
      <Typography className={styles.liveMessage} variant="body2">{advanced?'El cliente ya ve el nuevo estado.':'El servicio técnico está revisando tu equipo.'}</Typography>
      <Stack className={styles.noAccount} direction="row" gap={1} alignItems="center"><LinkRounded/><Box><Typography variant="body2" fontWeight={800}>Sin cuenta ni contraseña</Typography><Typography variant="caption" color="text.secondary">Solo entra al enlace que le enviaste.</Typography></Box></Stack>
    </Box>
  </Box>
}

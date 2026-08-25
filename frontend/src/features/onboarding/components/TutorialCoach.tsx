import { CheckCircleRounded, CloseRounded } from '@mui/icons-material'
import { Button, IconButton, LinearProgress, Paper, Stack, Typography } from '@mui/material'
import type { TutorialStep } from '../types/tutorial.types'
import { TutorialDemoPanel } from './TutorialDemoPanel'
import styles from '../styles/onboarding.module.scss'

export function TutorialCoach({ step, index, total, style, onBack, onNext, onClose, onAction }: { step: TutorialStep; index: number; total: number; style: React.CSSProperties; onBack: () => void; onNext: () => void; onClose: () => void; onAction: (path: string) => void }) {
  const welcome=step.id==='welcome', finish=step.id==='finish', tracking=step.id==='tracking'
  return <Paper className={`${styles.coach} ${welcome||finish?styles.fullscreenCoach:''} ${finish?styles.finishCoach:''} ${tracking?styles.trackingCoach:''} ${step.id==='new-repair'?styles.mobileTop:''}`} style={style} elevation={18}>
    <IconButton className={styles.close} size="small" aria-label="Cerrar tutorial" onClick={onClose}><CloseRounded/></IconButton>
    {finish&&<div className={styles.celebration}><CheckCircleRounded/></div>}
    {!welcome&&!finish&&<Typography variant="caption" color="primary.main" fontWeight={850}>{index} de {total-2}</Typography>}
    <Typography variant="h2" color="primary.main" className={finish?styles.finishTitle:undefined}>{step.title}{welcome?' 👋':finish?' 🎉':''}</Typography>
    <Typography color="text.secondary" className={finish?styles.finishDescription:undefined}>{step.description}</Typography>
    {finish&&<Typography className={styles.nextPrompt} fontWeight={800}>¿Qué querés hacer ahora?</Typography>}
    <TutorialDemoPanel demo={step.demo} onAction={onAction}/>
    {!welcome&&!finish&&<LinearProgress variant="determinate" value={(index/(total-2))*100}/>} 
    <Stack direction="row" justifyContent="space-between" gap={1} mt={.5}>
      {welcome?<Button color="inherit" onClick={onClose}>Ahora no</Button>:index>1&&!finish?<Button onClick={onBack}>{tracking?'← Anterior':'Anterior'}</Button>:<span/>}
      <Button className={finish?styles.finishCta:undefined} variant="contained" onClick={onNext}>{welcome?'Comenzar recorrido':finish?'Empezar a usar TecnoDesk':index===total-2?'Finalizar':tracking?'Siguiente →':'Siguiente'}</Button>
    </Stack>
  </Paper>
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Box } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { canAccess } from '../../auth/permissions'
import { TutorialCoach } from '../../features/onboarding/components/TutorialCoach'
import { TutorialSpotlight } from '../../features/onboarding/components/TutorialSpotlight'
import { tutorialSteps } from '../../features/onboarding/data/tutorialSteps'
import type { TutorialProgress } from '../../features/onboarding/types/tutorial.types'
import styles from '../../features/onboarding/styles/onboarding.module.scss'

export const OPEN_TUTORIAL_EVENT = 'tecnodesk:open-tutorial'
const VERSION = 'premium-v2'
const keyFor = (id:string)=>`tecnodesk_tutorial_${VERSION}_${id}`
export const openGuidedTutorial = () => window.dispatchEvent(new CustomEvent(OPEN_TUTORIAL_EVENT, { detail: { mode: 'manual' } }))

export function GuidedTutorial(){
  const {user,markTutorialSeen}=useAuth(),navigate=useNavigate(),location=useLocation()
  const steps=useMemo(()=>tutorialSteps.filter(step=>!step.permission||canAccess(user,step.permission)),[user])
  const [open,setOpen]=useState(()=>user?.tutorialSeen===false),[mode,setMode]=useState<'automatic'|'manual'>('automatic'),[index,setIndex]=useState(0),[rect,setRect]=useState<DOMRect|null>(null),[moving,setMoving]=useState(false)
  const step=steps[index]
  const read=useCallback(():TutorialProgress=>{try{return JSON.parse(localStorage.getItem(keyFor(user!.id))||'{"completed":false,"currentStep":0}')}catch{return{completed:false,currentStep:0}}},[user])
  const save=useCallback((progress:TutorialProgress)=>{if(user)localStorage.setItem(keyFor(user.id),JSON.stringify(progress))},[user])
  const start=useCallback((nextMode:'automatic'|'manual')=>{setMode(nextMode);setIndex(0);setOpen(true)},[])
  const close=async()=>{save({completed:true,currentStep:index});setOpen(false);if(mode==='automatic'&&user?.tutorialSeen===false){try{await markTutorialSeen()}catch{setOpen(true);return}}if(location.search.includes('new=1'))navigate('/admin/reparaciones',{replace:true})}
  useEffect(()=>{const handler=()=>start('manual');window.addEventListener(OPEN_TUTORIAL_EVENT,handler);return()=>window.removeEventListener(OPEN_TUTORIAL_EVENT,handler)},[start])
  useEffect(()=>{if(!user||!steps.length||user.tutorialSeen)return;const progress=read();setMode('automatic');setIndex(Math.min(progress.currentStep,steps.length-1));setOpen(true)},[read,steps.length,user])

  useEffect(()=>{
    if(!open||!step?.route)return
    const current=`${location.pathname}${location.search}`
    if(current===step.route)return
    setMoving(true);navigate(step.route)
  },[index,location.pathname,location.search,navigate,open,step])
  useLayoutEffect(()=>{
    if(!open||!step||moving&&step.route!==`${location.pathname}${location.search}`){setRect(null);return}
    let cancelled=false,attempt=0
    const find=()=>{if(cancelled)return;const element=step.target?document.querySelector<HTMLElement>(step.target):null;if(element){element.scrollIntoView({behavior:'smooth',block:'center'});window.setTimeout(()=>{if(!cancelled)setRect(element.getBoundingClientRect())},260);setMoving(false)}else if(step.target&&attempt++<18)window.setTimeout(find,100);else{setRect(null);setMoving(false)}}
    const timer=window.setTimeout(find,180);return()=>{cancelled=true;clearTimeout(timer)}
  },[index,location.pathname,location.search,moving,open,step])
  useEffect(()=>{if(!open)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close();if(event.key==='ArrowRight')void next();if(event.key==='ArrowLeft'&&index>0)setIndex(v=>v-1)};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)})
  const next=async()=>{if(index===steps.length-1){close();return}const nextIndex=index+1;save({completed:false,currentStep:nextIndex});setRect(null);setMoving(true);setIndex(nextIndex)}
  if(!open||!user||!step)return null
  const mobile=window.innerWidth<600,fullscreen=step.type==='fullscreen'
  const coachStyle:React.CSSProperties=fullscreen?{}:mobile?{}:rect&&rect.left<window.innerWidth/2?{left:Math.min(rect.right+24,window.innerWidth-414),top:Math.max(18,Math.min(rect.top,window.innerHeight-470))}:{right:rect?Math.max(18,window.innerWidth-rect.left+24):24,top:rect?Math.max(18,Math.min(rect.top,window.innerHeight-470)):80}
  const action=async(path:string)=>{await close();navigate(path)}
  return <Box className={styles.layer} role="dialog" aria-modal="true" aria-label="Tutorial interactivo de TecnoDesk"><TutorialSpotlight rect={fullscreen?null:rect} pulse={step.id==='new-repair'}/><TutorialCoach step={step} index={index} total={steps.length} style={coachStyle} onBack={()=>{setMoving(true);setIndex(v=>Math.max(0,v-1))}} onNext={()=>void next()} onClose={()=>void close()} onAction={action}/></Box>
}

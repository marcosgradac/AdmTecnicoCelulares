import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPlans } from './billing.api'
import type { Plan } from './billing.types'
import { PlanCards } from './PlanCards'
import './billing.scss'
export function PricingSection(){const [plans,setPlans]=useState<Plan[]>([]);const navigate=useNavigate();useEffect(()=>{void getPlans().then(setPlans).catch(()=>undefined)},[]);if(!plans.length)return null;return <section className="pricing-section" id="planes"><div className="landing-container"><header className="pricing-heading"><span>PLANES</span><h2>Elegí el plan que mejor acompaña tu servicio técnico</h2><p>Probá todas las funciones gratis durante 30 días. Después elegí el plan que mejor se adapte a tu forma de trabajar.</p><b className="pricing-trial-badge">30 DÍAS GRATIS</b></header><PlanCards plans={plans} actionLabel="Probar 30 días gratis" onSelect={()=>navigate('/register')}/></div></section>}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPlans } from './billing.api'
import type { Plan } from './billing.types'
import { PricingCarousel } from './PricingCarousel'
import './billing.scss'
export function PricingSection(){
  const [plans,setPlans]=useState<Plan[]>([]);
  const navigate=useNavigate();
  useEffect(()=>{void getPlans().then(setPlans).catch(()=>undefined)},[]);
  // Si la API no responde no se renderiza la sección: nunca se inventan precios.
  if(!plans.length)return null;
  return <section className="pricing-section redesign-pricing" id="planes" aria-labelledby="planes-title"><div className="landing-container"><header className="pricing-heading"><span>PLANES</span><h2 id="planes-title">Planes claros para cada etapa de tu taller</h2><p>Probá TecnoDesk completo durante 30 días. Después elegí el plan que mejor se adapte a tu taller.</p><b className="pricing-trial-badge">1 MES GRATIS</b></header><PricingCarousel plans={plans} actionLabel="Probar 30 días gratis" onSelect={()=>navigate('/register')}/></div></section>
}

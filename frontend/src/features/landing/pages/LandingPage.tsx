import { useEffect } from 'react';
import { LandingHeader } from '../components/LandingHeader';
import { LandingFooter } from '../components/LandingFooter';
import { FloatingWhatsApp } from '../components/FloatingWhatsApp';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { HeroSection } from '../components/redesign/HeroSection';
import { RepairsShowcase, TrackingShowcase, CashShowcase, WarrantiesShowcase, PosShowcase, EquipmentSalesShowcase } from '../components/redesign/Showcases';
import { CustomerTeamShowcase, MobileShowcase, FinalCta } from '../components/redesign/ClosingSections';
import { PricingSection } from '../../billing/PricingSection';
import '../styles/landing.scss';
import '../styles/brand.scss';
import '../components/redesign/redesign.scss';

export function LandingPage(){
  useScrollReveal();
  useEffect(()=>{
    document.title='TecnoDesk | Gestión técnica';
    document.querySelector('meta[name="description"]')?.setAttribute('content','Gestioná reparaciones, clientes, cobros, garantías, comercio y equipos desde TecnoDesk, el sistema de gestión para servicios técnicos.')
  },[]);
  return <div className="landing-page landing-redesign">
    <LandingHeader/>
    <main>
      <HeroSection/>
      <RepairsShowcase/>
      <TrackingShowcase/>
      <CashShowcase/>
      <WarrantiesShowcase/>
      <PosShowcase/>
      <EquipmentSalesShowcase/>
      <CustomerTeamShowcase/>
      <MobileShowcase/>
      <PricingSection/>
      <FinalCta/>
    </main>
    <LandingFooter/>
    <FloatingWhatsApp/>
  </div>
}

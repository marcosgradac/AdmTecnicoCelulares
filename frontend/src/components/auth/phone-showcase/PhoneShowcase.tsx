import type { PhoneScreenDefinition } from './phoneShowcase.types'
import { CustomerTrackingPreview } from './screens/CustomerTrackingPreview'
import { DashboardPreview } from './screens/DashboardPreview'
import { RepairPreview } from './screens/RepairPreview'
import { SecurityPreview } from './screens/SecurityPreview'
import { OperationsPreview } from './screens/OperationsPreview'

export function PhoneShowcase({ screen, reducedMotion }: { screen: PhoneScreenDefinition; reducedMotion: boolean }) {
  const content = screen.kind === 'dashboard' ? <DashboardPreview />
    : screen.kind === 'repair' ? <RepairPreview />
    : screen.kind === 'tracking' ? <CustomerTrackingPreview />
    : ['ready', 'clients', 'payments', 'budget'].includes(screen.kind) ? <OperationsPreview kind={screen.kind as 'ready' | 'clients' | 'payments' | 'budget'} />
    : <SecurityPreview title={screen.title ?? 'Acceso protegido'} description={screen.description ?? 'Tu cuenta está segura.'} />

  return <div key={screen.id} className={`phone-showcase-view${reducedMotion ? ' is-reduced' : ''}`}>{content}</div>
}

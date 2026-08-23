import type { AuthVisualVariant } from '../auth-visual.types'

export type PhoneScreenKind = 'dashboard' | 'repair' | 'tracking' | 'ready' | 'clients' | 'payments' | 'budget' | 'security'

export interface PhoneScreenDefinition {
  id: string
  kind: PhoneScreenKind
  indicatorLabel: string
  title?: string
  description?: string
}

export type PhoneShowcaseConfig = Record<AuthVisualVariant, PhoneScreenDefinition[]>

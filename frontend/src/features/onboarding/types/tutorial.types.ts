import type { Permission } from '../../../auth/permissions'

export type TutorialDemo = 'dashboard' | 'repair' | 'form' | 'status' | 'tracking' | 'cash' | 'finish'
export interface TutorialStep {
  id: string
  route?: string
  target?: string
  title: string
  description: string
  type: 'fullscreen' | 'spotlight' | 'demo'
  permission?: Permission
  demo?: TutorialDemo
}

export interface TutorialProgress { completed: boolean; currentStep: number }

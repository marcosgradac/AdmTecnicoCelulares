import type { PhoneShowcaseConfig } from './phoneShowcase.types'

export const phoneShowcaseConfig: PhoneShowcaseConfig = {
  login: [
    { id: 'dashboard', kind: 'dashboard', indicatorLabel: 'Panel' },
    { id: 'repair', kind: 'repair', indicatorLabel: 'Reparación' },
    { id: 'tracking', kind: 'tracking', indicatorLabel: 'Seguimiento' },
  ],
  register: [
    { id: 'dashboard', kind: 'dashboard', indicatorLabel: 'Panel' },
    { id: 'stock', kind: 'stock', indicatorLabel: 'Stock' },
    { id: 'repair', kind: 'repair', indicatorLabel: 'Órdenes' },
  ],
  'forgot-password': [
    { id: 'protected-access', kind: 'security', indicatorLabel: 'Acceso', title: 'Acceso protegido', description: 'Tu cuenta y tus datos permanecen seguros.' },
    { id: 'secure-recovery', kind: 'security', indicatorLabel: 'Recuperación', title: 'Recuperación segura', description: 'Te enviamos un enlace privado y temporal.' },
    { id: 'account-status', kind: 'security', indicatorLabel: 'Cuenta', title: 'Cuenta verificada', description: 'Solo vos podés recuperar el acceso.' },
  ],
  'reset-password': [
    { id: 'security', kind: 'security', indicatorLabel: 'Seguridad', title: 'Protección activa', description: 'La nueva contraseña protege tu espacio.' },
    { id: 'password-updated', kind: 'security', indicatorLabel: 'Contraseña', title: 'Contraseña actualizada', description: 'Las sesiones anteriores se cerrarán.' },
    { id: 'access-restored', kind: 'security', indicatorLabel: 'Acceso', title: 'Acceso recuperado', description: 'Ya podés volver a gestionar tu taller.' },
  ],
}

export const dashboardRepairs = [
  { number: '#1048', device: 'Galaxy A54', state: 'En reparación' },
  { number: '#1047', device: 'Moto G84', state: 'Listo' },
]

export const stockItems = [
  { name: 'Módulos', quantity: 12 },
  { name: 'Baterías', quantity: 8 },
  { name: 'Conectores', quantity: 2, low: true },
]

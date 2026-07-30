export type AuthVisualVariant = 'login' | 'register' | 'forgot-password' | 'reset-password'
export const authVisualContent = {
  login: ['Panel en tiempo real', 'Reparación #1048', 'En reparación', 'Todo bajo control'],
  register: ['Primeros pasos', 'Nueva reparación', 'Recepción completa', 'Tu taller, organizado'],
  'forgot-password': ['Recuperación segura', 'Revisá tu correo', 'Email enviado', 'Acceso seguro'],
  'reset-password': ['Protección de cuenta', 'Nueva contraseña', 'Cuenta protegida', 'Contraseña protegida'],
} satisfies Record<AuthVisualVariant, [string, string, string, string]>

import type { RegisterFormState } from './RegisterForm'
// Aligned with /api/auth/register; strength is advisory, not a validity rule.
export const passwordRequirements = (password: string) => [
  { label: 'Mínimo 8 caracteres.', met: password.length >= 8, missing: 'mínimo 8 caracteres' },
  { label: 'Máximo 128 caracteres.', met: password.length <= 128, missing: 'máximo 128 caracteres' },
  { label: 'Al menos una letra mayúscula.', met: /[A-Z]/.test(password), missing: 'al menos una letra mayúscula' },
  { label: 'Al menos una letra minúscula.', met: /[a-z]/.test(password), missing: 'al menos una letra minúscula' },
  { label: 'Al menos un número.', met: /\d/.test(password), missing: 'al menos un número' },
]
export type RegisterErrors = Partial<Record<keyof RegisterFormState, string>>
const phonePattern = /^(?=(?:\D*\d){6,15}\D*$)[+\d][\d\s().-]*$/
const emailPattern = /^(?!\.)(?!.*\.\.)([a-z0-9_'+\-.]*)[a-z0-9_+-]@([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}$/i
export function validateRegistration(form: RegisterFormState): RegisterErrors {
  const missing = passwordRequirements(form.password).filter(rule => !rule.met)
  return {
    firstName: form.firstName.trim() ? undefined : 'Ingresá tu nombre',
    lastName: form.lastName.trim() ? undefined : 'Ingresá tu apellido',
    phone: phonePattern.test(form.phone.trim()) ? undefined : 'Ingresá un teléfono válido',
    businessName: form.businessName.trim().length >= 2 ? undefined : 'El nombre del negocio debe tener al menos 2 caracteres',
    businessPhone: phonePattern.test(form.businessPhone.trim()) ? undefined : 'Ingresá un teléfono válido',
    email: emailPattern.test(form.email.trim()) ? undefined : 'Revisá el formato de tu correo electrónico',
    password: missing.length ? `La contraseña requiere: ${missing.map(rule => rule.missing).join(', ')}.` : undefined,
    repeatPassword: !form.repeatPassword ? 'Confirmá tu contraseña' : form.password !== form.repeatPassword ? 'Las contraseñas no coinciden' : undefined,
    terms: form.terms ? undefined : 'Aceptá los términos y la política de privacidad para continuar',
  }
}

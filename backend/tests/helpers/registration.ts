import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../../src/config/legal'

type RegistrationOverrides = Partial<{
  businessName: string
  businessPhone: string
  firstName: string
  lastName: string
  phone: string
  email: string
  password: string
}>

export const validRegistrationPayload = (overrides: RegistrationOverrides) => ({
  businessPhone: '+54 11 5555-0101',
  phone: '+54 11 5555-0102',
  termsAccepted: true,
  termsVersion: CURRENT_TERMS_VERSION,
  privacyAccepted: true,
  privacyVersion: CURRENT_PRIVACY_VERSION,
  turnstileToken: 'test-token',
  ...overrides,
})

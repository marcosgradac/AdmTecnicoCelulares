import { api } from './api'

export interface AuthUser {
  id: string
  firstName: string | null
  lastName: string | null
  fullName: string
  phone: string | null
  email: string
  role: 'OWNER' | 'TECHNICIAN'
  platformRole: 'USER' | 'SUPER_ADMIN'
  termsAccepted: boolean
  termsVersion: string | null
  termsAcceptedAt: string | null
  privacyAccepted: boolean
  privacyVersion: string | null
  privacyAcceptedAt: string | null
  profileComplete: boolean
  permissions: string[]
  business: { id: string; name: string }
}

export interface RegisterInput {
  firstName: string
  lastName: string
  phone: string
  email: string
  password: string
  businessName: string
  businessPhone: string
  termsAccepted: true
  termsVersion: string
  privacyAccepted: true
  privacyVersion: string
}
export interface ProfileInput { firstName: string; lastName: string; phone?: string | null }
export interface AuthResponse { token: string; user: AuthUser }
export const login = async (input: { email: string; password: string }) => (await api.post<AuthResponse>('/auth/login', input)).data
export const register = async (input: RegisterInput) => (await api.post<AuthResponse>('/auth/register', input)).data
export const getMe = async () => (await api.get<AuthUser>('/auth/me')).data
export const getProfile = async () => (await api.get<AuthUser>('/profile')).data
export const updateProfile = async (input: ProfileInput) => (await api.patch<AuthUser>('/profile', input)).data
export const forgotPassword = async (email: string) =>
  (await api.post<{ success: true; message: string }>('/auth/forgot-password', { email })).data
export const resetPassword = async (token: string, password: string) =>
  (await api.post<{ success: true; message: string }>('/auth/reset-password', { token, password })).data

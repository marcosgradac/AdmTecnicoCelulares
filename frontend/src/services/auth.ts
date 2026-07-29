import { api } from './api'

export interface AuthUser {
  id: string
  firstName: string | null
  lastName: string | null
  fullName: string
  phone: string | null
  email: string
  role: 'OWNER' | 'TECHNICIAN'
  profileComplete: boolean
  business: { id: string; name: string }
}

export interface RegisterInput {
  firstName: string
  lastName: string
  phone?: string
  email: string
  password: string
  businessName: string
  businessPhone?: string
}
export interface ProfileInput { firstName: string; lastName: string; phone?: string | null }
export interface AuthResponse { token: string; user: AuthUser }
export const login = async (input: { email: string; password: string }) => (await api.post<AuthResponse>('/auth/login', input)).data
export const register = async (input: RegisterInput) => (await api.post<AuthResponse>('/auth/register', input)).data
export const getMe = async () => (await api.get<AuthUser>('/auth/me')).data
export const getProfile = async () => (await api.get<AuthUser>('/profile')).data
export const updateProfile = async (input: ProfileInput) => (await api.patch<AuthUser>('/profile', input)).data

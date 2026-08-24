import { api } from '../../services/api'
import type { BusinessSettings, SettingsData, UpdateBusinessInput } from './settings.types'
export const getSettings = async () => (await api.get<SettingsData>('/settings')).data
export const updateBusiness = async (input: UpdateBusinessInput) => (await api.patch<BusinessSettings>('/settings/business', input)).data
export const requestPasswordCode = async (turnstileToken?: string) => (await api.post<{ success: true; maskedEmail: string; retryAfter: number }>('/auth/password-change/request', { turnstileToken })).data
export const verifyPasswordCode = async (code: string) => (await api.post<{ success: true; verificationToken: string }>('/auth/password-change/verify', { code })).data
export const confirmPasswordChange = async (verificationToken: string, newPassword: string, confirmPassword: string) => (await api.post<{ success: true; message: string }>('/auth/password-change/confirm', { verificationToken, newPassword, confirmPassword })).data
export const logoutOtherSessions = async () => (await api.post('/settings/logout-other-sessions')).data

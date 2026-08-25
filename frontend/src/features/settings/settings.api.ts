import { api, apiAssetUrl } from '../../services/api'
import type { BusinessSettings, SettingsData, UpdateBusinessInput } from './settings.types'
const withResolvedLogo = <T extends { logoUrl: string | null }>(business: T): T => ({ ...business, logoUrl: apiAssetUrl(business.logoUrl) ?? null })
export const getSettings = async () => { const data = (await api.get<SettingsData>('/settings')).data; return { ...data, business: withResolvedLogo(data.business) } }
export const updateBusiness = async (input: UpdateBusinessInput) => withResolvedLogo((await api.patch<BusinessSettings>('/settings/business', input)).data)
export const uploadBusinessLogo = async (file: File) => { const data = (await api.post<{ logoUrl: string }>('/settings/business/logo', file, { headers: { 'Content-Type': file.type } })).data; return { logoUrl: apiAssetUrl(data.logoUrl)! } }
export const deleteBusinessLogo = async () => (await api.delete<{ logoUrl: null }>('/settings/business/logo')).data
export const requestPasswordCode = async (turnstileToken?: string) => (await api.post<{ success: true; maskedEmail: string; retryAfter: number }>('/auth/password-change/request', { turnstileToken })).data
export const verifyPasswordCode = async (code: string) => (await api.post<{ success: true; verificationToken: string }>('/auth/password-change/verify', { code })).data
export const confirmPasswordChange = async (verificationToken: string, newPassword: string, confirmPassword: string) => (await api.post<{ success: true; message: string }>('/auth/password-change/confirm', { verificationToken, newPassword, confirmPassword })).data
export const logoutOtherSessions = async () => (await api.post('/settings/logout-other-sessions')).data

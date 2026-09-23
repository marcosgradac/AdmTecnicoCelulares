import { api } from '../../services/api'

export type AccessStatus = 'NO_EXPIRY' | 'ACTIVE' | 'EXPIRING' | 'GRACE' | 'BLOCKED'
export type PlanCode = 'INITIAL' | 'PROFESSIONAL' | 'COMPLETE'
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'GRACE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED'
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type SubscriptionAction = 'CHANGE_PLAN' | 'ADD_COURTESY_DAYS' | 'SUSPEND' | 'REACTIVATE'
export type LifecycleFilter = 'ACTIVE' | 'EXPIRING' | 'GRACE' | 'BLOCKED' | 'NO_EXPIRY' | 'TODAY' | 'WEEK'
export type BusinessSort = 'EXPIRY_ASC' | 'REMAINING_DESC' | 'RECENT' | 'OLDEST' | 'NAME'

export interface AccountAccess {
  status: AccessStatus
  expiresAt: string | null
  graceEndsAt: string | null
  warningDays: number
  graceDays: number
  daysRemaining: number | null
  graceDaysRemaining: number | null
  shouldBlock: boolean
  blockType: 'MANUAL' | 'AUTOMATIC' | null
  blockedAt: string | null
  blockReason: string | null
  blockNote: string | null
}

export interface AdminPlan {
  code: PlanCode
  name: string
  priceARS: number
  repairLimitPerPeriod: number | null
  trackingLimitPerPeriod: number | null
  dashboardComplete: boolean
  advancedReports: boolean
}

export interface PlanEntitlements {
  repairLimitPerPeriod: number | null
  trackingLimitPerPeriod: number | null
  dashboardComplete: boolean
  advancedReports: boolean
  commerce: boolean
}

export interface SubscriptionUsage { repairs: number; trackingLinks: number; entitlements: PlanEntitlements; periodStart: string; periodEnd: string }

export interface AdminSubscriptionBase {
  id: string
  businessId: string
  planCode: PlanCode
  status: SubscriptionStatus
  trialStartedAt: string
  trialEndsAt: string
  trialConsumedAt: string
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  graceEndsAt: string | null
  accessExpiresAt: string | null
  graceDaysOverride: number | null
  manuallyBlockedAt: string | null
  manualBlockReason: string | null
  manualBlockNote: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminSubscription extends AdminSubscriptionBase { plan: AdminPlan }
export interface AdminSubscriptionAudit { id: string; action: string; metadata: Record<string, unknown> | null; createdAt: string; actor: { name: string; email: string } }
export interface AdminNote { id: string; content: string; createdAt: string; updatedAt: string }
export interface AdminBusinessUser { id: string; name: string; email: string; phone: string | null; role: 'OWNER' | 'TECHNICIAN'; isActive: boolean; createdAt: string }

export interface AdminBusiness { id: string; name: string; phone: string | null; isActive: boolean; createdAt: string; _count: { users: number; repairs: number; clients: number }; users: Array<{ name: string; email: string }>; subscription: AdminSubscription | null; access: AccountAccess }

export interface AdminBusinessDetail {
  id: string
  name: string
  phone: string | null
  address: string | null
  isActive: boolean
  createdAt: string
  users: AdminBusinessUser[]
  subscription: AdminSubscription | null
  subscriptionAudits: AdminSubscriptionAudit[]
  internalNotes: AdminNote[]
  _count: { repairs: number; clients: number; cashMovements: number }
  access: AccountAccess | null
}

export interface AdminSubscriptionRow extends AdminSubscription { business: { id: string; name: string; isActive: boolean; users: Array<{ id: string; name: string; email: string; createdAt: string }> }; payments: AdminPayment[] }

export interface AdminSubscriptionDetail extends AdminSubscriptionBase {
  plan: AdminPlan
  business: { id: string; name: string; phone: string | null; isActive: boolean; createdAt: string; users: AdminBusinessUser[] }
  payments: AdminPayment[]
  usage: SubscriptionUsage
}

export interface AdminPayment {
  id: string
  subscriptionId: string
  businessId: string
  planCode: PlanCode
  expectedAmount: number
  reportedAmount: number
  payerName: string
  transferDate: string
  reference: string | null
  notes: string | null
  status: PaymentStatus
  reviewedAt: string | null
  rejectionReason: string | null
  createdAt: string
  plan?: AdminPlan
  business?: { name: string }
}

export interface PlatformDashboard {
  clients: number
  activeBusinesses: number
  inactiveBusinesses: number
  owners: number
  technicians: number
  active: number
  trials: number
  pendingPayments: number
  grace: number
  suspended: number
  estimatedMrrARS: number
  lifecycle: { active: number; expiring: number; grace: number; blocked: number; noExpiry: number }
  attention: Array<{ business: { id: string; name: string }; access: AccountAccess }>
  recentBusinesses: Array<{ id: string; name: string; isActive: boolean; createdAt: string }>
}

export interface BusinessPage { items: AdminBusiness[]; total: number; page: number; pageSize: number; pages: number }
export interface BusinessQuery { page: number; pageSize: number; search?: string; lifecycle?: LifecycleFilter; sort: BusinessSort }
export interface AdminLifecycleResult { subscription: AdminSubscriptionBase; access: AccountAccess }
export interface ServiceSettings { expirationWarningDays: number; defaultGraceDays: number }
export interface BillingSettings { holderName: string | null; bankName: string | null; alias: string | null; cbuCvu: string | null; taxId: string | null; additionalText: string | null }
export interface BillingSettingsInput { holderName: string; bankName: string; alias: string; cbuCvu: string; taxId: string; additionalText: string }

export const getAdminDashboard = async () => (await api.get<PlatformDashboard>('/platform-admin/dashboard')).data
export const getAdminBusinesses = async (params: BusinessQuery) => (await api.get<BusinessPage>('/platform-admin/businesses', { params })).data
export const getAdminBusiness = async (id: string) => (await api.get<AdminBusinessDetail>(`/platform-admin/businesses/${id}`)).data
export const setAdminBusinessStatus = async (id: string, isActive: boolean) => (await api.patch<{ id: string; isActive: boolean }>(`/platform-admin/businesses/${id}/status`, { isActive })).data
export const renewAdminBusiness = async (id: string, days: number, base: 'TODAY' | 'EXPIRY') => (await api.post<AdminLifecycleResult>(`/platform-admin/businesses/${id}/renew`, { days, base })).data
export const setAdminBusinessExpiry = async (id: string, expiresAt: string, graceDaysOverride?: number | null) => (await api.patch<AdminLifecycleResult>(`/platform-admin/businesses/${id}/expiry`, { expiresAt, graceDaysOverride })).data
export const blockAdminBusiness = async (id: string, reason: string, note?: string) => (await api.post<AdminLifecycleResult>(`/platform-admin/businesses/${id}/block`, { reason, note })).data
export const unblockAdminBusiness = async (id: string, expiresAt?: string) => (await api.post<AdminLifecycleResult>(`/platform-admin/businesses/${id}/unblock`, { expiresAt })).data
export const createAdminNote = async (id: string, content: string) => (await api.post<AdminNote>(`/platform-admin/businesses/${id}/notes`, { content })).data
export const deleteAdminNote = async (businessId: string, id: string) => (await api.delete<{ success: boolean }>(`/platform-admin/businesses/${businessId}/notes/${id}`)).data
export const getServiceSettings = async () => (await api.get<ServiceSettings>('/platform-admin/service-settings')).data
export const saveServiceSettings = async (input: ServiceSettings) => (await api.patch<ServiceSettings>('/platform-admin/service-settings', input)).data
export const getAdminSubscriptions = async (params?: { status?: SubscriptionStatus; search?: string }) => (await api.get<AdminSubscriptionRow[]>('/platform-admin/subscriptions', { params })).data
export const getAdminSubscription = async (id: string) => (await api.get<AdminSubscriptionDetail>(`/platform-admin/subscriptions/${id}`)).data
export const updateAdminSubscription = async (id: string, input: { action: SubscriptionAction; planCode?: PlanCode; days?: number }) => (await api.patch<AdminSubscriptionBase>(`/platform-admin/subscriptions/${id}`, input)).data
export const getAdminPayments = async (status?: PaymentStatus) => (await api.get<AdminPayment[]>('/platform-admin/payments', { params: { status } })).data
export const approveAdminPayment = async (id: string) => (await api.post<{ payment: AdminPayment | null; subscription: AdminSubscriptionBase }>(`/platform-admin/payments/${id}/approve`)).data
export const rejectAdminPayment = async (id: string, reason: string) => (await api.post<AdminPayment>(`/platform-admin/payments/${id}/reject`, { reason })).data
export const getBillingSettings = async () => (await api.get<BillingSettings | null>('/platform-admin/billing-settings')).data
export const saveBillingSettings = async (input: BillingSettingsInput) => (await api.patch<BillingSettings>('/platform-admin/billing-settings', input)).data

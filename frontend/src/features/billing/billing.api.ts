import { api } from '../../services/api'
import type { BillingPayment, Plan, PlanCode, Subscription, TransferDetails } from './billing.types'

export const getPlans = async () => (await api.get<Plan[]>('/billing/plans')).data
export const getSubscription = async () => (await api.get<Subscription>('/billing/subscription')).data
export const getBillingPayments = async () => (await api.get<BillingPayment[]>('/billing/payments')).data
export const getTransferDetails = async () => (await api.get<TransferDetails>('/billing/transfer-details')).data
export const submitBillingPayment = async (input: { planCode: PlanCode; reportedAmount: number; payerName: string; transferDate: string; reference?: string; notes?: string }) => (await api.post<BillingPayment>('/billing/payments', input)).data

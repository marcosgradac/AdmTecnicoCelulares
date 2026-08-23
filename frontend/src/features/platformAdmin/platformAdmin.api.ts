import { api } from '../../services/api'
export const getAdminDashboard=async()=>(await api.get('/platform-admin/dashboard')).data
export const getAdminSubscriptions=async()=>(await api.get('/platform-admin/subscriptions')).data
export const getAdminPayments=async(status?:string)=>(await api.get('/platform-admin/payments',{params:{status}})).data
export const approveAdminPayment=async(id:string)=>(await api.post(`/platform-admin/payments/${id}/approve`)).data
export const rejectAdminPayment=async(id:string,reason:string)=>(await api.post(`/platform-admin/payments/${id}/reject`,{reason})).data
export const getBillingSettings=async()=>(await api.get('/platform-admin/billing-settings')).data
export const saveBillingSettings=async(input:Record<string,string>)=>(await api.patch('/platform-admin/billing-settings',input)).data

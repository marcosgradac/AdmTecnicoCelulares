import { api } from '../../services/api'
export type AccessStatus='NO_EXPIRY'|'ACTIVE'|'EXPIRING'|'GRACE'|'BLOCKED'
export interface AccountAccess {status:AccessStatus;expiresAt:string|null;graceEndsAt:string|null;warningDays:number;graceDays:number;daysRemaining:number|null;graceDaysRemaining:number|null;shouldBlock:boolean;blockType:'MANUAL'|'AUTOMATIC'|null;blockedAt:string|null;blockReason:string|null;blockNote:string|null}
export interface AdminBusiness { id:string; name:string; phone?:string|null; isActive:boolean; createdAt:string; _count:{users:number;repairs:number;clients:number}; users:Array<{name:string;email:string}>; subscription?:{status:string;plan:{name:string}}|null;access:AccountAccess }
export interface BusinessPage {items:AdminBusiness[];total:number;page:number;pageSize:number;pages:number}
export const getAdminDashboard=async()=>(await api.get('/platform-admin/dashboard')).data
export const getAdminBusinesses=async(params:{page:number;pageSize:number;search?:string;lifecycle?:string;sort?:string})=>(await api.get<BusinessPage>('/platform-admin/businesses',{params})).data
export const getAdminBusiness=async(id:string)=>(await api.get(`/platform-admin/businesses/${id}`)).data
export const setAdminBusinessStatus=async(id:string,isActive:boolean)=>(await api.patch(`/platform-admin/businesses/${id}/status`,{isActive})).data
export const renewAdminBusiness=async(id:string,days:number,base:'TODAY'|'EXPIRY')=>(await api.post(`/platform-admin/businesses/${id}/renew`,{days,base})).data
export const setAdminBusinessExpiry=async(id:string,expiresAt:string,graceDaysOverride?:number|null)=>(await api.patch(`/platform-admin/businesses/${id}/expiry`,{expiresAt,graceDaysOverride})).data
export const blockAdminBusiness=async(id:string,reason:string,note?:string)=>(await api.post(`/platform-admin/businesses/${id}/block`,{reason,note})).data
export const unblockAdminBusiness=async(id:string,expiresAt?:string)=>(await api.post(`/platform-admin/businesses/${id}/unblock`,{expiresAt})).data
export const createAdminNote=async(id:string,content:string)=>(await api.post(`/platform-admin/businesses/${id}/notes`,{content})).data
export const deleteAdminNote=async(businessId:string,id:string)=>(await api.delete(`/platform-admin/businesses/${businessId}/notes/${id}`)).data
export const getServiceSettings=async()=>(await api.get('/platform-admin/service-settings')).data
export const saveServiceSettings=async(input:{expirationWarningDays:number;defaultGraceDays:number})=>(await api.patch('/platform-admin/service-settings',input)).data
export const getAdminSubscriptions=async()=>(await api.get('/platform-admin/subscriptions')).data
export const getAdminPayments=async(status?:string)=>(await api.get('/platform-admin/payments',{params:{status}})).data
export const approveAdminPayment=async(id:string)=>(await api.post(`/platform-admin/payments/${id}/approve`)).data
export const rejectAdminPayment=async(id:string,reason:string)=>(await api.post(`/platform-admin/payments/${id}/reject`,{reason})).data
export const getBillingSettings=async()=>(await api.get('/platform-admin/billing-settings')).data
export const saveBillingSettings=async(input:Record<string,string>)=>(await api.patch('/platform-admin/billing-settings',input)).data

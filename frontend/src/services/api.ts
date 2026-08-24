import axios from 'axios'
import { env } from '../config/env'

export const API_URL = env.apiUrl

if (import.meta.env.DEV) console.info(`[TecnoDesk] API de desarrollo: ${new URL(API_URL).origin}`)

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
})

export async function checkApiHealth() {
  return (await api.get<{ ok: boolean }>('/health', { timeout: 5000 })).data.ok
}

api.interceptors.request.use(config => {
  const token = localStorage.getItem('cellufix_access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 && !String(error.config?.url).includes('/auth/login')) {
      localStorage.removeItem('cellufix_access_token')
      window.dispatchEvent(new Event('cellufix:unauthorized'))
    }
    if (error.response?.status === 403 && !error.response.data?.message) {
      error.response.data = { success: false, message: 'No tenés permisos para realizar esta acción' }
    }
    if (error.response?.status === 429) {
      const header = Number(error.response.headers?.['retry-after'])
      const seconds = Number(error.response.data?.retryAfter) || (Number.isFinite(header) ? header : undefined)
      error.response.data = {
        ...error.response.data,
        retryAfter: seconds,
        message: error.response.data?.message ?? 'Hiciste demasiadas solicitudes. Esperá unos minutos y volvé a intentar.',
      }
    }
    return Promise.reject(error)
  }
)

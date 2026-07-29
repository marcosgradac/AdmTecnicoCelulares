import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  headers: { 'Content-Type': 'application/json' }
})

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
    return Promise.reject(error)
  }
)

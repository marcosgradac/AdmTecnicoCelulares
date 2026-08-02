const configuredApiUrl = import.meta.env.VITE_API_URL

if (!configuredApiUrl) {
  throw new Error('Falta configurar VITE_API_URL')
}

const backendUrl = new URL(configuredApiUrl, window.location.origin)
if (import.meta.env.DEV && backendUrl.hostname === 'localhost' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  backendUrl.hostname = window.location.hostname
}

const configuredPath = backendUrl.pathname.replace(/\/+$/, '')
backendUrl.pathname = configuredPath === '/api' ? '' : configuredPath
const backendOrigin = backendUrl.toString().replace(/\/$/, '')

export const env = {
  backendUrl: backendOrigin,
  apiUrl: `${backendOrigin}/api`,
}

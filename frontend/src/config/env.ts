const configuredApiUrl = import.meta.env.VITE_API_URL

if (!configuredApiUrl) {
  throw new Error('Falta configurar VITE_API_URL')
}

const apiUrl = new URL(configuredApiUrl, window.location.origin)
if (import.meta.env.DEV && apiUrl.hostname === 'localhost' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  apiUrl.hostname = window.location.hostname
}

export const env = {
  apiUrl: apiUrl.toString().replace(/\/$/, ''),
}

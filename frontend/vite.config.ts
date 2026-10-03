import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { serviceWorkerPlugin } from './scripts/vite-plugin-service-worker.mjs'

export default defineConfig({
  // El service worker se genera desde `src/pwa/sw.template.js` con el SHA del
  // commit como BUILD_ID, para que dos releases produzcan dos workers distintos
  // y el aviso de nueva versión pueda aparecer.
  plugins: [react(), serviceWorkerPlugin()],
  server: { port: 5173 },
})
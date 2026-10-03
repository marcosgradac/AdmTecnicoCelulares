/**
 * Plugin de Vite que publica el service worker con el identificador del release.
 *
 * Hace dos cosas:
 *
 *  - En build: lee `src/pwa/sw.template.js`, reemplaza el marcador por el
 *    BUILD_ID y emite `dist/sw.js`. El template queda como source trackeado y
 *    el build NUNCA lo modifica, así que `git status` sigue limpio.
 *  - En desarrollo: sirve el mismo template en `/sw.js` con un id fijo, para
 *    que la app siga siendo instalable en local. El worker ya sabe no cachear
 *    nada cuando recibe `?dev=1`.
 *
 * Por qué no alcanza con dejar `sw.js` en `public/`: Vite copia `public/` tal
 * cual, sin transformarlo. Un archivo idéntico entre dos releases produce un
 * worker idéntico y el navegador nunca lo nota como nuevo.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUILD_ID_PLACEHOLDER, DEV_BUILD_ID, renderServiceWorker, resolveBuildId } from './sw-build-id.mjs'

/** Raíz del frontend: la carpeta que contiene a este archivo. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Ruta del template, relativa a la raíz del frontend. */
const TEMPLATE_PATH = 'src/pwa/sw.template.js'

/** Nombre con el que se publica. Debe ser `/sw.js`: es el que registra la app. */
const OUTPUT_NAME = 'sw.js'

/**
 * @param {object} [options]
 * @param {string} [options.root] raíz del frontend; se deduce del archivo.
 * @param {Record<string, string | undefined>} [options.environment] variables de
 *   entorno, inyectables para poder probar el plugin.
 * @param {string | null} [options.gitRoot] dónde buscar el repositorio git.
 *   Por defecto es la raíz del frontend. Es inyectable solo para poder probar
 *   el caso "no hay repositorio" desde los tests, sin mover archivos.
 * @returns {import('vite').Plugin}
 */
export function serviceWorkerPlugin({ root = ROOT, environment = process.env, gitRoot } = {}) {
  const templatePath = resolve(root, TEMPLATE_PATH)

  return {
    name: 'tecnodesk:service-worker',

    buildStart() {
      // Se lee una vez y se reusa: el template no cambia durante el build.
      const template = readFileSync(templatePath, 'utf8')
      const buildId = resolveBuildId({ environment, cwd: gitRoot === undefined ? root : gitRoot })
      const worker = renderServiceWorker(template, buildId)

      if (buildId === 'sin-build-id') {
        this.warn(
          'No se encontró VERCEL_GIT_COMMIT_SHA, GITHUB_SHA ni un repositorio git. ' +
            'El service worker se publicó con un id fijo: si dos releases dan el mismo ' +
            'contenido, el aviso de nueva versión no aparecerá.',
        )
      }

      this.emitFile({ type: 'asset', fileName: OUTPUT_NAME, source: worker })
      this.info(`service worker publicado con BUILD_ID "${buildId}"`)
    },

    /**
     * En desarrollo `public/` ya no contiene `sw.js`, así que sin esto el
     * registro fallaría con 404 y la PWA no se podría probar en local.
     */
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url || '').split('?')[0]
        if (path !== `/${OUTPUT_NAME}`) return next()

        const template = readFileSync(templatePath, 'utf8')
        const worker = renderServiceWorker(template, DEV_BUILD_ID)
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        // Nunca se cachea en desarrollo: si se cacheara, un cambio del worker
        // no llegaría al navegador hasta recargar a la fuerza.
        response.setHeader('Cache-Control', 'no-store')
        response.end(worker)
      })
    },
  }
}

export { BUILD_ID_PLACEHOLDER, DEV_BUILD_ID }
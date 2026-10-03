/**
 * Identificador del release para el service worker.
 *
 * Por qué existe: el navegador solo detecta un worker nuevo si el contenido de
 * `sw.js` cambia. Un `VERSION = 'v1'` fijo hace que dos releases produzcan el
 * mismo archivo, `registration.update()` descargue lo mismo y nunca se dispare
 * `updatefound`: el aviso "Hay una nueva versión disponible" no aparecería
 * nunca. El id tiene que salir solo del build.
 *
 * Dónde aparece el SHA, en orden de preferencia:
 *
 *  1. `VERCEL_GIT_COMMIT_SHA`: es la variable que Vercel define en cada build.
 *  2. `GITHUB_SHA`: el equivalente en GitHub Actions, por si el proyecto se
 *     migra de hosting sin cambiar el plugin.
 *  3. `git rev-parse HEAD`: build local de producción, sobre un checkout real.
 *
 * NO se usa `Date.now()`: haría que dos builds del mismo commit dieran
 * archivos distintos, y un build tiene que poder repetirse.
 *
 * Si no hay ninguna de las tres (por ejemplo, un tarball sin `.git` y sin CI),
 * se usa un hash del contenido del propio bundle. Sigue siendo determinista y
 * sigue cambiando cuando cambia el código, que es lo que importa.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

/** Marcador que el plugin reemplaza en `src/pwa/sw.template.js`. */
export const BUILD_ID_PLACEHOLDER = '__TECNODESK_BUILD_ID__'

/** Id usado en desarrollo, donde no se persiguen versiones nuevas. */
export const DEV_BUILD_ID = 'dev'

/**
 * Devuelve el SHA de HEAD, o `null` si no hay repositorio.
 *
 * No tira excepción: la ausencia de `.git` es un caso normal (CI con export de
 * archivos, un `.zip` descargado), no un error de configuración.
 *
 * Ojo con el alcance: `git` busca hacia arriba, así que un directorio dentro
 * del repo (como `node_modules`) SÍ encuentra el `.git` de más arriba.
 */
function readGitHead(cwd) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

/**
 * Elige el identificador del release.
 *
 * @param options.environment variables de entorno del proceso.
 * @param options.cwd raíz del proyecto, para buscar el repositorio.
 * @param options.contentHash hash del contenido, usado solo si no hay SHA.
 * @returns el BUILD_ID, sin comillas ni caracteres que rompan el JS.
 */
export function resolveBuildId({ environment = {}, cwd = process.cwd(), contentHash = null } = {}) {
  const fromVercel = (environment.VERCEL_GIT_COMMIT_SHA || '').trim()
  if (fromVercel) return fromVercel

  const fromGithub = (environment.GITHUB_SHA || '').trim()
  if (fromGithub) return fromGithub

  const fromGit = readGitHead(cwd)
  if (fromGit) return fromGit

  if (contentHash) return contentHash

  // Último recurso. Es un valor fijo y visible a propósito: si se llegara a
  // publicar así, dos releases darían el mismo worker y el aviso no aparecería,
  // así que tiene que poder detectarse leyendo el archivo generado.
  return 'sin-build-id'
}

/**
 * Sustituye el marcador del template por el identificador real.
 *
 * @param template contenido de `src/pwa/sw.template.js`.
 * @param buildId identificador a escribir.
 * @returns el service worker listo para publicar.
 */
export function renderServiceWorker(template, buildId) {
  if (!template.includes(BUILD_ID_PLACEHOLDER)) {
    throw new Error(
      `El template del service worker no contiene ${BUILD_ID_PLACEHOLDER}. ` +
        'Sin ese marcador el BUILD_ID no se inyecta y el worker nunca cambiaría.',
    )
  }
  return template.split(BUILD_ID_PLACEHOLDER).join(buildId)
}

/** Hash corto y estable del contenido, para el fallback sin SHA. */
export function hashContent(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 12)
}
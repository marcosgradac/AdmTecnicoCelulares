/**
 * Tipos del plugin del service worker.
 *
 * El plugin está en `.mjs` a propósito: lo ejecuta Vite directamente y también
 * lo importan los tests en Node. Como el proyecto no tiene `@types/node`, este
 * archivo le da a `tsc` lo mínimo que necesita para no tratar el módulo como
 * `any` al importarlo desde `vite.config.ts`.
 */

import type { Plugin } from 'vite'

export interface ServiceWorkerPluginOptions {
  /** Raíz del frontend. Por defecto se deduce de la ubicación del plugin. */
  root?: string
  /** Variables de entorno, inyectables para poder probar el plugin. */
  environment?: Record<string, string | undefined>
  /** Dónde buscar el repositorio git. Por defecto, la raíz del frontend. */
  gitRoot?: string | null
}

export declare function serviceWorkerPlugin(options?: ServiceWorkerPluginOptions): Plugin

export declare const BUILD_ID_PLACEHOLDER: string
export declare const DEV_BUILD_ID: string
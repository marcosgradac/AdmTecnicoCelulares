import { type NextFunction, type Request, type Response } from 'express'
import type { Express } from 'express'

export function registerErrorHandlers(app: Express) {
  app.use((_req: Request, res: Response) => res.status(404).json({ success: false, message: 'Recurso no encontrado' }))
  app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error)
    // Express attaches `type` to body-parser failures; route handlers may throw `statusCode`.
    const failure = error as { type?: string; statusCode?: unknown }
    // A malformed or oversized body is the caller's fault, not a server failure.
    if (failure.type === 'entity.parse.failed' || failure.type === 'entity.too.large') {
      return res.status(failure.type === 'entity.too.large' ? 413 : 400).json({ success: false, message: 'El contenido enviado no es válido' })
    }
    // A thrown `statusCode` is only trusted when it is a real HTTP error status; anything else
    // (0, 200, 999, NaN, a string) must not produce an absurd or crashing response.
    const candidate = failure.statusCode
    const statusCode = Number.isInteger(candidate) && Number(candidate) >= 400 && Number(candidate) <= 599 ? Number(candidate) : 500
    if (statusCode >= 500) {
      console.error('[error] No se pudo completar la petición', {
        method: req.method, path: `${req.baseUrl}${req.path}`,
        userId: req.auth?.userId, businessId: req.auth?.businessId,
        message: error?.message, stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack,
      })
    }
    return res.status(statusCode).json({ success: false, message: statusCode >= 500 ? 'Ocurrió un error inesperado' : error.message })
  })
}

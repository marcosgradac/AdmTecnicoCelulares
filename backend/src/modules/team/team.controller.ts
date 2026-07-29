import type { Request, Response } from 'express'
import { authOf } from '../../middlewares/auth'
import { createTeamMemberSchema, resetPasswordSchema, teamFiltersSchema, updateTeamMemberSchema } from './team.schema'
import { createTeamMember, getTeamMember, listTeam, resetTeamMemberPassword, TeamError, updateTeamMember } from './team.service'

const handleError = (error: unknown, res: Response) => {
  if (error instanceof TeamError) return res.status(error.status).json({ success: false, message: error.message })
  console.error('Error de Equipo', error instanceof Error ? error.message : error)
  return res.status(500).json({ success: false, message: 'Error procesando la solicitud de Equipo' })
}

export const list = async (req: Request, res: Response) => {
  const parsed = teamFiltersSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Filtros inválidos' })
  try { return res.json({ users: await listTeam(authOf(req).businessId, parsed.data) }) }
  catch (error) { return handleError(error, res) }
}
export const get = async (req: Request, res: Response) => {
  try { return res.json(await getTeamMember(authOf(req).businessId, String(req.params.id))) }
  catch (error) { return handleError(error, res) }
}
export const create = async (req: Request, res: Response) => {
  const parsed = createTeamMemberSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de usuario inválidos' })
  try { return res.status(201).json(await createTeamMember(authOf(req).businessId, parsed.data)) }
  catch (error) { return handleError(error, res) }
}
export const update = async (req: Request, res: Response) => {
  const parsed = updateTeamMemberSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Datos de usuario inválidos' })
  try { return res.json(await updateTeamMember(authOf(req).businessId, authOf(req).userId, String(req.params.id), parsed.data)) }
  catch (error) { return handleError(error, res) }
}
export const resetPassword = async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Contraseña inválida' })
  try { return res.json(await resetTeamMemberPassword(authOf(req).businessId, String(req.params.id), parsed.data.password)) }
  catch (error) { return handleError(error, res) }
}

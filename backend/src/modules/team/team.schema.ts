import { z } from 'zod'
import { PERMISSIONS } from '../../config/permissions'

export const passwordSchema = z.string().min(8).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/)
export const teamFiltersSchema = z.object({
  search: z.string().trim().optional(),
  role: z.enum(['OWNER', 'TECHNICIAN']).optional(),
  isActive: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
})
export const createTeamMemberSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().optional().nullable(),
  password: passwordSchema,
  role: z.enum(['OWNER', 'TECHNICIAN']).default('TECHNICIAN'),
  permissions: z.array(z.enum(PERMISSIONS)).optional(),
}).strict()
export const updateTeamMemberSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional().nullable(),
  role: z.enum(['OWNER', 'TECHNICIAN']).optional(),
  isActive: z.boolean().optional(),
  permissions: z.array(z.enum(PERMISSIONS)).optional(),
}).strict().refine(data => Object.keys(data).length > 0)
export const resetPasswordSchema = z.object({ password: passwordSchema }).strict()

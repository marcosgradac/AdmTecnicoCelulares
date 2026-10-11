import { z } from 'zod'

// Authority is always reread from DB; these claims identify a bounded credential only.
const lifetime = { iat: z.number().int().positive(), exp: z.number().int().positive() }
export const sessionClaims = z.object({
  userId: z.string().min(1), businessId: z.string().min(1),
  tokenVersion: z.number().int().nonnegative(), ...lifetime,
}).refine(claims => claims.exp > claims.iat)
export const passwordChangeClaims = z.object({
  purpose: z.literal('password-change'), userId: z.string().min(1),
  tokenVersion: z.number().int().nonnegative(), ...lifetime,
}).refine(claims => claims.exp > claims.iat && claims.exp - claims.iat <= 600)

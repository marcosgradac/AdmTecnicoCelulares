import type { Prisma, User } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { permissionsFor, type Permission } from '../../config/permissions'

export class TeamError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const normalizePhone = (value?: string | null) => value?.trim().replace(/\D/g, '') || null
export const serializeTeamMember = (user: User) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  fullName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  isActive: user.isActive,
  permissions: permissionsFor(user.role, user.permissions),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
})

export async function listTeam(businessId: string, filters: { search?: string; role?: 'OWNER' | 'TECHNICIAN'; isActive?: boolean }) {
  const where: Prisma.UserWhereInput = {
    businessId,
    deletedAt: null,
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.isActive === undefined ? {} : { isActive: filters.isActive }),
    ...(filters.search ? {
      OR: [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search } },
      ],
    } : {}),
  }
  return (await prisma.user.findMany({ where, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] })).map(serializeTeamMember)
}

export async function getTeamMember(businessId: string, id: string) {
  const user = await prisma.user.findFirst({ where: { id, businessId, deletedAt: null } })
  if (!user) throw new TeamError(404, 'Usuario no encontrado')
  return serializeTeamMember(user)
}

export async function createTeamMember(businessId: string, input: {
  firstName: string; lastName: string; email: string; phone?: string | null
  password: string; role: 'OWNER' | 'TECHNICIAN'; permissions?: Permission[]
}) {
  const email = input.email.toLowerCase()
  if (await prisma.user.findUnique({ where: { email } })) throw new TeamError(409, 'Ya existe una cuenta con ese correo')
  const passwordHash = await bcrypt.hash(input.password, 12)
  try {
    return serializeTeamMember(await prisma.user.create({
      data: {
        businessId,
        firstName: input.firstName,
        lastName: input.lastName,
        name: `${input.firstName} ${input.lastName}`,
        email,
        phone: normalizePhone(input.phone),
        passwordHash,
        role: input.role,
        permissions: input.role === 'TECHNICIAN' ? input.permissions ?? undefined : undefined,
      },
    }))
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      throw new TeamError(409, 'Ya existe una cuenta con ese correo')
    }
    throw error
  }
}

export async function updateTeamMember(businessId: string, actorId: string, id: string, input: {
  firstName?: string; lastName?: string; phone?: string | null
  role?: 'OWNER' | 'TECHNICIAN'; isActive?: boolean; permissions?: Permission[]
}) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${businessId}))`
    const user = await tx.user.findFirst({ where: { id, businessId, deletedAt: null } })
    if (!user) throw new TeamError(404, 'Usuario no encontrado')
    if (id === actorId && input.isActive === false) throw new TeamError(400, 'No podés desactivar tu propio usuario')
    if (user.role === 'OWNER' && input.permissions) throw new TeamError(400, 'Los permisos del propietario no pueden limitarse')

    const removesActiveOwner = user.role === 'OWNER' && user.isActive && (
      input.isActive === false || input.role === 'TECHNICIAN'
    )
    if (removesActiveOwner) {
      const activeOwners = await tx.user.count({ where: { businessId, role: 'OWNER', isActive: true } })
      if (activeOwners <= 1) throw new TeamError(409, 'El negocio debe conservar al menos un propietario activo')
    }

    const firstName = input.firstName ?? user.firstName
    const lastName = input.lastName ?? user.lastName
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.phone !== undefined ? { phone: normalizePhone(input.phone) } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.permissions !== undefined && (input.role ?? user.role) === 'TECHNICIAN' ? { permissions: input.permissions } : {}),
        ...(firstName && lastName ? { name: `${firstName} ${lastName}` } : {}),
      },
    })
    return serializeTeamMember(updated)
  }, { timeout: 15_000 })
}

export async function resetTeamMemberPassword(businessId: string, id: string, password: string) {
  const user = await prisma.user.findFirst({ where: { id, businessId, deletedAt: null } })
  if (!user) throw new TeamError(404, 'Usuario no encontrado')
  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })
  return { success: true }
}

export async function deleteTeamMember(businessId: string, actorId: string, id: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${businessId}))`
    const user = await tx.user.findFirst({ where: { id, businessId } })
    if (!user || user.deletedAt) throw new TeamError(404, 'El empleado ya no existe o ya fue eliminado')
    if (id === actorId) throw new TeamError(400, 'No podés eliminar tu propia cuenta')
    if (user.role === 'OWNER') throw new TeamError(403, 'Las cuentas propietarias no se pueden eliminar desde Empleados')
    if (user.platformRole === 'SUPER_ADMIN') throw new TeamError(403, 'La cuenta de Super Admin no se puede eliminar')

    await tx.user.update({
      where: { id: user.id },
      data: { isActive: false, deletedAt: new Date(), tokenVersion: { increment: 1 } },
    })
    await tx.subscriptionAuditLog.create({
      data: {
        actorUserId: actorId,
        businessId,
        action: 'TEAM_MEMBER_DELETED',
        metadata: { employeeId: user.id, employeeName: user.name },
      },
    })
    return { success: true }
  }, { timeout: 15_000 })
}

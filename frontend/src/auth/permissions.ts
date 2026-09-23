import type { AuthUser } from '../services/auth'

export type Permission =
  | 'repairs.view' | 'repairs.create' | 'repairs.update' | 'repairs.changeStatus' | 'repairs.shareTracking' | 'repairs.viewFinancials'
  | 'clients.view' | 'clients.create' | 'clients.update' | 'cash.view' | 'cash.create'
  | 'reports.view' | 'reports.viewSensitive' | 'settings.access' | 'settings.business.update' | 'settings.repairs.update'
  | 'team.view' | 'team.create' | 'team.update' | 'team.permissions.update' | 'team.deactivate'
  | 'commerce.view' | 'commerce.sell' | 'commerce.manage'
  | 'equipmentSales.view' | 'equipmentSales.manage' | 'equipmentSales.sell'
  | 'cash:manage' | 'payments:create'

export const hasRole = (user: AuthUser | null, ...roles: AuthUser['role'][]) =>
  Boolean(user && roles.includes(user.role))

export const canAccess = (user: AuthUser | null, permission: Permission) => {
  const normalized = permission === 'cash:manage' ? 'cash.view' : permission === 'payments:create' ? 'repairs.viewFinancials' : permission
  return Boolean(user && (user.role === 'OWNER' || user.permissions.includes(normalized)))
}

export const noModulesPath = '/admin/sin-modulos'
export const platformAdminPath = '/platform-admin'

// Cada entrada de esta tabla debe ser una pantalla que el usuario pueda abrir realmente con ese permiso.
// Quedan fuera a propósito, para no crear ciclos de redirección:
// - `reports.view`: la interfaz de Reportes se retiró y /admin/reportes sólo redirige. Usarlo como
//   destino rebotaba entre /admin/reportes y /admin/caja cuando el usuario no tenía `cash.view`.
// - `team.view`: /admin/empleados está restringido a OWNER, así que un técnico rebotaría entre
//   /admin/empleados, /inicio y /admin.
// Volver a agregar una entrada sólo cuando exista la pantalla y su guard coincida con el permiso.
const technicianStartRoutes: Array<[Permission, string]> = [
  ['repairs.view', '/admin/reparaciones'], ['clients.view', '/admin/clientes'], ['cash.view', '/admin/caja'], ['commerce.view', '/admin/comercio'], ['equipmentSales.view', '/admin/venta-equipos'],
  ['settings.access', '/admin/configuracion'],
]

// El Super Admin administra la plataforma completa, así que su destino posterior al login es /platform-admin.
// Esto no crea ciclos: /platform-admin sólo exige `platformRole === 'SUPER_ADMIN'`, y `/admin` sigue siendo
// accesible de forma manual (su negocio asociado) porque este helper no se usa para resolver `/admin`.
// Un usuario normal (platformRole `USER`) conserva exactamente el comportamiento anterior.
export const firstAllowedPath = (user: AuthUser | null) => {
  if (!user) return '/login'
  if (user.platformRole === 'SUPER_ADMIN') return platformAdminPath
  if (user.role === 'OWNER') return '/admin'
  return technicianStartRoutes.find(([permission]) => canAccess(user, permission))?.[1] ?? noModulesPath
}

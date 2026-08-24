import { api } from './api'

export type TeamRole = 'OWNER' | 'TECHNICIAN'
export interface TeamMember {
  id: string
  firstName: string | null
  lastName: string | null
  fullName: string
  email: string
  phone: string | null
  role: TeamRole
  isActive: boolean
  permissions: string[]
  createdAt: string
  updatedAt: string
}
export interface TeamFilters { search?: string; role?: TeamRole; isActive?: boolean }
export interface CreateTeamMemberInput {
  firstName: string
  lastName: string
  email: string
  phone?: string
  password: string
  role: TeamRole
  permissions?: string[]
}
export interface UpdateTeamMemberInput {
  firstName?: string
  lastName?: string
  phone?: string | null
  role?: TeamRole
  isActive?: boolean
  permissions?: string[]
}

export const getTeam = async (filters: TeamFilters = {}) =>
  (await api.get<{ users: TeamMember[] }>('/team', { params: filters })).data.users
export const getTeamMember = async (id: string) => (await api.get<TeamMember>(`/team/${id}`)).data
export const createTeamMember = async (input: CreateTeamMemberInput) => (await api.post<TeamMember>('/team', input)).data
export const updateTeamMember = async (id: string, input: UpdateTeamMemberInput) => (await api.patch<TeamMember>(`/team/${id}`, input)).data
export const resetTeamMemberPassword = async (id: string, password: string) => (await api.post<{ success: true }>(`/team/${id}/reset-password`, { password })).data

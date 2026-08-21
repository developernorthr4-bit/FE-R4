import { api } from '../lib/api'
import type { Role, UserStatus } from '../lib/roles'

export type AdminUser = {
  id: string
  username: string
  email: string
  fullName: string | null
  phone: string | null
  company: string | null
  role: Role
  status: UserStatus
  provinceScope: number[] | null
  approvedAt: string | null
  lastLoginAt: string | null
  createdAt: string
  /** BE คำนวณตามกติกา role มาให้ — ใช้ปิดปุ่ม ไม่ใช่ด่านความปลอดภัย */
  manageable: boolean
}

export async function listUsers(status?: UserStatus | 'all') {
  const res = await api.get<{ users: AdminUser[]; assignableRoles: Role[] }>(
    '/users', { params: status && status !== 'all' ? { status } : {} },
  )
  return res.data
}

export async function approveUser(id: string, role: Role, provinceScope: number[] | null) {
  const res = await api.post<{ user: AdminUser }>(`/users/${id}/approve`, { role, provinceScope })
  return res.data.user
}

export async function patchUser(id: string, patch: Partial<{
  role: Role; provinceScope: number[] | null
  fullName: string; phone: string; company: string | null
}>) {
  const res = await api.patch<{ user: AdminUser }>(`/users/${id}`, patch)
  return res.data.user
}

export async function rejectUser(id: string) {
  await api.delete(`/users/${id}`)
}

export async function suspendUser(id: string) {
  const res = await api.post<{ user: AdminUser }>(`/users/${id}/suspend`)
  return res.data.user
}

export async function activateUser(id: string) {
  const res = await api.post<{ user: AdminUser }>(`/users/${id}/activate`)
  return res.data.user
}

export async function createResetLink(id: string) {
  const res = await api.post<{ url: string; expiresAt: string; username: string }>(
    `/users/${id}/reset-link`,
  )
  return res.data
}

import { api } from '../lib/api'
import type { PageDef, PageSource } from '../lib/pages'
import type { Role, UserStatus } from '../lib/roles'

/** BE /permissions/* — dev เท่านั้น (ดู BE-R4/src/routes/permissions.ts) */

/** key → เปิด/ปิด · ไม่มี key = ไม่ได้ตั้ง (ใช้ค่าชั้นถัดไป) */
export type PageMap = Record<string, boolean>

export type PermissionGroup = {
  id: number
  name: string
  description: string | null
  updatedAt: string
  memberCount: number
  pages: PageMap
}

export type PermissionUser = {
  id: string
  username: string
  fullName: string | null
  role: Role
  status: UserStatus
  groupId: number | null
  manageable: boolean
  overrides: PageMap
  effective: Record<string, { allow: boolean; source: PageSource }>
}

export async function getPermissionPages(): Promise<PageDef[]> {
  const res = await api.get<{ pages: PageDef[] }>('/permissions/pages')
  return res.data.pages
}

export async function getPermissionGroups(): Promise<PermissionGroup[]> {
  const res = await api.get<{ groups: PermissionGroup[] }>('/permissions/groups')
  return res.data.groups
}

export async function createPermissionGroup(body: { name: string; description: string | null; pages: PageMap }) {
  const res = await api.post<{ group: { id: number; name: string } }>('/permissions/groups', body)
  return res.data.group
}

/** pages ที่ส่งไป = แทนที่ทั้งชุด */
export async function updatePermissionGroup(
  id: number,
  body: { name?: string; description?: string | null; pages?: PageMap },
) {
  await api.patch(`/permissions/groups/${id}`, body)
}

export async function deletePermissionGroup(id: number) {
  await api.delete(`/permissions/groups/${id}`)
}

export async function getPermissionUsers(): Promise<PermissionUser[]> {
  const res = await api.get<{ users: PermissionUser[] }>('/permissions/users')
  return res.data.users
}

/** แทนที่ทั้งชุด: กลุ่ม + ค่ารายคนทั้งหมด */
export async function setUserPermissions(id: string, body: { groupId: number | null; overrides: PageMap }) {
  await api.put(`/permissions/users/${id}`, body)
}

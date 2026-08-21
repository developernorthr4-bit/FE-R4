/**
 * สำเนาของกติกา role ฝั่งหน้าจอ — ต้องตรงกับ BE-R4/src/auth/roles.ts
 *
 * ที่นี่มีไว้ "ซ่อนปุ่มที่กดไม่ได้" เท่านั้น ไม่ใช่ด่านความปลอดภัย
 * BE เป็นคนบังคับจริงเสมอ ต่อให้มีคนแก้ตัวแปรใน DevTools ก็ยิงผ่านไม่ได้
 */

export const ROLES = ['viewer', 'editor', 'admin', 'dev'] as const
export type Role = (typeof ROLES)[number]

export type UserStatus = 'pending' | 'active' | 'suspended'

export const ROLE_LEVEL: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  dev: 3,
}

export const ROLE_LABEL: Record<Role, string> = {
  viewer: 'ผู้ดูข้อมูล',
  editor: 'ผู้บันทึกข้อมูล',
  admin: 'ผู้ดูแลระบบ',
  dev: 'ผู้พัฒนาระบบ',
}

export const STATUS_LABEL: Record<UserStatus, string> = {
  pending: 'รออนุมัติ',
  active: 'ใช้งานอยู่',
  suspended: 'ถูกระงับ',
}

/** คลาส badge ของ DaisyUI — สีถูกกำหนดโดยธีมจึงอ่านออกทั้งโหมดสว่างและมืดเอง */
export const STATUS_BADGE: Record<UserStatus, string> = {
  pending: 'badge-warning',
  active: 'badge-success',
  suspended: 'badge-error',
}

export function atLeast(role: Role | undefined, min: Role): boolean {
  return role !== undefined && ROLE_LEVEL[role] >= ROLE_LEVEL[min]
}

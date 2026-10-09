import { ROLE_LEVEL, type Role } from './roles'

/**
 * สิทธิ์รายหน้า (Permission Manager) ฝั่งหน้าจอ — สำเนาของ BE-R4/src/auth/pages.ts
 *
 * ที่นี่มีไว้ "ซ่อนเมนู + กันเส้นทาง" เท่านั้น BE บังคับจริงทุก endpoint (requirePage)
 * key ต้องตรงกับ PAGES ของ BE เป๊ะ — key ที่สะกดผิดจะไม่อยู่ใน pages ที่ BE ส่งมา
 * ผู้ใช้ทุกคนที่ไม่ใช่ dev จึงเข้าหน้านั้นไม่ได้เลย (dev ไม่เจอเพราะผ่านเสมอ — ทดสอบด้วยบัญชีอื่น)
 */

export type PageGroup = 'daily' | 'data' | 'track#c' | 'system'

export type PageDef = {
  key: string
  label: string
  group: PageGroup
  minRole: Role
  /** ปิดเป็นค่าเริ่มต้น — ไม่ได้ตั้งค่ารายคน/กลุ่ม = เข้าไม่ได้ (ตรงกับ BE) */
  optIn?: boolean
}

export type PageSource = 'dev' | 'ceiling' | 'override' | 'group' | 'role' | 'opt_in'

export const PAGE_SOURCE_LABEL: Record<PageSource, string> = {
  dev: 'dev เข้าได้ทุกหน้า',
  ceiling: 'เกินสิทธิ์ของ role',
  override: 'ตั้งรายคน',
  group: 'ตามกลุ่ม',
  role: 'ตาม role',
  opt_in: 'ยังไม่ได้เปิดให้',
}

/** ผู้ใช้คนนี้เข้าหน้านี้ได้ไหม — ผ่านถ้าเข้าได้ "อย่างน้อยหนึ่ง" key ที่ให้มา */
export function canPage(
  user: { role: Role; pages?: string[] } | null | undefined,
  keys: string | readonly string[] | undefined,
): boolean {
  if (!keys || (Array.isArray(keys) && keys.length === 0)) return true
  if (!user) return false
  if (user.role === 'dev') return true
  // ยังไม่ได้ข้อมูลจาก BE ตัวใหม่ — ปล่อยให้ minRole เดิมตัดสิน (BE ยังกันอยู่ดี)
  if (!user.pages) return true
  const list = typeof keys === 'string' ? [keys] : keys
  return list.some((k) => user.pages!.includes(k))
}

/**
 * ตัวตัดสินแบบเดียวกับ decidePage ของ BE — ใช้พรีวิวในหน้าตั้งค่าระหว่างกด ก่อนบันทึก
 * หลังบันทึกหน้าจอโหลดผลจริงจาก BE มาทับเสมอ ถ้าสองฝั่งไม่ตรงกัน ของ BE ชนะ
 */
export function decidePage(
  role: Role,
  page: PageDef,
  group: Record<string, boolean>,
  overrides: Record<string, boolean>,
): { allow: boolean; source: PageSource } {
  if (role === 'dev') return { allow: true, source: 'dev' }
  if (ROLE_LEVEL[role] < ROLE_LEVEL[page.minRole]) return { allow: false, source: 'ceiling' }
  if (page.key in overrides) return { allow: overrides[page.key]!, source: 'override' }
  if (page.key in group) return { allow: group[page.key]!, source: 'group' }
  if (page.optIn) return { allow: false, source: 'opt_in' }
  return { allow: true, source: 'role' }
}

export function withinCeiling(role: Role, page: PageDef): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[page.minRole]
}

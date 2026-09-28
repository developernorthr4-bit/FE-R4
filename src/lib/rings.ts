/**
 * กติกาและป้ายของ "วงสื่อสัญญาณ" ฝั่งหน้าจอ
 *
 * แยกจาก services/rings.api.ts แบบเดียวกับ lib/sites.ts — ไฟล์นี้ไม่ยิง HTTP
 * เลยสักบรรทัด เอาไปใช้ในตาราง การ์ด หรือแผนที่ได้โดยไม่ลาก axios ตามมา
 */

/** ต้องตรงกับ enum topo_type ใน BE-R4/src/db/schema/_enums.ts เป๊ะ ๆ */
export const RING_TOPOS = ['ring', 'chain', 'subring', 'subchain'] as const
export type RingTopo = (typeof RING_TOPOS)[number]

/**
 * ชื่อไทยของโทโพโลยี — วงปิด/วงเปิดคือความต่างที่มีผลกับงานจริง
 * วงปิดมีทางออกสองทาง สายขาดกลางวงลูกค้ายังไม่ล่ม วงเปิดขาดที่ไหนหลังจุดนั้นดับหมด
 */
export const TOPO_LABEL: Record<string, string> = {
  ring: 'Ring (วงปิด)',
  chain: 'Chain (วงเปิด)',
  subring: 'Subring (วงลูกปิด)',
  subchain: 'Subchain (วงลูกเปิด)',
}

export const TOPO_BADGE: Record<string, string> = {
  ring: 'badge-success',
  chain: 'badge-warning',
  subring: 'badge-info',
  subchain: 'badge-ghost',
}

/** ต้องตรงกับ enum member_role ฝั่ง BE */
export type MemberRole = 'head' | 'tail' | 'node' | 'anchor'

export const ROLE_LABEL: Record<string, string> = {
  head: 'หัววง',
  tail: 'ปลายวง',
  node: 'กลางวง',
  anchor: 'จุดเกาะวงแม่',
}

export const ROLE_BADGE: Record<string, string> = {
  head: 'badge-error',
  tail: 'badge-info',
  node: 'badge-ghost',
  anchor: 'badge-secondary',
}

/**
 * สีหมุดบนแผนที่วง — ตั้งเป็นค่าคงที่ ไม่ใช่สีจากธีม
 * เพราะสีต้องหมายถึง "บทบาทในวง" เท่านั้น และต้องตรงกับที่ตำนานบอกไว้เสมอ
 */
export const ROLE_COLOR: Record<string, string> = {
  head: '#ef4444',
  tail: '#3b82f6',
  node: '#10b981',
  anchor: '#a855f7',
}

export const ROLE_COLOR_FALLBACK = '#6b7280'

export function roleColor(role: string | null): string {
  return (role && ROLE_COLOR[role]) || ROLE_COLOR_FALLBACK
}

/** วงลูกที่เกาะวงแม่อยู่ — ต้นทางของมันคือจุดเกาะ ไม่ใช่โหนดสื่อสัญญาณ */
export function isChildRing(topoType: string | null): boolean {
  return topoType === 'subring' || topoType === 'subchain'
}

/** วงปิดมีทางออกสองทาง — ใช้ตัดสินว่าจะอธิบายปลายวงว่าเป็น "ทางออกที่สอง" ไหม */
export function isClosedRing(topoType: string | null): boolean {
  return topoType === 'ring' || topoType === 'subring'
}

// ─────────────────────────────────────────────────────────────────────────────
// คำอธิบายต้นทาง — ใช้ร่วมกันระหว่างการ์ดในหน้าสถานีและหน้ารายละเอียดวง
// ─────────────────────────────────────────────────────────────────────────────

export type SourceRow = {
  label: string
  /** null = ไฟล์ต้นทางไม่ได้ให้ข้อมูลมา ให้หน้าจอขึ้น "ไม่ระบุ" เอง ห้ามเดา */
  value: string | null
  /** สถานีที่กดไปดูได้ — null ถ้าค่านั้นไม่ใช่สถานี (เช่นรหัสโหนด) */
  siteId?: string | null
  hint?: string
}

/**
 * แปลงต้นทางของวงเป็นบรรทัดที่อ่านรู้เรื่อง
 *
 * ทำไมไม่เขียนในเทมเพลตตรง ๆ: กติกาว่าบรรทัดไหนควรขึ้นอยู่กับชนิดวง (วงเปิดไม่มี
 * ทางออกที่สอง วงลูกต้นทางคือจุดเกาะ) ถ้ากระจายอยู่ใน v-if ของสองหน้าจอ
 * วันหนึ่งสองที่จะอธิบายวงเดียวกันไม่เหมือนกัน
 */
export function sourceRows(
  source: {
    headSiteCode: string | null
    headSiteId: string | null
    headCpeName: string | null
    headNode: string | null
    tailSiteCode: string | null
    tailSiteId: string | null
    tailNode: string | null
  },
  topoType: string | null,
  anchor?: { siteCode: string | null; siteId: string | null } | null,
): SourceRow[] {
  const rows: SourceRow[] = [
    {
      label: 'โหนดต้นทาง',
      value: source.headNode,
      hint: 'โหนดสื่อสัญญาณที่หัววงวิ่งขึ้นไปหา — ถ้าโหนดนี้ล้ม วงนี้ดับทั้งวง',
    },
    {
      label: 'สถานีหัววง',
      value: source.headSiteCode,
      siteId: source.headSiteId,
      hint: 'จุดแรกของวง นับ hop จากที่นี่',
    },
  ]

  if (isChildRing(topoType) && anchor?.siteCode) {
    rows.unshift({
      label: 'เกาะวงแม่ที่',
      value: anchor.siteCode,
      siteId: anchor.siteId,
      hint: 'วงลูกแขวนอยู่บนวงแม่ที่สถานีนี้ (hop 0) — ต้นทางจริงของวงลูกคือวงแม่',
    })
  }

  rows.push({
    label: isClosedRing(topoType) ? 'ทางออกที่สอง' : 'ปลายวง',
    value: source.tailSiteCode,
    siteId: source.tailSiteId,
    hint: isClosedRing(topoType)
      ? `วงปิดออกสองทาง ปลายวงขึ้นโหนด ${source.tailNode ?? 'ที่ไฟล์ไม่ได้ระบุ'}`
      : 'วงเปิด — สายขาดที่ไหน สถานีหลังจุดนั้นดับหมด',
  })

  return rows
}

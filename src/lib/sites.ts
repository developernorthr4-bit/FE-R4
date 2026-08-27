import { atLeast, type Role } from './roles'

/**
 * ชนิดข้อมูลและกติกาของ "สถานี" ฝั่งหน้าจอ
 *
 * แยกจาก services/sites.api.ts โดยตั้งใจ — ไฟล์นี้ไม่ยิง HTTP เลยสักบรรทัด
 * จึงเอาไปใช้ในฟอร์ม ตาราง หรือเขียนเทสต์ได้โดยไม่ลาก axios ตามมาด้วย
 * (แพตเทิร์นเดียวกับ lib/events.ts)
 */

// ─────────────────────────────────────────────────────────────────────────────
// สถานะ
// ─────────────────────────────────────────────────────────────────────────────

/** ต้องตรงกับ enum site_status ใน BE-R4/src/db/schema/_enums.ts เป๊ะ ๆ */
export const SITE_STATUSES = ['active', 'planned', 'maintenance', 'decommissioned'] as const
export type SiteStatus = (typeof SITE_STATUSES)[number]

export const SITE_STATUS_LABEL: Record<SiteStatus, string> = {
  active: 'ใช้งานอยู่',
  planned: 'วางแผนไว้',
  maintenance: 'ปิดซ่อมบำรุง',
  decommissioned: 'ยกเลิกใช้งาน',
}

/** คลาส badge ของ DaisyUI — ธีมเป็นคนกำหนดสี จึงอ่านออกทั้งโหมดสว่างและมืดเอง */
export const SITE_STATUS_BADGE: Record<SiteStatus, string> = {
  active: 'badge-success',
  planned: 'badge-info',
  maintenance: 'badge-warning',
  decommissioned: 'badge-ghost',
}

// ─────────────────────────────────────────────────────────────────────────────
// รูปร่างข้อมูล
// ─────────────────────────────────────────────────────────────────────────────

/**
 * หนึ่งแถวในตารางจัดการสถานี
 *
 * bandCount / deviceCount / eventCount ไม่ได้มีไว้โชว์เฉย ๆ — กล่องยืนยันลบใช้ตัวเลข
 * ชุดนี้บอกผู้ใช้ว่ากำลังจะซ่อนอะไรไปด้วย จึงต้องมากับแถวตั้งแต่ตอน list
 * ไม่ใช่ยิงถามเพิ่มตอนกดลบ (ตอนนั้นสายเกินจะเปลี่ยนใจแล้ว)
 */
export type SiteRow = {
  id: string
  siteCode: string
  siteName: string | null
  provinceId: number
  provinceName: string
  districtName: string | null
  operatorId: number | null
  operatorName: string | null
  operatorColorSlot: number | null
  lat: number | null
  lng: number | null
  status: SiteStatus
  isVerified: boolean
  bandCount: number
  /** อุปกรณ์ CPE — คนละตารางกับ equipmentCount ที่เป็นอุปกรณ์ในตู้ */
  deviceCount: number
  eventCount: number
  /**
   * ของในสถานี นับเฉพาะที่ยังไม่ถอด (status <> 'removed')
   * ใช้บอกว่าแถวไหนควรกดเข้าไปดู — มี 1,847 สถานีที่ไม่มีตู้ในทะเบียนเลย
   */
  cabinetCount: number
  equipmentCount: number
  batteryCount: number
  /** null = ยังไม่ถูกลบ · มีค่า = ถูกซ่อนไว้ (soft delete) */
  deletedAt: string | null
}

export type SiteFilters = {
  q?: string
  province?: number | ''
  /** -1 = "ยังไม่ระบุค่าย" — ใช้ค่าพิเศษเพราะ null เป็นค่าที่ต้องกรองได้จริง */
  operator?: number | ''
  status?: SiteStatus | ''
  /** true = รวมสถานีที่ถูกลบไว้ในผลลัพธ์ด้วย (ค่าปกติคือซ่อน) */
  includeDeleted?: boolean
  limit?: number
  offset?: number
}

/** สิ่งที่ส่งขึ้นไปตอนสร้าง/แก้ไข — ตรงกับคอลัมน์ที่แก้ได้ในตาราง sites */
export type SitePayload = {
  siteCode: string
  siteName: string | null
  provinceId: number
  districtId: number | null
  operatorId: number | null
  lat: number | null
  lng: number | null
  address: string | null
  status: SiteStatus
  isVerified: boolean
  remark: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// การตรวจค่า
// ─────────────────────────────────────────────────────────────────────────────

/**
 * รหัสสถานี
 *
 * ของจริงเป็นแบบ CMI0003 (จังหวัด 3 ตัว + เลข 4 ตัว) แต่ในไฟล์ operator เจอ
 * UNOEV01 / VNO0013 ที่ไม่ตรงแบบนั้น จึงไม่บังคับรูปแบบตายตัว เอาแค่
 * ตัวพิมพ์ใหญ่ ตัวเลข และขีดกลาง — พอกันคนพิมพ์เว้นวรรคหรือภาษาไทยหลุดเข้ามา
 */
const SITE_CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/

export function normalizeSiteCode(v: string): string {
  return v.trim().toUpperCase()
}

export function checkSiteCode(v: string): string | null {
  const code = normalizeSiteCode(v)
  if (!code) return 'กรุณากรอกรหัสสถานี'
  if (code.length < 3) return 'รหัสสถานีสั้นเกินไป (อย่างน้อย 3 ตัว)'
  if (code.length > 32) return 'รหัสสถานียาวเกิน 32 ตัวอักษร'
  if (!SITE_CODE_RE.test(code)) return 'รหัสสถานีใช้ได้เฉพาะ A–Z, 0–9 และขีดกลาง'
  return null
}

/** กรอบภาคเหนือคร่าว ๆ — ชุดเดียวกับมุมมองเริ่มต้นของแผนที่ใน SiteMap.vue */
export const NORTH_BOUNDS = { latMin: 15.0, latMax: 20.5, lngMin: 97.3, lngMax: 101.8 }

export type CoordCheck = {
  /** ผิดจริง บันทึกไม่ได้ */
  error: string | null
  /** น่าสงสัยแต่ไม่ห้าม — สถานีนอกกรอบภาคเหนือมีได้ ถ้าขอบเขตขยายทีหลัง */
  warning: string | null
  lat: number | null
  lng: number | null
}

/**
 * ตรวจพิกัดเป็นคู่เสมอ ไม่แยกทีละช่อง
 *
 * เพราะความผิดพลาดที่เจอบ่อยที่สุดคือกรอกมาช่องเดียว ซึ่งดูทีละช่องแล้วไม่ผิดเลย
 * แต่พอรวมกันแล้วใช้ไม่ได้ — หมุดต้องมีทั้ง lat และ lng ถึงจะวางบนแผนที่ได้
 */
export function checkCoords(latText: string, lngText: string): CoordCheck {
  const a = latText.trim()
  const b = lngText.trim()
  const none: CoordCheck = { error: null, warning: null, lat: null, lng: null }

  if (!a && !b) return none
  if (!a || !b) {
    return { ...none, error: 'พิกัดต้องกรอกทั้งละติจูดและลองจิจูด หรือเว้นว่างทั้งคู่' }
  }

  const lat = Number(a)
  const lng = Number(b)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ...none, error: 'พิกัดต้องเป็นตัวเลข เช่น 18.78765' }
  }
  if (lat < -90 || lat > 90) return { ...none, error: 'ละติจูดต้องอยู่ระหว่าง -90 ถึง 90' }
  if (lng < -180 || lng > 180) return { ...none, error: 'ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180' }

  const outside =
    lat < NORTH_BOUNDS.latMin || lat > NORTH_BOUNDS.latMax ||
    lng < NORTH_BOUNDS.lngMin || lng > NORTH_BOUNDS.lngMax

  return {
    error: null,
    // สลับ lat/lng กันเป็นความผิดพลาดที่พบบ่อยที่สุด และมันจะตกนอกกรอบเสมอ
    warning: outside
      ? 'พิกัดนี้อยู่นอกกรอบภาคเหนือ — ตรวจว่าไม่ได้สลับละติจูดกับลองจิจูดกัน'
      : null,
    lat,
    lng,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// สิทธิ์
// ─────────────────────────────────────────────────────────────────────────────

/**
 * แก้ข้อมูลของจังหวัดนี้ได้ไหม — สำเนาของ BE-R4/src/auth/scope.ts
 *
 * มีไว้ซ่อนปุ่มที่กดไปก็โดนปฏิเสธอยู่ดี ไม่ใช่ด่านความปลอดภัย
 * BE ตรวจซ้ำทุก endpoint เสมอ ต่อให้แก้ตัวแปรใน DevTools ก็ยิงผ่านไม่ได้
 *
 * กติกา: viewer เขียนไม่ได้ · admin/dev เขียนได้ทุกจังหวัด ·
 *        editor เขียนได้เฉพาะจังหวัดใน scope · scope = null แปลว่าไม่จำกัด
 */
export function canWriteProvince(
  role: Role | undefined,
  scope: number[] | null | undefined,
  provinceId: number,
): boolean {
  if (!atLeast(role, 'editor')) return false
  if (atLeast(role, 'admin')) return true
  if (scope === null || scope === undefined) return true
  return scope.includes(provinceId)
}

/** ข้อความปฏิเสธ — ตรงกับ NO_SCOPE_MESSAGE ฝั่ง BE */
export const NO_SCOPE_MESSAGE =
  'ไม่มีสิทธิ์บันทึกข้อมูลของจังหวัดนี้ กรุณาติดต่อผู้ดูแลระบบเพื่อขอเพิ่มขอบเขต'

// ─────────────────────────────────────────────────────────────────────────────
// การแสดงผล
// ─────────────────────────────────────────────────────────────────────────────

export function formatCoords(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return '—'
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

/** ช่อง input ต้องการสตริง — null กลายเป็นค่าว่าง ไม่ใช่คำว่า "null" */
export function coordToInput(v: number | null): string {
  return v === null ? '' : String(v)
}

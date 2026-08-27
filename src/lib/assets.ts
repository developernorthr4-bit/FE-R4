/**
 * ชนิดข้อมูลและกติกาของ "ของในสถานี" — ตู้ / อุปกรณ์ / แบตเตอรี่
 *
 * แยกจาก services/sites.api.ts ด้วยเหตุผลเดียวกับ lib/sites.ts — ไฟล์นี้ไม่ยิง
 * HTTP สักบรรทัด จึงเอาไปใช้ในฟอร์ม ตาราง หรือเทสต์ได้โดยไม่ลาก axios ตามมา
 *
 * สามตารางนี้ใช้ enum สถานะและตาราง asset_types ร่วมกัน ป้ายจึงอยู่ที่เดียว
 */

// ─────────────────────────────────────────────────────────────────────────────
// สถานะ
// ─────────────────────────────────────────────────────────────────────────────

/** ต้องตรงกับ enum asset_status ใน BE-R4/src/db/schema/_enums.ts เป๊ะ ๆ — มี 5 ค่า */
export const ASSET_STATUSES = ['active', 'spare', 'faulty', 'removed', 'planned'] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  active: 'ใช้งาน',
  spare: 'สำรอง',
  faulty: 'ชำรุด',
  removed: 'ถอดออกแล้ว',
  planned: 'ตามแผน',
}

export const ASSET_STATUS_BADGE: Record<AssetStatus, string> = {
  active: 'badge-success',
  spare: 'badge-info',
  faulty: 'badge-error',
  removed: 'badge-ghost',
  planned: 'badge-warning',
}

/**
 * ค่าที่ไม่รู้จักจาก DB ต้องอ่านออก ไม่ใช่กลายเป็นช่องว่าง
 * (enum เพิ่มค่าใหม่ได้ด้วยการ migrate โดยที่หน้าจอไม่รู้เรื่อง)
 */
export function assetStatusLabel(s: string): string {
  return ASSET_STATUS_LABEL[s as AssetStatus] ?? s
}

export function assetStatusBadge(s: string): string {
  return ASSET_STATUS_BADGE[s as AssetStatus] ?? 'badge-ghost'
}

// ─────────────────────────────────────────────────────────────────────────────
// รูปร่างข้อมูล
// ─────────────────────────────────────────────────────────────────────────────

export type AssetKind = 'cabinet' | 'equipment' | 'battery'

export type AssetType = {
  id: number
  kind: AssetKind
  code: string
  nameTh: string
}

export type CabinetRow = {
  id: string
  cabinetCode: string
  assetTypeId: number | null
  typeCode: string | null
  typeName: string | null
  brand: string | null
  model: string | null
  serialNo: string | null
  installedAt: string | null
  status: string
  remark: string | null
  /**
   * นับรวมของที่ถอดแล้วด้วย ต่างจากตัวเลขในตารางหน้าจัดการสถานี
   * เพราะนี่คือตัวเลขที่บอกว่า "ลบตู้ใบนี้ได้ไหม" ไม่ใช่ "ตอนนี้มีของใช้งานกี่ชิ้น"
   */
  batteryCount: number
  equipmentCount: number
  /** ผลตรวจ PM ที่จะหายไปด้วยถ้าลบตู้ใบนี้ (on delete cascade) */
  pmCheckCount: number
}

export type BatteryRow = {
  id: string
  cabinetId: string | null
  bankCode: string | null
  assetTypeId: number | null
  typeCode: string | null
  typeName: string | null
  brand: string | null
  model: string | null
  voltageV: number | null
  capacityAh: number | null
  stringCount: number | null
  qty: number
  installDate: string | null
  expiryDate: string | null
  lastCheckDate: string | null
  healthPct: number | null
  status: string
  removedAt: string | null
  remark: string | null
  pmCheckCount: number
}

export type EquipmentRow = {
  id: string
  cabinetId: string | null
  assetTypeId: number | null
  typeCode: string | null
  typeName: string | null
  name: string | null
  brand: string | null
  model: string | null
  serialNo: string | null
  mgmtIp: string | null
  qty: number
  installedAt: string | null
  warrantyUntil: string | null
  status: string
  remark: string | null
}

export type SiteAssets = {
  site: {
    id: string
    siteCode: string
    siteName: string | null
    provinceId: number
    provinceName: string
  }
  cabinets: CabinetRow[]
  batteries: BatteryRow[]
  equipments: EquipmentRow[]
  types: AssetType[]
}

// ─────────────────────────────────────────────────────────────────────────────
// การแสดงผล
// ─────────────────────────────────────────────────────────────────────────────

export function dash(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

/** ยี่ห้อ + รุ่น ต่อกันเมื่อมีทั้งคู่ — ช่องเดียวในตารางที่แคบอยู่แล้ว */
export function brandModel(brand: string | null, model: string | null): string {
  const parts = [brand, model].filter((x): x is string => Boolean(x))
  return parts.length ? parts.join(' ') : '—'
}

/** '48.50' ที่มาจาก numeric ควรอ่านว่า 48.5 ไม่ใช่ 48.50 */
export function num(v: number | null, unit = ''): string {
  if (v === null) return '—'
  return `${v}${unit}`
}

/**
 * รหัสถัดไปของชุด — ของจริงในฐานข้อมูลคือเลขลำดับ "1".."7" ไม่ใช่รหัสทรัพย์สิน
 * เดารหัสให้ล่วงหน้าจึงถูกเกือบทุกครั้ง และผู้ใช้แก้ทับได้เสมอ
 * ถ้าเจอรหัสที่ไม่ใช่ตัวเลขปนอยู่ ปล่อยว่างดีกว่าเดามั่ว
 */
export function nextCode(existing: (string | null)[]): string {
  const nums = existing.filter((c): c is string => c !== null).map((c) => Number(c))
  if (nums.some((n) => !Number.isInteger(n) || n <= 0)) return ''
  return String((nums.length ? Math.max(...nums) : 0) + 1)
}

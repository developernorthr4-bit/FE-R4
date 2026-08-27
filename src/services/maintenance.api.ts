import { api } from '../lib/api'

/**
 * สรุปงาน PM ตู้และแบตเตอรี่ — อ่านได้ทุก role
 *
 * ข้อมูลชุดนี้ผูกกับ "ปีงบประมาณ" (1 ก.ค. – 30 มิ.ย.) ไม่ใช่สัปดาห์
 * จึงโหลดแยกจากรายงานสัปดาห์และไม่รีโหลดตอนเปลี่ยนสัปดาห์
 */

export type ProvinceProgress = { id: number; name: string; total: number; done: number }

export type BatteryStats = {
  /** จำนวนก้อนทั้งหมดในผลตรวจล่าสุด */
  banks: number
  /** วัดได้ค่าจริง (soh > 0) — ตัวหารของค่าเฉลี่ยและการกระจาย */
  readable: number
  unreadable: number
  charging: number
  /** วัดได้ 0 แต่ไม่มีหมายเหตุ — แยกไม่ออกว่าแบตตายหรือช่างไม่ได้กรอก */
  zeroNoRemark: number
  /** ไม่มีค่า SOH เลยและไม่มีหมายเหตุ = ไม่ได้วัด ต่างจากวัดแล้วได้ 0 */
  notMeasured: number
  lowSoh: number
  defectBanks: number
  avgSoh: number | null
  buckets: { bucket: string; n: number }[]
  byType: { code: string; name: string; banks: number; avgSoh: number | null; lowSoh: number }[]
  defects: { name: string; n: number }[]
}

export type ProvinceConcern = {
  id: number
  name: string
  banks: number
  avgSoh: number | null
  lowSoh: number
  defects: number
  unreadable: number
}

export type PmSummary = {
  fiscalYear: string
  fiscalYears: string[]
  window: { start: string; end: string }
  progress: { cabinetsTotal: number; done: number; provinces: ProvinceProgress[] }
  batteries: BatteryStats
  cabinets: { checked: number; withoutBattery: number; withoutBatteryReasonGiven: number }
  provinceConcerns: ProvinceConcern[]
}

export async function getPmSummary(fy?: string): Promise<PmSummary> {
  const res = await api.get<PmSummary>('/maintenance/pm-summary', {
    params: fy ? { fy } : {},
  })
  return res.data
}

/** '2026/2027' → 'ปีงบ 2569/2570' — ปีงบราชการไทยนับเป็น พ.ศ. */
export function fiscalLabel(fy: string): string {
  const [a, b] = fy.split('/')
  if (!a || !b) return fy
  return `${Number(a) + 543}/${Number(b) + 543}`
}

/** '2026-07-01' → '1 ก.ค. 2569' */
export function formatThaiDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

/**
 * ห้าหมวดของการวัด เรียงจากดีไปหาแย่
 *
 * ต้องบวกกันได้เท่าจำนวนก้อนทั้งหมดเสมอ — ตอนทำครั้งแรกลืมหมวด "ไม่ได้วัด"
 * ไป 1,954 ก้อน (10% ของทั้งหมด) แล้วไม่มีอะไรบนหน้าจอบอกว่าข้อมูลหาย
 * แถบซ้อนจึงต้องเรนเดอร์จากรายการนี้ ไม่ใช่จากตัวเลขที่หยิบมาทีละตัว
 */
export function measurementBreakdown(b: BatteryStats) {
  return [
    { key: 'readable', label: 'วัดได้ค่า', n: b.readable, tone: 'bg-success' },
    { key: 'notMeasured', label: 'ไม่ได้วัด', n: b.notMeasured, tone: 'bg-base-300' },
    { key: 'unreadable', label: 'อ่านค่าไม่ได้', n: b.unreadable, tone: 'bg-warning' },
    { key: 'zero', label: 'วัดได้ 0 ไม่มีหมายเหตุ', n: b.zeroNoRemark, tone: 'bg-error' },
    { key: 'charging', label: 'กำลังชาร์จ', n: b.charging, tone: 'bg-info' },
  ].filter((x) => x.n > 0)
}

/* ─── ทะเบียนทรัพย์สิน ──────────────────────────────────────────────────────
 *
 * คนละแกนเวลากับสรุปผลตรวจด้านบน — ตอบว่า "ตอนนี้เรามีอะไรอยู่" ไม่ใช่
 * "ปีงบนั้นตรวจแล้วเจออะไร" จึงไม่รับพารามิเตอร์ปีงบและโหลดครั้งเดียวพอ
 */

export type ProvinceAssets = {
  id: number; name: string; sites: number; cabinets: number; batteries: number
}

export type Inventory = {
  sites: {
    total: number
    withCabinet: number
    withBattery: number
    byProvince: ProvinceAssets[]
  }
  cabinets: {
    total: number
    inStock: number
    removed: number
    /** ตู้ที่ระบุชนิดไว้ — ตอนนี้ 0 จึงตอบไม่ได้ว่าตู้เป็นชนิดไหน */
    typed: number
    branded: number
    byBatteryCount: { banks: number; cabinets: number }[]
  }
  batteries: {
    total: number
    /** ก้อนที่ยังอยู่ในทะเบียน (ไม่รวมที่ถอดออกแล้ว) — ตัวหารของทุกการแจกแจง */
    inStock: number
    /** ผลรวม qty — ต่างจาก inStock เมื่อไรแปลว่า 1 แถวไม่ใช่ 1 ก้อนอีกต่อไป */
    qtySum: number
    unlinked: number
    untyped: number
    withInstallDate: number
    withExpiryDate: number
    withVoltage: number
    byStatus: { status: string; n: number }[]
    byType: { code: string | null; name: string | null; banks: number; faulty: number }[]
    byBrand: { brand: string | null; banks: number; models: number }[]
    byCapacity: { capacityAh: number | null; banks: number }[]
  }
}

export async function getInventory(): Promise<Inventory> {
  const res = await api.get<Inventory>('/maintenance/inventory')
  return res.data
}

/**
 * ป้ายสถานะย้ายไปอยู่ที่ lib/assets.ts ที่เดียว หลังหน้าจัดการตู้/แบตต้องใช้ชุดเดียวกัน
 * re-export ไว้ให้ผู้เรียกเดิมไม่ต้องเปลี่ยน import และไม่มีตารางแปลสองชุดให้เพี้ยนกัน
 */
export { assetStatusLabel } from '../lib/assets'

/** '100.00' ที่มาจาก numeric → '100Ah' · null → 'ไม่ระบุ' */
export function formatCapacity(ah: number | null): string {
  return ah === null ? 'ไม่ระบุ' : `${ah}Ah`
}

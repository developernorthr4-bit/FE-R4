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

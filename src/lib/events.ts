export type EventStatus = 'open' | 'monitoring' | 'resolved' | 'cancelled'

export const STATUS_LABEL: Record<EventStatus, string> = {
  open: 'เปิดอยู่',
  monitoring: 'เฝ้าระวัง',
  resolved: 'แก้ไขแล้ว',
  cancelled: 'ยกเลิก',
}

/** คลาส badge ของ DaisyUI — ธีมเป็นคนกำหนดสี จึงอ่านออกทั้งสองโหมดเอง */
export const STATUS_BADGE: Record<EventStatus, string> = {
  open: 'badge-error',
  monitoring: 'badge-warning',
  resolved: 'badge-success',
  cancelled: 'badge-ghost',
}

export type Lookup = { id: number; nameTh: string; nameEn?: string | null }

/**
 * ประเภทเหตุการณ์ — countsAsIncident=false คือ "ไม่มีเหตุการณ์ (ปกติ)"
 * ซึ่งบันทึกไว้เป็นหลักฐานว่าตรวจแล้ว แต่ไม่ถูกนับใน KPI ของรายงาน
 */
export type EventTypeLookup = Lookup & { countsAsIncident: boolean }
export type SeverityLookup = Lookup & { level: number; color: string | null }
export type ProvinceLookup = { id: number; code: string; nameTh: string }

export type Lookups = {
  eventTypes: EventTypeLookup[]
  rootCauses: Lookup[]
  severities: SeverityLookup[]
  provinces: ProvinceLookup[]
}

export type EventRow = {
  id: string
  eventNo: string
  eventDate: string
  title: string
  status: EventStatus
  isServiceAffecting: boolean
  durationMin: number | null
  startedAt: string | null
  restoredAt: string | null
  provinceId: number
  provinceName: string
  eventTypeId: number | null
  eventTypeName: string | null
  rootCauseId: number | null
  rootCauseName: string | null
  severityId: number | null
  severityName: string | null
  severityColor: string | null
  siteCount: number
}

export type EventDetail = {
  id: string
  eventNo: string
  eventDate: string
  provinceId: number
  eventTypeId: number | null
  rootCauseId: number | null
  severityId: number | null
  title: string
  description: string | null
  startedAt: string | null
  restoredAt: string | null
  durationMin: number | null
  status: EventStatus
  isServiceAffecting: boolean
  impactSummary: string | null
  externalRef: string | null
  createdAt: string
  updatedAt: string
}

export type EventSite = {
  siteId: string
  siteCode: string
  siteName: string | null
  impactNote: string | null
}

export type EventUpdate = {
  id: string
  note: string
  status: EventStatus | null
  updatedAtEvent: string
  createdBy: string | null
}

export type EventFilters = {
  province?: number[]
  from?: string
  to?: string
  status?: EventStatus | ''
  type?: number | ''
  cause?: number | ''
  q?: string
  limit?: number
  offset?: number
}

export type EventPayload = {
  eventDate: string
  provinceId: number
  title: string
  description: string | null
  eventTypeId: number | null
  rootCauseId: number | null
  severityId: number | null
  startedAt: string | null
  restoredAt: string | null
  status: EventStatus
  isServiceAffecting: boolean
  impactSummary: string | null
  siteIds: string[]
}

/** 195 → "3 ชม. 15 นาที" — ผู้บริหารอ่านชั่วโมงเข้าใจกว่านาทีดิบ */
export function formatDuration(min: number | null): string {
  if (min === null || min === undefined) return '—'
  if (min < 60) return `${min} นาที`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { dateStyle: 'medium' })
}

/**
 * แปลง timestamptz จาก BE เป็นค่าที่ <input type="datetime-local"> รับได้
 * input ตัวนี้ไม่รับ timezone ต้องส่งเป็นเวลาท้องถิ่นแบบไม่มี Z มิฉะนั้นช่องจะว่าง
 */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** ค่าจาก datetime-local เป็นเวลาท้องถิ่น — new Date() ตีความถูกแล้วส่ง ISO กลับไป */
export function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

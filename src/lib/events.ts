import { api } from './api'

export type EventStatus = 'open' | 'monitoring' | 'resolved' | 'cancelled'

export const STATUS_LABEL: Record<EventStatus, string> = {
  open: 'เปิดอยู่',
  monitoring: 'เฝ้าระวัง',
  resolved: 'แก้ไขแล้ว',
  cancelled: 'ยกเลิก',
}

export const STATUS_TONE: Record<EventStatus, { bg: string; fg: string }> = {
  open: { bg: 'var(--danger-bg)', fg: 'var(--danger)' },
  monitoring: { bg: 'var(--warn-bg)', fg: 'var(--warn)' },
  resolved: { bg: 'var(--ok-bg)', fg: 'var(--ok)' },
  cancelled: { bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
}

export type Lookup = { id: number; nameTh: string; nameEn?: string | null }
export type SeverityLookup = Lookup & { level: number; color: string | null }
export type ProvinceLookup = { id: number; code: string; nameTh: string }

export type Lookups = {
  eventTypes: Lookup[]
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

/**
 * lookup เปลี่ยนแทบไม่ได้เลย (ประเภท/สาเหตุ/ความรุนแรง/จังหวัด) แคชไว้ระดับโมดูล
 * ไม่งั้นเปิดหน้าฟอร์มทีก็ยิงซ้ำทุกครั้ง ทั้งที่ค่าเดิมทุกประการ
 */
let lookupsCache: Lookups | null = null
let lookupsInflight: Promise<Lookups> | null = null

export async function loadLookups(): Promise<Lookups> {
  if (lookupsCache) return lookupsCache
  lookupsInflight ??= api.get<Lookups>('/events/lookups')
    .then((res) => {
      lookupsCache = res.data
      return lookupsCache
    })
    .finally(() => { lookupsInflight = null })
  return lookupsInflight
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

export async function listEvents(f: EventFilters) {
  const params: Record<string, string | number> = {}
  if (f.province?.length) params.province = f.province.join(',')
  if (f.from) params.from = f.from
  if (f.to) params.to = f.to
  if (f.status) params.status = f.status
  if (f.type) params.type = f.type
  if (f.cause) params.cause = f.cause
  if (f.q?.trim()) params.q = f.q.trim()
  params.limit = f.limit ?? 50
  params.offset = f.offset ?? 0

  const res = await api.get<{ events: EventRow[]; total: number; limit: number; offset: number }>(
    '/events', { params },
  )
  return res.data
}

export async function getEvent(id: string) {
  const res = await api.get<{ event: EventDetail; sites: EventSite[]; updates: EventUpdate[] }>(
    `/events/${id}`,
  )
  return res.data
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

export async function createEvent(payload: EventPayload) {
  const res = await api.post<{ event: EventDetail }>('/events', payload)
  return res.data.event
}

export async function updateEvent(id: string, payload: Partial<EventPayload>) {
  const res = await api.patch<{ event: EventDetail }>(`/events/${id}`, payload)
  return res.data.event
}

export async function addEventUpdate(id: string, note: string, status?: EventStatus) {
  const res = await api.post<{ update: EventUpdate }>(`/events/${id}/updates`, { note, status })
  return res.data.update
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

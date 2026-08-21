import { api } from '../lib/api'
import type {
  EventDetail, EventFilters, EventPayload, EventRow, EventSite, EventStatus,
  EventUpdate, Lookups,
} from '../lib/events'

/**
 * lookup (ประเภท/สาเหตุ/ความรุนแรง/จังหวัด) เปลี่ยนแทบไม่ได้เลย แคชไว้ระดับโมดูล
 * ไม่งั้นเปิดหน้าฟอร์มทีก็ยิงซ้ำทุกครั้งทั้งที่ค่าเดิมทุกประการ
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

export async function createEvent(payload: EventPayload) {
  const res = await api.post<{ event: EventDetail }>('/events', payload)
  return res.data.event
}

export async function updateEvent(id: string, payload: Partial<EventPayload>) {
  const res = await api.patch<{ event: EventDetail }>(`/events/${id}`, payload)
  return res.data.event
}

/** ลบถาวร — ใช้แก้กรณีลงข้อมูลผิด ไม่ใช่การปิดงาน (ปิดงานใช้สถานะ "ยกเลิก") */
export async function deleteEvent(id: string) {
  await api.delete(`/events/${id}`)
}

export async function addEventUpdate(id: string, note: string, status?: EventStatus) {
  const res = await api.post<{ update: EventUpdate }>(`/events/${id}/updates`, { note, status })
  return res.data.update
}

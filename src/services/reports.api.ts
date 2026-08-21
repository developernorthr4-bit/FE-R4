import { api } from '../lib/api'

export type WeekTotals = {
  eventCount: number
  openCount: number
  resolvedCount: number
  serviceAffectingCount: number
  totalDurationMin: number
  affectedSiteCount: number
}

export type Breakdown = { id: number | null; name: string; count: number; durationMin: number }

export type Coverage = {
  /** วันทำการที่ผ่านมาแล้วในสัปดาห์นี้ — สัปดาห์ปัจจุบันจะน้อยกว่า 5 */
  workingDays: number
  provinceCount: number
  complete: number
  missing: { id: number; name: string; reported: number }[]
}

export type WeekSummary = {
  year: number
  week: number
  weekStart: string
  totals: WeekTotals
  byProvince: Breakdown[]
  bySubRegion: Breakdown[]
  byRootCause: Breakdown[]
  byEventType: Breakdown[]
  coverage: Coverage
}

export type SavedReport = {
  narrative: string | null
  status: 'draft' | 'published'
  publishedAt: string | null
  snapshot: WeekSummary | null
}

export type WeeklyResponse = {
  current: WeekSummary
  previous: WeekTotals
  report: SavedReport | null
  isCurrentWeek: boolean
}

export type TrendPoint = {
  year: number
  week: number
  eventCount: number
  totalDurationMin: number
  openCount: number
}

export async function getWeekly(year: number, week: number) {
  const res = await api.get<WeeklyResponse>('/reports/weekly', { params: { year, week } })
  return res.data
}

export async function getTrend(year: number, week: number, weeks = 8) {
  const res = await api.get<{ points: TrendPoint[] }>('/reports/weekly/trend', {
    params: { year, week, weeks },
  })
  return res.data.points
}

export async function saveNarrative(year: number, week: number, narrative: string) {
  const res = await api.put<{ narrative: string | null; status: 'draft' | 'published' }>(
    '/reports/weekly', { year, week, narrative },
  )
  return res.data
}

export async function publishWeek(year: number, week: number, narrative: string) {
  const res = await api.post<{
    status: 'published'; publishedAt: string; narrative: string | null; snapshot: WeekSummary
  }>('/reports/weekly/publish', { year, week, narrative })
  return res.data
}

/**
 * เทียบตัวเลขสัปดาห์นี้กับสัปดาห์ก่อน
 *
 * คืน null เมื่อสัปดาห์ก่อนเป็น 0 — "เพิ่มขึ้น ∞%" ไม่มีความหมายกับผู้อ่าน
 * ให้หน้าจอแสดงว่าเทียบไม่ได้แทนที่จะโชว์ตัวเลขหลอกตา
 */
export function delta(now: number, before: number): { diff: number; pct: number | null } {
  const diff = now - before
  return { diff, pct: before === 0 ? null : Math.round((diff / before) * 100) }
}

/** 195 → "3 ชม. 15 น." — ผู้บริหารอ่านชั่วโมงเข้าใจกว่านาทีดิบ */
export function formatMinutes(min: number): string {
  if (!min) return '0'
  if (min < 60) return `${min} น.`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} น.`
}

export function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('th-TH', {
      day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}),
    })
  return `${fmt(start, false)} – ${fmt(end, true)}`
}

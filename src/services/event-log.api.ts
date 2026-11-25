import { api } from '../lib/api'

/**
 * บันทึก Event รายวัน (จังหวัด × วัน) + Dashboard รายสัปดาห์ จันทร์–อาทิตย์
 * กฎจัดหมวด/นับเหตุทั้งหมดอยู่ที่ BE-R4/src/event-log/ — หน้าจอแสดงตามที่ BE ตัดสินมา
 */
export type EventProvince = { id: number; code: string; nameTh: string }

export type EventCell = {
  provinceId: number
  date: string
  isNormal: boolean
  /** ปกติ: หมายเหตุ (ว่างได้) · มีเหตุ: ข้อความเหตุการณ์ (มีเสมอ) */
  note: string | null
  isHighlight: boolean
  source: 'web' | 'import'
  /** ส่งกลับไปตอนบันทึก — ไม่ตรงกับในฐาน = มีคนแก้ก่อนหน้า */
  rev: string
  updatedAt: string
  updatedBy: string | null
}

export type EventWeekNote = { note: string; rev: string; updatedAt: string; updatedBy: string | null }

export type EventWeek = {
  weekStart: string
  year: number
  week: number
  today: string
  provinces: (EventProvince & { canWrite: boolean })[]
  /** รวมวันอาทิตย์ก่อนหน้า 1 วัน ไว้ให้ปุ่ม "คัดลอกจากเมื่อวาน" ของวันจันทร์ */
  cells: EventCell[]
  weekNote: EventWeekNote | null
  canWriteWeekNote: boolean
}

export type EventCellInput = {
  provinceId: number
  date: string
  /** ว่าง = ล้างช่อง */
  text: string
  /** ไม่ส่ง = ให้ระบบดูจากข้อความ */
  isNormal?: boolean
  /** ไม่ส่ง = คงเดิม */
  isHighlight?: boolean
  rev: string | null
}

export type SaveCellsResult = {
  /** สถานะล่าสุดของช่องที่ส่งไป · ช่องที่ไม่อยู่ในนี้ = ว่าง */
  cells: EventCell[]
  /** มีคนแก้ก่อนหน้า — ช่องพวกนี้ไม่ถูกเขียน */
  conflicts: { provinceId: number; date: string }[]
}

export async function getEventWeek(start: string): Promise<EventWeek> {
  const res = await api.get<EventWeek>('/event-log/week', { params: { start } })
  return res.data
}

export async function saveEventCells(cells: EventCellInput[]): Promise<SaveCellsResult> {
  const res = await api.put<SaveCellsResult>('/event-log/cells', { cells })
  return res.data
}

export async function saveEventWeekNote(weekStart: string, note: string, rev: string | null): Promise<EventWeekNote | null> {
  const res = await api.put<{ weekNote: EventWeekNote | null }>('/event-log/week-note', { weekStart, note, rev })
  return res.data.weekNote
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export type EventTotals = {
  /** ช่องที่ถึงกำหนดบันทึกแล้ว (ไม่รวมวันอนาคต) */
  due: number
  recorded: number
  events: number
  heavy: number
  provincesWithEvent: number
}

export type EventItem = {
  provinceId: number
  /** ข้อความเดิมที่ติดกันหลายวันรวมเป็นรายการเดียว */
  dates: string[]
  note: string
  isHighlight: boolean
  /** 1–4 = ระดับ · 0 = พูดถึงแต่ไม่บอกระดับ · null = ไม่พูดถึง */
  sa: number | null
  nsa: number | null
  heavy: boolean
  categories: number[]
  ticketNos: string[]
}

export type EventDashCell = {
  provinceId: number
  date: string
  isNormal: boolean
  note: string | null
  isHighlight: boolean
  heavy: boolean
  categories: number[]
  sa: number | null
}

export type EventTicketStats = {
  sa1: number
  sa2: number
  downMin: number
  byProvince: Record<number, { sa1: number; sa2: number; downMin: number }>
  /** Ticket ใบล่าสุดในระบบ — เก่ากว่าสัปดาห์ที่ดู = ตัวเลขต่ำกว่าจริง */
  lastOpenedAt: string | null
  knownTicketNos: string[]
}

export type EventDashboard = {
  weekStart: string
  year: number
  week: number
  today: string
  provinces: EventProvince[]
  weekNote: string | null
  totals: EventTotals
  prev: EventTotals
  categories: { id: number; label: string; count: number }[]
  /** เรียงจากหนักสุดแล้ว */
  items: EventItem[]
  cells: EventDashCell[]
  /** null = ไม่มีสิทธิ์หน้า Ticket */
  tickets: EventTicketStats | null
}

export async function getEventDashboard(start: string): Promise<EventDashboard> {
  const res = await api.get<EventDashboard>('/event-log/dashboard', { params: { start } })
  return res.data
}

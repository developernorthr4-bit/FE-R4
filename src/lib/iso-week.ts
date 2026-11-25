/**
 * สัปดาห์ ISO (จันทร์–อาทิตย์) — สำเนาฝั่งเว็บของ BE-R4/src/event-log/week.ts
 * วันที่เป็นสตริง 'ปปปป-ดด-วว' คิดด้วย UTC ล้วน ๆ เพราะไม่มีเวลาในวันเกี่ยวข้อง (กันเลื่อนวันตามเขตเวลาเครื่อง)
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY = 86_400_000
const DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'] as const
const MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'] as const

const utc = (date: string) => new Date(`${date}T00:00:00Z`)

/** เป็นวันที่จริง (2026-02-30 ไม่ผ่าน) */
export function isDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false
  const d = utc(v)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export function addDays(date: string, n: number): string {
  return new Date(utc(date).getTime() + n * DAY).toISOString().slice(0, 10)
}

/** วันจันทร์ของสัปดาห์ที่วันนั้นอยู่ */
export function mondayOf(date: string): string {
  return addDays(date, 1 - (utc(date).getUTCDay() || 7))
}

/** ปี/เลขสัปดาห์ ISO — ปีอาจไม่ตรงกับปีปฏิทินช่วงปลายธันวา/ต้นมกรา */
export function isoWeekOf(date: string): { year: number; week: number } {
  const thu = utc(addDays(mondayOf(date), 3))
  const start = Date.UTC(thu.getUTCFullYear(), 0, 1)
  return { year: thu.getUTCFullYear(), week: Math.ceil(((thu.getTime() - start) / DAY + 1) / 7) }
}

/** ปี + เลขสัปดาห์ ISO → วันจันทร์ (สัปดาห์ที่ 1 คือสัปดาห์ที่มีวันที่ 4 ม.ค.) */
export function weekStartOf(year: number, week: number): string {
  return addDays(mondayOf(`${year}-01-04`), (week - 1) * 7)
}

/** 7 วัน จันทร์ → อาทิตย์ */
export function daysOf(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

/** "จ." */
export const dowOf = (date: string): string => DOW[utc(date).getUTCDay()]!

/** "23 พ.ย." */
export function formatDayMonth(date: string): string {
  const d = utc(date)
  return `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`
}

/** "จ. 23 พ.ย." */
export const formatDowDay = (date: string): string => `${dowOf(date)} ${formatDayMonth(date)}`

/** "16–22 พ.ย. 2569" · "28 ธ.ค. 2569 – 3 ม.ค. 2570" */
export function formatRange(from: string, to: string): string {
  const a = utc(from)
  const b = utc(to)
  const be = (d: Date) => d.getUTCFullYear() + 543
  if (from === to) return `${formatDayMonth(from)} ${be(a)}`
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${formatDayMonth(from)} ${be(a)} – ${formatDayMonth(to)} ${be(b)}`
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${formatDayMonth(from)} – ${formatDayMonth(to)} ${be(b)}`
  return `${a.getUTCDate()}–${formatDayMonth(to)} ${be(b)}`
}

export const formatWeekRange = (weekStart: string): string => formatRange(weekStart, addDays(weekStart, 6))

/** วันที่เกิดเหตุ (ติดกันเสมอ) → "21 พ.ย." หรือ "18–20 ก.ย." */
export function formatDates(dates: string[]): string {
  const from = dates[0]
  const to = dates[dates.length - 1]
  if (!from || !to) return ''
  if (from === to) return formatDayMonth(from)
  return from.slice(0, 7) === to.slice(0, 7)
    ? `${utc(from).getUTCDate()}–${formatDayMonth(to)}`
    : `${formatDayMonth(from)} – ${formatDayMonth(to)}`
}

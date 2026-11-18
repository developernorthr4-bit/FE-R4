/**
 * จัดรูปวันที่/เวลาที่ใช้ร่วมกันทั้งเว็บ — แสดงเป็นภาษาไทย พ.ศ. ตามเวลาเครื่อง
 *
 * ฟังก์ชันระยะเวลา (formatDuration ใน events/olt/routing · formatMinutes · fmtDowntime)
 * ตั้งใจให้ต่างกันตามหน้า (หน่วยรับ นาที/วินาที · "นาที" vs "น." · มี "วัน") จึงไม่รวมไว้ที่นี่
 */

/** timestamptz → "12 ก.ค. 2569 14:20" */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * วันที่ล้วน 'ปปปป-ดด-วว' → "12 ก.ค. 2569"
 * ต่อ T00:00:00 ให้ตีความเป็นเวลาท้องถิ่น (ไม่งั้นได้ UTC แล้วเลื่อนวันได้) —
 * **ห้ามส่ง timestamptz เต็มเข้ามา** จะได้ Invalid Date ใช้ formatDay แทน
 */
export function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { dateStyle: 'medium' })
}

/** timestamptz → วันที่อย่างเดียว "12 ก.ค. 2569" · ไม่มีค่า = fallback (บางที่ต้องการค่าว่าง) */
export function formatDay(iso: string | null | undefined, fallback = '—'): string {
  if (!iso) return fallback
  return new Date(iso).toLocaleDateString('th-TH', { dateStyle: 'medium' })
}

/**
 * "3 วันที่แล้ว" / "เมื่อวาน 14:20" / "12 ก.ค. 2569"
 *
 * ใช้คู่กับ formatDateTime เสมอ (เช่นใส่ใน title) — ค่าสัมพัทธ์อ่านเร็ว แต่ตอบไม่ได้
 * ว่า "แล้วมันวันไหนกันแน่" เมื่อคนอ่านต้องไปเทียบกับเอกสารอื่น
 */
export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const sec = Math.round((now - t) / 1000)
  if (sec < 45) return 'เมื่อสักครู่'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} นาทีที่แล้ว`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} ชม. ที่แล้ว`
  const day = Math.round(hr / 24)
  const hhmm = new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  if (day === 1) return `เมื่อวาน ${hhmm}`
  if (day < 7) return `${day} วันที่แล้ว`
  // เกินสัปดาห์ค่าสัมพัทธ์เริ่มไร้ประโยชน์ ("47 วันที่แล้ว") — บอกวันที่ไปเลย
  return new Date(iso).toLocaleDateString('th-TH', { dateStyle: 'medium' })
}

/**
 * วันนี้ตามเวลาเครื่อง 'ปปปป-ดด-วว' (ไม่ใช่ UTC — toISOString() ช่วง 00:00–06:59 เวลาไทยได้วันของเมื่อวาน)
 * sv-SE ให้รูปแบบ ปปปป-ดด-วว พอดี ใช้กับ <input type="date"> และชื่อไฟล์ได้ตรง ๆ
 */
export function todayLocal(): string {
  return new Date().toLocaleDateString('sv-SE')
}

/** พรุ่งนี้ตามเวลาเครื่อง 'ปปปป-ดด-วว' */
export function tomorrowLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('sv-SE')
}

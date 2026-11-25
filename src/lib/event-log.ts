import type { EventCell } from '../services/event-log.api'
import { addDays, isDate } from './iso-week'

/** ของใช้ร่วมของหน้าบันทึก Event — ข้อความในช่อง สถานะ และการอ่านบล็อกที่คัดลอกจาก Google Sheet */

export const cellKey = (provinceId: number, date: string): string => `${provinceId}|${date}`

/** ข้อความที่แสดง/แก้ไขในช่อง — ปกติที่มีหมายเหตุขึ้นต้นด้วย "ปกติ" เหมือนที่พิมพ์ในชีต */
export function cellText(c: Pick<EventCell, 'isNormal' | 'note'> | null | undefined): string {
  if (!c) return ''
  if (!c.isNormal) return c.note ?? ''
  return c.note ? `ปกติ ${c.note}` : 'ปกติ'
}

/** 4 สถานะของช่อง — สีคู่กับไอคอน/ข้อความเสมอ ไม่ให้สีสื่อความหมายอย่างเดียว */
export type CellState = 'normal' | 'event' | 'heavy' | 'empty'
export const STATE_LABEL: Record<CellState, string> = {
  normal: 'ปกติ', event: 'มีเหตุ', heavy: 'เหตุหนัก (SA1/SA2 หรือ ★)', empty: 'ยังไม่บันทึก',
}

export function stateOf(c: { isNormal: boolean; heavy: boolean } | null | undefined): CellState {
  if (!c) return 'empty'
  if (c.isNormal) return 'normal'
  return c.heavy ? 'heavy' : 'event'
}

/** ตัดข้อความเป็นท่อน ๆ แยกเลข Ticket ที่มีจริงในระบบออกมาทำลิงก์ */
export function splitTicketNos(note: string, known: ReadonlySet<string>): { text: string; ticketNo: string | null }[] {
  if (!known.size) return [{ text: note, ticketNo: null }]
  const out: { text: string; ticketNo: string | null }[] = []
  let last = 0
  // ไม่ใช้ lookbehind — Safari ก่อน 16.4 อ่านไม่ได้แล้วพังทั้งไฟล์ตอนโหลด
  for (const m of note.matchAll(/(?:INC|TT)\d{9,}/gi)) {
    const no = m[0].toUpperCase()
    if (!known.has(no) || /[A-Za-z0-9]/.test(note[m.index - 1] ?? '')) continue
    if (m.index > last) out.push({ text: note.slice(last, m.index), ticketNo: null })
    out.push({ text: m[0], ticketNo: no })
    last = m.index + m[0].length
  }
  if (last < note.length) out.push({ text: note.slice(last), ticketNo: null })
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// วางจาก Google Sheet / Excel
// ─────────────────────────────────────────────────────────────────────────────

/** ข้อความในคลิปบอร์ด (TSV) → ตาราง · ช่องที่มีหลายบรรทัดถูกครอบด้วย "…" ("" = เครื่องหมายคำพูดจริง) */
export function parseTsv(raw: string): string[][] {
  const s = raw.replace(/\r\n?/g, '\n').replace(/\n$/, '')
  const rows: string[][] = [[]]
  let i = 0
  while (i <= s.length) {
    let cell = ''
    if (s[i] === '"' && closesQuoted(s, i)) {
      i++
      for (;;) {
        if (s[i] === '"' && s[i + 1] === '"') { cell += '"'; i += 2 } else if (s[i] === '"') { i++; break } else cell += s[i++]
      }
    } else {
      while (i < s.length && s[i] !== '\t' && s[i] !== '\n') cell += s[i++]
    }
    rows[rows.length - 1]!.push(cell)
    if (i >= s.length) break
    if (s[i] === '\n') rows.push([])
    i++
  }
  return rows
}

/** ช่องขึ้นต้นด้วย " แต่เป็นข้อความธรรมดา (เช่น "ด่วน" ไฟดับ) ไม่ใช่ช่องที่ชีตครอบให้ → ต้องปิดพอดีที่ขอบช่อง */
function closesQuoted(s: string, start: number): boolean {
  for (let i = start + 1; i < s.length; i++) {
    if (s[i] !== '"') continue
    if (s[i + 1] === '"') { i++; continue }
    return i + 1 === s.length || s[i + 1] === '\t' || s[i + 1] === '\n'
  }
  return false
}

/** หัวคอลัมน์วันที่ในชีต: 23/11/26 · 23/11/2026 · 23/11/2569 · 2026-11-23 */
export function parseSheetDate(raw: string): string | null {
  const t = raw.trim()
  if (isDate(t)) return t
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(t)
  if (!m) return null
  let y = Number(m[3])
  // ปีสองหลัก: 26 = ค.ศ. 2026 · 69 = พ.ศ. 2569
  if (y < 100) y = y >= 60 ? 2500 + y : 2000 + y
  if (y > 2400) y -= 543
  const d = `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
  return isDate(d) ? d : null
}

export type PasteTarget = { provinceId: number; date: string; text: string }
export type PasteMap = {
  targets: PasteTarget[]
  /** อ่านตำแหน่งจากอะไร — บอกผู้ใช้ก่อนยืนยัน */
  byCode: boolean
  byDate: boolean
  /** เหตุผลที่บางส่วนไม่ถูกวาง */
  skipped: string[]
}

/**
 * บล็อกที่คัดลอกมา → ช่องปลายทาง
 *
 * - มีคอลัมน์รหัสจังหวัด (CMI, CRI, …) → จับแถวตามรหัส ไม่ใช่ตามตำแหน่ง
 * - มีแถวหัววันที่ → จับคอลัมน์ตามวันที่ · วันนอกสัปดาห์ที่เปิดอยู่ไม่วาง
 * - ไม่มีทั้งคู่ → เริ่มที่ช่องที่เลือกไว้ ไล่ลงและไปทางขวา
 * - ช่องว่างในบล็อก = ข้าม (ไม่ล้างของเดิม)
 */
export function mapPaste(
  grid: string[][],
  provinces: { id: number; code: string; nameTh: string }[],
  days: string[],
  start: { row: number; col: number },
): PasteMap {
  const skipped: string[] = []
  const codeOf = new Map(provinces.flatMap((p) => [[p.code.toUpperCase(), p.id], [p.nameTh, p.id]] as [string, number][]))
  const provOf = (raw: string | undefined) => {
    const t = (raw ?? '').trim()
    return codeOf.get(t.toUpperCase()) ?? codeOf.get(t)
  }

  // หัวตาราง: แถวที่ขึ้นต้น Province หรือแถวแรกที่มีแต่วันที่ · แถวเหนือหัว (หมายเหตุทั้งภาค) ตัดทิ้ง
  let rows = grid.filter((r) => r.some((c) => c.trim()))
  let header: string[] | null = null
  const h = rows.slice(0, 4).findIndex((r) => r[0]?.trim().toLowerCase() === 'province')
  if (h >= 0) {
    header = rows[h]!
    if (h > 0) skipped.push('ข้อความเหนือหัวตารางไม่ได้วาง — ถ้าเป็นหมายเหตุทั้งภาค ให้ใส่ในช่องหมายเหตุทั้งภาค')
    rows = rows.slice(h + 1)
  } else if (rows[0]) {
    const filled = rows[0].filter((c) => c.trim())
    if (filled.length && filled.every((c) => parseSheetDate(c))) { header = rows[0]; rows = rows.slice(1) }
  }

  const byCode = header?.[0]?.trim().toLowerCase() === 'province' || (rows.length > 0 && rows.every((r) => provOf(r[0]) !== undefined))
  const firstCol = byCode ? 1 : 0
  const headDates = header ? header.slice(firstCol).map(parseSheetDate) : []
  const byDate = headDates.some((d) => d !== null)

  const inWeek = new Set(days)
  const outside = new Set<string>()
  const colDate = (i: number): string | null => {
    if (byDate) {
      const d = headDates[i] ?? null
      if (d && !inWeek.has(d)) { outside.add(d); return null }
      return d
    }
    const col = (byCode ? 0 : start.col) + i
    return days[col] ?? null
  }

  const targets: PasteTarget[] = []
  const unknownRows: string[] = []
  let overflow = 0
  rows.forEach((r, ri) => {
    const provinceId = byCode ? provOf(r[0]) : provinces[start.row + ri]?.id
    if (provinceId === undefined) {
      if (byCode) unknownRows.push((r[0] ?? '').trim() || `แถวที่ ${ri + 1}`)
      else overflow++
      return
    }
    r.slice(firstCol).forEach((raw, ci) => {
      const text = raw.trim()
      if (!text) return
      const date = colDate(ci)
      if (!date) { if (!byDate) overflow++; return }
      targets.push({ provinceId, date, text })
    })
  })
  if (outside.size) skipped.push(`วันที่นอกสัปดาห์นี้ ${[...outside].sort().join(', ')}`)
  if (unknownRows.length) skipped.push(`ไม่รู้จักจังหวัด: ${unknownRows.join(', ')}`)
  if (overflow) skipped.push(`เกินขอบตาราง ${overflow} ช่อง`)
  return { targets, byCode, byDate, skipped }
}

/** วันก่อนหน้า — ใช้กับปุ่มคัดลอกจากเมื่อวาน */
export const yesterdayOf = (date: string): string => addDays(date, -1)

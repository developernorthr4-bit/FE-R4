/**
 * ชนิดข้อมูลและป้ายกำกับของ OLT Bot — แหล่งความจริงชุดเดียวของฝั่งหน้าจอ
 *
 * แยกออกมาจาก view ด้วยเหตุผลเดียวกับ lib/assets.ts และ lib/sites.ts:
 * ป้ายสถานะกับกฎการแปลงข้อมูลไม่ควรอยู่ในไฟล์ .vue เพราะเอาไปใช้ซ้ำไม่ได้
 * และเขียนเทสต์ไม่ได้ถ้าไม่ยกทั้ง component ขึ้นมา
 */

export type OltJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export type OltVerdict = 'Pass' | 'Not pass' | 'NEW L2' | 'Down' | 'ERROR'

export type OltRow = {
  val: string
  rxMax: number | null
  rxMin: number | null
  verdict: OltVerdict
  online: number
  occupied: number
  status: string
}

export type OltJob = {
  id: string
  status: OltJobStatus
  total: number
  done: number
  threshold: number
  spantreeUsername: string
  error: string | null
  createdBy: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  createdByName: string | null
  createdByUsername: string | null
  /** 0 = ไม่ได้อยู่ในคิวแล้ว (กำลังทำอยู่ หรือจบไปแล้ว) */
  queuePosition: number
}

export type OltJobDetail = OltJob & {
  vals: string[]
  results: OltRow[] | null
}

export const JOB_STATUS_LABEL: Record<OltJobStatus, string> = {
  queued: 'รอคิว',
  running: 'กำลังทำ',
  done: 'เสร็จแล้ว',
  failed: 'ไม่สำเร็จ',
  cancelled: 'ยกเลิกแล้ว',
}

export const JOB_STATUS_BADGE: Record<OltJobStatus, string> = {
  queued: 'badge-ghost',
  running: 'badge-info',
  done: 'badge-success',
  failed: 'badge-error',
  cancelled: 'badge-warning',
}

export const VERDICT_BADGE: Record<OltVerdict, string> = {
  Pass: 'badge-success',
  'Not pass': 'badge-error',
  Down: 'badge-warning',
  'NEW L2': 'badge-info',
  ERROR: 'badge-ghost',
}

/** งานที่ยังเดินอยู่ — ใช้ตัดสินว่าต้องถามความคืบหน้าต่อหรือหยุดถามได้แล้ว */
export function isLive(status: OltJobStatus): boolean {
  return status === 'queued' || status === 'running'
}

/** รูปแบบรหัส val — ต้องตรงกับ VAL_RE ฝั่ง BE เป๊ะ ๆ */
export const VAL_RE = /^[A-Z0-9]{11}$/

/**
 * แยกก้อนข้อความที่ผู้ใช้วางมาเป็นรายการ val
 *
 * ทำฝั่งหน้าจอด้วยทั้งที่ BE ตรวจซ้ำอยู่แล้ว เพราะอยากให้เห็นทันทีว่าวางมากี่ตัว
 * และตัวไหนพิมพ์ผิด ตั้งแต่ก่อนกดส่ง — ไม่ใช่กดส่งแล้วโดนตีกลับ
 * กติกาการตัดคำและการตัดตัวซ้ำต้องเหมือน parseVals ใน routes/olt.ts
 */
export function splitVals(raw: string): { vals: string[]; bad: string[] } {
  const seen = new Set<string>()
  const bad: string[] = []

  for (const piece of raw.split(/[\s,;]+/)) {
    const val = piece.trim().toUpperCase()
    if (!val) continue
    if (VAL_RE.test(val)) seen.add(val)
    else bad.push(val)
  }

  return { vals: [...seen], bad }
}

/**
 * เดาว่าเหลืออีกกี่วินาที
 *
 * ถ้าเริ่มทำไปแล้วให้คิดจากความเร็วจริงของงานนี้ ไม่ใช่ค่าคงที่ที่ตั้งไว้ —
 * ความเร็วขึ้นกับว่าเซิร์ฟเวอร์อยู่ที่ไหนและปลายทางว่างแค่ไหน วัดจากของจริง
 * แม่นกว่าเดา ส่วนตอนยังไม่เริ่มก็ได้แต่ใช้ค่าที่วัดไว้ตอนทดสอบ
 */
const FALLBACK_SEC_PER_VAL = 1.8

export function etaSeconds(job: Pick<OltJob, 'done' | 'total' | 'startedAt' | 'status'>): number | null {
  if (job.status !== 'running') return null

  const remaining = job.total - job.done
  if (remaining <= 0) return 0

  if (job.startedAt && job.done > 0) {
    const elapsed = (Date.now() - new Date(job.startedAt).getTime()) / 1000
    return Math.round((elapsed / job.done) * remaining)
  }
  return Math.round(remaining * FALLBACK_SEC_PER_VAL)
}

/** 305 → "5 นาที 5 วินาที" — ตัวเลขวินาทีดิบอ่านแล้วไม่รู้สึกว่านานแค่ไหน */
export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} วินาที`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s === 0 ? `${m} นาที` : `${m} นาที ${s} วินาที`
}

/** เวลาที่งานใช้ไปทั้งหมด (เฉพาะงานที่จบแล้ว) */
export function elapsedSeconds(job: Pick<OltJob, 'startedAt' | 'finishedAt'>): number | null {
  if (!job.startedAt || !job.finishedAt) return null
  return Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)
}

/** นับผลแต่ละแบบไว้โชว์เป็นสรุปเหนือตาราง */
export function tally(rows: OltRow[]): Record<OltVerdict, number> {
  const out: Record<OltVerdict, number> = { Pass: 0, 'Not pass': 0, Down: 0, 'NEW L2': 0, ERROR: 0 }
  for (const r of rows) out[r.verdict] += 1
  return out
}

/** null → "—" ไม่ใช่ช่องว่าง เพื่อให้เห็นว่าไม่มีค่า ไม่ใช่ลืมเรนเดอร์ */
export function dash(v: number | null): string {
  return v === null ? '—' : String(v)
}

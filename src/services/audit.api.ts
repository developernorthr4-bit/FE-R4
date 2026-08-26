import { api } from '../lib/api'

/**
 * เรียก /audit-log ของ BE — เฉพาะ dev (BE ตอบ 403 กับ role อื่นทุก endpoint)
 *
 * ตัวกรองชุดเดียวถูกส่งไปทั้งตอนดู ตอนนับ และตอนลบ ฝั่ง BE ก็แปลด้วยฟังก์ชัน
 * เดียวกัน — นี่คือสิ่งที่ทำให้ "เห็นเท่าไรลบเท่านั้น" เป็นจริง ไม่ใช่แค่คำโฆษณา
 */

/** ค่าพิเศษของช่องผู้กระทำ — แถวที่ไม่มีคนทำ คือของที่ importer เขียนไว้ */
export const IMPORTER = 'importer'

export type AuditFilter = {
  table?: string | null
  action?: 'INSERT' | 'UPDATE' | 'DELETE' | null
  actor?: string | null
  from?: string | null
  to?: string | null
  pk?: string | null
  olderThanDays?: number | null
  /** ไม่แตะแถว action='DELETE' — ตั้งต้นเปิดไว้ ต้องปลดเอง */
  keepDeletes?: boolean
}

export type AuditRow = {
  id: number
  tableName: string
  rowPk: string | null
  action: string
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  changedBy: string | null
  /** null ทั้งที่มี changedBy = ผู้ใช้ถูกลบไปแล้ว (changed_by ไม่ผูก FK โดยตั้งใจ) */
  changedByName: string | null
  changedAt: string
}

export type AuditFacets = {
  tables: { name: string; rows: number }[]
  actions: { name: string; rows: number }[]
  actors: { id: string; username: string | null; rows: number }[]
  total: number
  importerRows: number
  deleteRows: number
  oldest: string | null
  newest: string | null
}

export type AuditSize = {
  totalBytes: number
  heapBytes: number
  indexBytes: number
  /** แถวที่ถูกลบแล้วแต่พื้นที่ยังไม่คืนดิสก์ — ค่าประมาณจาก pg_stat */
  deadRows: number
  dbBytes: number
}

export type AuditPreview = {
  rows: number
  /** แถวที่มีผู้กระทำ — ตัวเลขที่ต้องพิมพ์ยืนยัน */
  humanRows: number
  /** แถว DELETE ที่ถูกกันไว้ */
  protectedRows: number
  oldest: string | null
  newest: string | null
  totalRows: number
  /** ลบแล้วคืนพื้นที่ทันทีไหม (เขียนตารางใหม่) หรือแค่ปลดล็อกให้ใช้ซ้ำ */
  willReclaim: boolean
  /** ตัวกรองไม่ได้ระบุอะไรเลย = กวาดทั้งตาราง */
  wideOpen: boolean
  size: AuditSize
}

export type AuditDeleteResult = {
  deleted: number
  humanRows: number
  mode: 'rewrite' | 'delete'
  before: AuditSize
  after: AuditSize
  freedBytes: number
}

export async function loadFacets(): Promise<AuditFacets> {
  const res = await api.get<AuditFacets>('/audit-log/facets')
  return res.data
}

/** ตัดค่าว่างทิ้งก่อนส่ง เพื่อไม่ให้ query string เต็มไปด้วย table=&action= ที่ไม่มีความหมาย */
function params(f: AuditFilter): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(f)) {
    if (v !== null && v !== undefined && v !== '') out[k] = String(v)
  }
  return out
}

export async function listAuditLog(
  f: AuditFilter, opts: { cursor?: number | null; limit?: number } = {},
): Promise<{ rows: AuditRow[]; nextCursor: number | null }> {
  const res = await api.get<{ rows: AuditRow[]; nextCursor: number | null }>('/audit-log', {
    params: {
      ...params(f),
      ...(opts.cursor ? { cursor: String(opts.cursor) } : {}),
      limit: String(opts.limit ?? 50),
    },
  })
  return res.data
}

export async function previewDelete(f: AuditFilter): Promise<AuditPreview> {
  const res = await api.post<AuditPreview>('/audit-log/preview', f)
  return res.data
}

/**
 * ลบตามตัวกรอง
 *
 * confirmHumanRows ต้องเท่ากับจำนวนแถวของคนที่ BE นับได้ ณ วินาทีที่ลบ
 * ถ้าไม่ตรง BE ตอบ 409 พร้อมตัวเลขใหม่ ไม่ลบอะไรเลย
 */
export async function deleteAuditLog(
  f: AuditFilter, opts: { confirmHumanRows?: number | null; reason?: string } = {},
): Promise<AuditDeleteResult> {
  const res = await api.delete<AuditDeleteResult>('/audit-log', {
    data: {
      ...f,
      ...(opts.confirmHumanRows != null ? { confirmHumanRows: opts.confirmHumanRows } : {}),
      ...(opts.reason ? { reason: opts.reason } : {}),
    },
  })
  return res.data
}

export async function reclaimSpace(): Promise<AuditDeleteResult & { rows: number }> {
  const res = await api.post<AuditDeleteResult & { rows: number }>('/audit-log/reclaim')
  return res.data
}

/** 2026-08-26T07:57:50.883Z → "26 ส.ค. 09:57" — log อ่านเป็นเวลาไทยเสมอ */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export const ACTION_BADGE: Record<string, string> = {
  INSERT: 'badge-success',
  UPDATE: 'badge-info',
  DELETE: 'badge-error',
}

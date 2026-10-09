import { api } from '../lib/api'

/**
 * Ticket แจ้งเสียจากไฟล์ NOC (Ticket Online + Ticket Mobile รวมตารางเดียว คีย์ = เลข Ticket)
 * ช่วงทดลอง: หน้า tickets เพดาน dev · นำเข้า/relink = dev เสมอ
 */
export type LinkLevel = 'site' | 'olt' | 'l1' | 'l2' | 'none'
export type LinkMethod = 'exact' | 'prefix' | 'subject'

export const LINK_LEVELS: LinkLevel[] = ['site', 'olt', 'l1', 'l2', 'none']
export const LEVEL_LABEL: Record<LinkLevel, string> = {
  site: 'สถานี', olt: 'OLT', l1: 'L1', l2: 'L2', none: 'จับคู่ไม่ได้',
}
export const LEVEL_BADGE: Record<LinkLevel, string> = {
  site: 'badge-primary', olt: 'badge-secondary', l1: 'badge-accent', l2: 'badge-info', none: 'badge-ghost',
}
export const METHOD_LABEL: Record<LinkMethod, string> = {
  exact: 'รหัสตรงตัว', prefix: 'ตัดหัวรหัส', subject: 'หาใน SUBJECT',
}

export type TicketLookupKind =
  | 'status' | 'category' | 'class' | 'trackb' | 'problem_group' | 'problem' | 'sub_cause' | 'remedy'
  | 'owner_group' | 'handler_group' | 'priority' | 'network'
export type TicketLookup = { id: number; kind: TicketLookupKind; value: string }

export type TicketLookups = {
  lookups: TicketLookup[]
  stats: { total: number; unlinked: number; firstOpened: string | null; lastOpened: string | null }
  lastImport: { fileName: string | null; finishedAt: string | null; note: string | null } | null
}

let lookupsCache: TicketLookups | null = null
export async function loadTicketLookups(force = false): Promise<TicketLookups> {
  if (lookupsCache && !force) return lookupsCache
  const res = await api.get<TicketLookups>('/tickets/lookups')
  lookupsCache = res.data
  return lookupsCache
}

/** id → ค่า ของทุก kind รวมกัน (id ไม่ซ้ำข้าม kind) */
export function lookupMap(lk: TicketLookups | null): Map<number, string> {
  return new Map((lk?.lookups ?? []).map((l) => [l.id, l.value]))
}
export function lookupsOf(lk: TicketLookups | null, kind: TicketLookupKind): TicketLookup[] {
  return (lk?.lookups ?? []).filter((l) => l.kind === kind)
}
/** class เก็บเป็น "CLASS_TYPE \ CLASS1 \ CLASS2" — หน้าจอโชว์ CLASS1 · CLASS2 (CLASS_TYPE ซ้ำกันเกือบทุกใบ) */
export function shortClass(v: string | undefined): string {
  if (!v) return '—'
  const parts = v.split(' \\ ')
  return parts.length === 3 ? `${parts[1]} · ${parts[2]}` : v
}

export type TicketRow = {
  ticketNo: string
  severity: string | null
  slaHrs: number | null
  slaOver: boolean | null
  subject: string | null
  openedAt: string
  restoredAt: string | null
  closedAt: string | null
  closedDate: string | null
  downTimeMin: number | null
  statusId: number | null
  categoryId: number | null
  classId: number | null
  problemGroupId: number | null
  subCauseId: number | null
  remedyId: number | null
  ownerGroupId: number | null
  networkId: number | null
  ciName: string | null
  siteRaw: string | null
  provinceName: string | null
  linkLevel: LinkLevel
  linkMethod: LinkMethod | null
  siteId: string | null
  siteCode: string | null
  oltCode: string | null
  nodeCode: string | null
}

export type TicketFilters = {
  q?: string
  from?: string
  to?: string
  province?: number
  site?: string
  severity?: string
  slaOver?: '1' | '0'
  link?: LinkLevel
  category?: number
  class?: number
  problemGroup?: number
  subCause?: number
  owner?: number
  network?: number
  limit?: number
  offset?: number
}

export type TicketPage = {
  rows: TicketRow[]
  total: number
  summary: { byLevel: Record<LinkLevel, number>; slaOver: number }
}

export async function listTickets(f: TicketFilters): Promise<TicketPage> {
  const res = await api.get<TicketPage>('/tickets', { params: f })
  return res.data
}

export type SiteTickets = {
  months: number
  total: number
  byMonth: { month: string; n: number; slaOver: number }[]
  byLevel: Record<LinkLevel, number>
  byCause: { problemGroupId: number | null; n: number }[]
  recent: TicketRow[]
}

export async function getSiteTickets(siteId: string, months: number): Promise<SiteTickets> {
  const res = await api.get<SiteTickets>(`/tickets/by-site/${siteId}`, { params: { months } })
  return res.data
}

/** โหนดที่ Ticket เกิด — แสดงรหัสของชั้นที่จับได้ */
export function linkCode(r: Pick<TicketRow, 'linkLevel' | 'siteCode' | 'oltCode' | 'nodeCode'>): string | null {
  if (r.linkLevel === 'l1' || r.linkLevel === 'l2') return r.nodeCode
  if (r.linkLevel === 'olt') return r.oltCode
  if (r.linkLevel === 'site') return r.siteCode
  return null
}

/** 4,992 นาที → "3 วัน 11 ชม." */
export function fmtDowntime(min: number | null): string {
  if (min === null || min === undefined) return '—'
  if (min < 60) return `${min} นาที`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ชม. ${min % 60} นาที`
  return `${Math.floor(h / 24)} วัน ${h % 24} ชม.`
}

// ─────────────────────────────────────────────────────────────────────────────
// นำเข้า
// ─────────────────────────────────────────────────────────────────────────────

/** แถวดิบที่ส่งให้ BE — ต้องตรงกับ TicketImportRow ใน BE-R4/src/import/tickets.ts */
export type TicketImportRow = {
  ticketNo: string | null
  status: string | null
  severity: string | null
  slaHrs: string | null
  ticketSla: string | null
  priority: string | null
  subject: string | null
  openedAt: string | null
  targetAt: string | null
  restoredAt: string | null
  closedTime: string | null
  closedDate: string | null
  downTime: string | null
  category: string | null
  classType: string | null
  class1: string | null
  class2: string | null
  trackb: string | null
  problemGroup: string | null
  problem: string | null
  subCause: string | null
  remedy: string | null
  ownerGroup: string | null
  handlerGroup: string | null
  network: string | null
  ciName: string | null
  site: string | null
  ccaatt: string | null
  provinceEn: string | null
}

/** สำเนาของ TICKET_HEADERS ใน BE — หัวคอลัมน์ในไฟล์ → คีย์ */
export const TICKET_HEADERS: Record<string, keyof TicketImportRow> = {
  'TICKETID': 'ticketNo',
  'STATUS': 'status',
  'TRUESEVERITY_DESC': 'severity',
  'SLA_Hrs': 'slaHrs',
  'TICKET_SLA': 'ticketSla',
  'priority_pending': 'priority',
  'SUBJECT': 'subject',
  'CREATIONDATE': 'openedAt',
  'TARGETFINISH': 'targetAt',
  'RESTORATIONDATE': 'restoredAt',
  'CLOSEDTIME': 'closedTime',
  'CLOSED_DATE': 'closedDate',
  'DOWN_TIME_MINUTE': 'downTime',
  'CATEGORIES': 'category',
  'CLASS_TYPE': 'classType',
  'CLASS1': 'class1',
  'CLASS2': 'class2',
  'CONTRACTTICKET_TRACKB': 'trackb',
  'Problem_Group': 'problemGroup',
  'PROBLEM': 'problem',
  'SUB_CAUSE': 'subCause',
  'REMEDY': 'remedy',
  'TRUEOWNERGROUP': 'ownerGroup',
  'Group': 'handlerGroup',
  'Network': 'network',
  'CI_Name': 'ciName',
  'Site': 'site',
  'CCAATT': 'ccaatt',
  'PROVINCE_EN': 'provinceEn',
}

/** คอลัมน์วันเวลา — Excel เก็บเป็นเลข serial ต้องแปลงเป็น 'YYYY-MM-DD HH:mm:ss' (เวลาไทย ไม่มี zone) */
export const TICKET_DATE_KEYS: (keyof TicketImportRow)[] = ['openedAt', 'targetAt', 'restoredAt', 'closedTime', 'closedDate']

/** สำเนาของ preferRow ใน BE — เลขซ้ำเก็บแถวที่ปิดทีหลัง เท่ากันเอาแถวที่มาทีหลัง */
export function preferRow(prev: TicketImportRow, next: TicketImportRow): TicketImportRow {
  const k = (r: TicketImportRow) => `${(r.closedDate ?? '').slice(0, 10)}|${(r.closedTime ?? '').replace('T', ' ').slice(0, 19)}`
  return k(next) >= k(prev) ? next : prev
}

export async function startTicketImport(fileName: string): Promise<{ batchId: string; chunk: number }> {
  const res = await api.post<{ batchId: string; chunk: number }>('/tickets/import/start', { fileName })
  return res.data
}

export type TicketChunkResult = {
  inserted: number
  updated: number
  unchanged: number
  skipped: number
  byLevel: Record<LinkLevel, number>
}

export async function sendTicketRows(batchId: string, rows: TicketImportRow[]): Promise<TicketChunkResult> {
  // ก้อนละ 1,000 แถว ~1–2 วิ แต่ Render free ตื่นช้า — เผื่อ 120 วิเหมือนนำเข้าเกรดสถานี
  const res = await api.post<TicketChunkResult>(`/tickets/import/${batchId}/rows`, { rows }, { timeout: 120_000 })
  return res.data
}

export async function finishTicketImport(
  batchId: string,
  stats: { totalRows: number; inserted: number; updated: number; unchanged: number; skipped: number; unlinked: number; ok: boolean },
): Promise<void> {
  await api.post(`/tickets/import/${batchId}/finish`, stats)
}

export async function relinkTickets(): Promise<{ checked: number; linked: number; rolled: number }> {
  const res = await api.post<{ checked: number; linked: number; rolled: number }>('/tickets/relink', {}, { timeout: 120_000 })
  return res.data
}

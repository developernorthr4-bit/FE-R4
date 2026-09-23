import { api } from '../lib/api'

/**
 * จุดซ่อม CM (จากไฟล์ Faults Point.xlsx ของ NOC) + ผลตรวจของทีม Audit
 * 1 CM = 1 จุด = 1 ผลตรวจ (แก้ทับได้) · บันทึกผล/แนบรูป/นำเข้า = editor ขึ้นไป
 */
export type FaultAuditResult = 'pass' | 'not_pass' | 'no_access'

export const RESULT_LABEL: Record<FaultAuditResult, string> = {
  pass: 'Pass', not_pass: 'Not pass', no_access: 'เข้าไม่ถึง',
}
export const RESULT_BADGE: Record<FaultAuditResult, string> = {
  pass: 'badge-success', not_pass: 'badge-error', no_access: 'badge-warning',
}
/** สีหมุดบนแผนที่ — none = ยังไม่ตรวจไม่มีใครจอง · mine/others = จองแล้ว */
export const RESULT_COLOR: Record<FaultAuditResult | 'none' | 'mine' | 'others', string> = {
  none: '#64748b', mine: '#2563eb', others: '#9333ea', pass: '#16a34a', not_pass: '#dc2626', no_access: '#f59e0b',
}
export type PointState = FaultAuditResult | 'none' | 'mine' | 'others'
export const STATE_LABEL: Record<PointState, string> = {
  none: 'ยังไม่จอง', mine: 'ฉันจอง', others: 'คนอื่นจอง', pass: 'Pass', not_pass: 'Not pass', no_access: 'เข้าไม่ถึง',
}
/** สถานะรวมของจุด — ผลตรวจมาก่อน แล้วค่อยดูว่าใครจอง */
export function pointState(p: { result: FaultAuditResult | null; claimUserId: string | null }, me: string | null): PointState {
  if (p.result) return p.result
  if (!p.claimUserId) return 'none'
  return p.claimUserId === me ? 'mine' : 'others'
}

export type FaultLookupItem = { id: number; code: string; nameTh: string; sortOrder: number; isActive: boolean }
/** ผล archive ครั้งล่าสุด — โชว์กันลืมว่าทำไมข้อมูลเก่าหาย */
export type FaultArchiveLast = { at: string; before: string; deleted: number; photos: number; by: string }
export type FaultLookups = {
  solutions: FaultLookupItem[]
  causes: { key: string; n: number }[]
  severities: { key: string; n: number }[]
  sheets: { key: string; n: number }[]
  /** กฎ archive: CM ที่ซ่อมเสร็จก่อน `before` (= วันนี้ − months) เข้าเกณฑ์ลบ · pending = ที่ค้างอยู่ตอนนี้ */
  archive: { months: number; before: string; pending: number; last: FaultArchiveLast | null }
}

export type FaultRow = {
  id: string
  cmNo: string
  severity: string | null
  siteCode: string | null
  siteName: string | null
  provinceName: string | null
  rootCause: string | null
  rootCauseKey: string | null
  subRootCause: string | null
  completeSolution: string | null
  completeAt: string | null
  lat: number | null
  lng: number | null
  sourceSheet: string | null
  auditId: string | null
  auditResult: FaultAuditResult | null
  auditDate: string | null
  solutionName: string | null
  repairLengthM: number | null
  auditorName: string | null
  photoCount: number
  claimId: string | null
  claimUserId: string | null
  claimUserName: string | null
  claimPlannedDate: string | null
  claimNote: string | null
}

/** claimed = ยังไม่ตรวจแต่มีคนจองแล้ว (อยู่ใน none ด้วย) */
export type FaultSummary = { total: number; none: number; pass: number; not_pass: number; no_access: number; claimed: number }

export type Fault = {
  id: string
  cmNo: string
  incNo: string | null
  ttNo: string | null
  severity: string | null
  region: string | null
  provinceCode: string | null
  provinceId: number | null
  provinceName: string | null
  siteCode: string | null
  siteId: string | null
  siteName: string | null
  fme: string | null
  activityGroup: string | null
  ciName: string | null
  subject: string | null
  descriptionCm: string | null
  rootCause: string | null
  rootCauseKey: string | null
  subRootCause: string | null
  completeSolution: string | null
  completeDesc: string | null
  firstOccurAt: string | null
  createdAtSrc: string | null
  departAt: string | null
  arriveAt: string | null
  leaveAt: string | null
  completeAt: string | null
  lat: number | null
  lng: number | null
  locSource: 'complete' | 'arrive' | null
  itemName: string | null
  itemCode: string | null
  serialNo: string | null
  sourceSheet: string | null
  importedAt: string
  updatedAt: string
}

export type FaultAudit = {
  id: string
  faultId: string
  result: FaultAuditResult
  solutionId: number | null
  solutionName: string | null
  repairLengthM: number | null
  note: string | null
  auditDate: string
  lat: number | null
  lng: number | null
  auditedBy: string
  auditorName: string
  createdAt: string
  updatedAt: string
}

export type FaultPhoto = {
  id: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  takenAt: string | null
  uploadedAt: string
  /** signed URL อายุ 1 ชม. · null = ที่เก็บไฟล์ยังไม่พร้อม */
  url: string | null
}

export type FaultClaimBrief = {
  id: string
  userId: string
  userName: string
  plannedDate: string
  note: string | null
  claimedAt: string
  overdue: boolean
}

export type FaultDetail = {
  fault: Fault
  audit: FaultAudit | null
  claim: FaultClaimBrief | null
  photos: FaultPhoto[]
  can: { audit: boolean }
}

export type FaultFilters = {
  q?: string
  province?: number | ''
  cause?: string
  severity?: string
  sheet?: string
  audit?: 'none' | 'any' | FaultAuditResult | ''
  claim?: 'none' | 'any' | 'mine' | 'others' | ''
  geo?: '1' | '0' | ''
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export type FaultMapPoint = {
  id: string
  cmNo: string
  siteCode: string | null
  lat: number
  lng: number
  cause: string | null
  sub: string | null
  completeAt: string | null
  result: FaultAuditResult | null
  repairLengthM: number | null
  solutionName: string | null
  claimId: string | null
  claimUserId: string | null
  claimUserName: string | null
  claimPlannedDate: string | null
}

export type FaultGridCell = { lat: number; lng: number; n: number; none: number; claimed: number; pass: number; notPass: number; noAccess: number }

function toParams(f: FaultFilters): Record<string, string | number> {
  const p: Record<string, string | number> = {}
  if (f.q?.trim()) p.q = f.q.trim()
  if (f.province) p.province = f.province
  if (f.cause) p.cause = f.cause
  if (f.severity) p.severity = f.severity
  if (f.sheet) p.sheet = f.sheet
  if (f.audit) p.audit = f.audit
  if (f.claim) p.claim = f.claim
  if (f.geo) p.geo = f.geo
  if (f.from) p.from = f.from
  if (f.to) p.to = f.to
  return p
}

let lookupsCache: FaultLookups | null = null
export async function loadFaultLookups(force = false): Promise<FaultLookups> {
  if (lookupsCache && !force) return lookupsCache
  const res = await api.get<FaultLookups>('/faults/lookups')
  lookupsCache = res.data
  return lookupsCache
}

export async function listFaults(f: FaultFilters) {
  const params = toParams(f)
  params.limit = f.limit ?? 50
  params.offset = f.offset ?? 0
  const res = await api.get<{ faults: FaultRow[]; total: number; limit: number; offset: number; summary: FaultSummary }>('/faults', { params })
  return res.data
}

export async function getFault(id: string): Promise<FaultDetail> {
  const res = await api.get<FaultDetail>(`/faults/${id}`)
  return res.data
}

export type AuditInput = {
  result: FaultAuditResult | ''
  solutionId: number | ''
  repairLengthM: number | null
  note: string
  auditDate: string
  lat: number | null
  lng: number | null
}

export async function saveAudit(faultId: string, input: AuditInput): Promise<FaultDetail> {
  const res = await api.put<FaultDetail>(`/faults/${faultId}/audit`, input)
  return res.data
}

export async function deleteAudit(faultId: string): Promise<void> {
  await api.delete(`/faults/${faultId}/audit`)
}

/** ไฟล์ต้องย่อมาแล้ว (lib/image-resize.ts) BE ปฏิเสธเกิน 2 MB */
export async function uploadFaultPhoto(
  faultId: string,
  file: Blob,
  meta: { width?: number; height?: number; takenAt?: string | null },
): Promise<FaultPhoto> {
  const fd = new FormData()
  fd.append('file', file, 'photo.jpg')
  if (meta.width) fd.append('width', String(meta.width))
  if (meta.height) fd.append('height', String(meta.height))
  if (meta.takenAt) fd.append('takenAt', meta.takenAt)
  const res = await api.post<{ photo: FaultPhoto }>(`/faults/${faultId}/audit/photos`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data.photo
}

export async function deleteFaultPhoto(faultId: string, photoId: string): Promise<void> {
  await api.delete(`/faults/${faultId}/audit/photos/${photoId}`)
}

export async function getFaultMapPoints(
  bbox: [number, number, number, number],
  f: FaultFilters = {},
): Promise<{ points: FaultMapPoint[]; capped: boolean }> {
  const params = toParams(f)
  params.bbox = bbox.join(',')
  const res = await api.get<{ points: FaultMapPoint[]; capped: boolean }>('/faults/map', { params })
  return res.data
}

/** ซูมออก — ก้อนตัวเลขตามช่องตาราง (ซูม 5–11) */
export async function getFaultGrid(
  bbox: [number, number, number, number],
  zoom: number,
  f: FaultFilters = {},
): Promise<{ cells: FaultGridCell[]; cell: number; zoom: number }> {
  const params = toParams(f)
  params.bbox = bbox.join(',')
  params.zoom = zoom
  const res = await api.get<{ cells: FaultGridCell[]; cell: number; zoom: number }>('/faults/map/grid', { params })
  return res.data
}

async function downloadXlsx(path: string, params: Record<string, string | number>, fallback: string, timeout = 120_000): Promise<void> {
  const res = await api.get<Blob>(path, { params, responseType: 'blob', timeout })
  const cd = String(res.headers['content-disposition'] ?? '')
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallback
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** ดาวน์โหลด xlsx ตามตัวกรอง — BE ปฏิเสธถ้าเกิน 10,000 แถว (ข้อความอยู่ใน error) */
export async function exportFaults(f: FaultFilters): Promise<void> {
  await downloadXlsx('/faults/export', toParams(f), 'faults_audit.xlsx')
}

// ─────────────────────────────────────────────────────────────────────────────
// archive — admin: CM ที่ซ่อมเสร็จเกิน 12 เดือน โหลด xlsx แล้วลบออกจากระบบ (รวมผลตรวจ/รูป/จอง)
// ─────────────────────────────────────────────────────────────────────────────

export type ArchivePreview = {
  before: string; months: number; defaultBefore: string
  total: number; audited: number; photos: number; claims: number
  last: FaultArchiveLast | null
}
export async function getArchivePreview(before?: string): Promise<ArchivePreview> {
  const res = await api.get<ArchivePreview>('/faults/archive/preview', { params: before ? { before } : {} })
  return res.data
}
/** ไฟล์ทั้งชุดที่จะถูกลบ — ไม่มีเพดาน 10,000 แถว อาจใช้เวลาเป็นนาที */
export async function exportArchive(before: string): Promise<void> {
  await downloadXlsx('/faults/archive/export', { before }, `faults_archive_before_${before}.xlsx`, 600_000)
}
export async function runArchive(before: string, expected: number): Promise<{ before: string; deleted: number; photos: number }> {
  const res = await api.post<{ before: string; deleted: number; photos: number }>('/faults/archive', { before, expected }, { timeout: 600_000 })
  return res.data
}

// ─────────────────────────────────────────────────────────────────────────────
// การจอง — "ฉันจะไปดูจุดนี้วันที่ X"
// ─────────────────────────────────────────────────────────────────────────────

export type FaultClaim = {
  id: string
  faultId: string
  userId: string
  userName: string
  plannedDate: string
  note: string | null
  claimedAt: string
  doneAt: string | null
  releasedAt: string | null
  cmNo: string
  siteCode: string | null
  provinceName: string | null
  rootCauseKey: string | null
  subRootCause: string | null
  completeAt: string | null
  lat: number | null
  lng: number | null
  auditResult: FaultAuditResult | null
  overdue: boolean
}

export type ClaimResult = { claimed: number; moved: number; skipped: { faultId: string; reason: string }[]; open: number; limit: number }

/** จองหลายจุดทีเดียว — จุดที่ตัวเองจองอยู่แล้ว = เลื่อนวัน · คนอื่นจอง/ตรวจแล้ว = ข้าม (อยู่ใน skipped) */
export async function claimFaults(faultIds: string[], plannedDate: string, note?: string): Promise<ClaimResult> {
  const res = await api.post<ClaimResult>('/faults/claims', { faultIds, plannedDate, note: note || null })
  return res.data
}

export async function updateClaim(claimId: string, patch: { plannedDate?: string; note?: string | null }): Promise<void> {
  await api.patch(`/faults/claims/${claimId}`, patch)
}

export async function releaseClaim(claimId: string): Promise<void> {
  await api.delete(`/faults/claims/${claimId}`)
}

export async function myClaims(withDone = false): Promise<{ claims: FaultClaim[]; open: number; limit: number; today: string }> {
  const res = await api.get<{ claims: FaultClaim[]; open: number; limit: number; today: string }>('/faults/claims/mine', { params: withDone ? { done: 1 } : {} })
  return res.data
}

export type TeamRow = { userId: string; userName: string; open: number; overdue: number; nextDate: string | null; done30: number }
export async function teamClaims(): Promise<{ team: TeamRow[]; today: string }> {
  const res = await api.get<{ team: TeamRow[]; today: string }>('/faults/claims/team')
  return res.data
}

export async function exportMyTrip(date?: string): Promise<void> {
  await downloadXlsx('/faults/claims/export', date ? { date } : {}, 'trip.xlsx')
}

/** ระยะเส้นตรง (เมตร) — ใช้เรียงลำดับทริป ไม่ใช่ระยะขับจริง */
export function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** เรียง "ใกล้สุดก่อน" จากจุดเริ่ม (nearest neighbour) — พอสำหรับทริปวันเดียว 10–20 จุด */
export function orderByNearest<T extends { lat: number | null; lng: number | null }>(items: T[], start: [number, number] | null): T[] {
  const located = items.filter((i) => i.lat !== null && i.lng !== null)
  const rest = items.filter((i) => i.lat === null || i.lng === null)
  const out: T[] = []
  let cur: [number, number] | null = start
  const pool = [...located]
  if (!cur && pool.length) { const f = pool.shift()!; out.push(f); cur = [f.lat!, f.lng!] }
  while (pool.length && cur) {
    let bi = 0
    let bd = Infinity
    pool.forEach((p, i) => { const d = haversineM(cur!, [p.lat!, p.lng!]); if (d < bd) { bd = d; bi = i } })
    const next = pool.splice(bi, 1)[0]!
    out.push(next)
    cur = [next.lat!, next.lng!]
  }
  return [...out, ...rest]
}

/**
 * ลิงก์นำทาง Google Maps หลายจุด — origin = ตำแหน่งฉัน (ถ้ามี) ไม่งั้นจุดแรก
 * Google รับ waypoint ได้ ~9 จุด/ลิงก์ จึงตัดเป็นช่วงละ 10 จุด (1 ปลายทาง + 9 waypoint)
 */
export function googleMapsDirLinks(points: { lat: number | null; lng: number | null }[], origin: [number, number] | null): string[] {
  const pts = points.filter((p) => p.lat !== null && p.lng !== null).map((p) => `${p.lat},${p.lng}`)
  const links: string[] = []
  let from = origin ? `${origin[0]},${origin[1]}` : null
  for (let i = 0; i < pts.length; i += 10) {
    const leg = pts.slice(i, i + 10)
    const dest = leg[leg.length - 1]!
    const wps = leg.slice(0, -1)
    const u = new URL('https://www.google.com/maps/dir/')
    u.searchParams.set('api', '1')
    if (from) u.searchParams.set('origin', from)
    u.searchParams.set('destination', dest)
    if (wps.length) u.searchParams.set('waypoints', wps.join('|'))
    u.searchParams.set('travelmode', 'driving')
    links.push(u.toString())
    from = dest
  }
  return links
}

// ─────────────────────────────────────────────────────────────────────────────
// นำเข้า — เบราว์เซอร์อ่าน xlsx เอง แล้วส่ง JSON เป็นก้อน
// ─────────────────────────────────────────────────────────────────────────────

/** แถวดิบที่ส่งให้ BE — ต้องตรงกับ FaultImportRow ใน BE-R4/src/import/faults.ts */
export type FaultImportRow = {
  sheet: string | null
  rowNo: number | null
  cm: string | null
  inc: string | null
  tt: string | null
  severity: string | null
  region: string | null
  province: string | null
  site: string | null
  fme: string | null
  activityGroup: string | null
  ciName: string | null
  subject: string | null
  descriptionCm: string | null
  rootCause: string | null
  subRootCause: string | null
  completeSolution: string | null
  completeDesc: string | null
  firstOccurTime: string | null
  createTime: string | null
  departTime: string | null
  arriveTime: string | null
  leaveTime: string | null
  completeTime: string | null
  completeLocation: string | null
  arriveLocation: string | null
  item: string | null
  itemCode: string | null
  sn: string | null
}

/** หัวคอลัมน์ในไฟล์ → คีย์ — คัดลอกจาก BE (FAULT_HEADERS) ต้องแก้ให้ตรงกันทั้งสองฝั่ง */
export const FAULT_HEADERS: Record<string, keyof FaultImportRow> = {
  'CM': 'cm',
  'INC': 'inc',
  'Source TT': 'tt',
  'Severity': 'severity',
  'Region': 'region',
  'Province': 'province',
  'Site/Cable': 'site',
  'FME': 'fme',
  'Activity Owner Group': 'activityGroup',
  'CI Name': 'ciName',
  'Subject': 'subject',
  'Description (Create CM)': 'descriptionCm',
  'Root Cause': 'rootCause',
  'Sub Root Cause': 'subRootCause',
  'Complete Solution': 'completeSolution',
  'Complete Des': 'completeDesc',
  'First Occure Time': 'firstOccurTime',
  'Create Time': 'createTime',
  'Depart Time': 'departTime',
  'Arrive Time': 'arriveTime',
  'Leave Time': 'leaveTime',
  'Complete Time': 'completeTime',
  'Complete Location': 'completeLocation',
  'Arrive Location': 'arriveLocation',
  'Item': 'item',
  'Item Code': 'itemCode',
  'S/N': 'sn',
}

export async function startImport(fileName: string): Promise<{ batchId: string; chunk: number }> {
  const res = await api.post<{ batchId: string; chunk: number }>('/faults/import/start', { fileName })
  return res.data
}

export type ImportChunkResult = { inserted: number; updated: number; skipped: number; noLocation: number }

export async function sendImportRows(batchId: string, rows: FaultImportRow[]): Promise<ImportChunkResult> {
  const res = await api.post<ImportChunkResult>(`/faults/import/${batchId}/rows`, { rows }, { timeout: 120_000 })
  return res.data
}

export async function finishImport(
  batchId: string,
  stats: { totalRows: number; inserted: number; updated: number; skipped: number; ok: boolean },
): Promise<void> {
  await api.post(`/faults/import/${batchId}/finish`, stats)
}

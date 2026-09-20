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
/** สีหมุดบนแผนที่ — null = ยังไม่ตรวจ */
export const RESULT_COLOR: Record<FaultAuditResult | 'none', string> = {
  none: '#64748b', pass: '#16a34a', not_pass: '#dc2626', no_access: '#f59e0b',
}

export type FaultLookupItem = { id: number; code: string; nameTh: string; sortOrder: number; isActive: boolean }
export type FaultLookups = {
  solutions: FaultLookupItem[]
  causes: { key: string; n: number }[]
  severities: { key: string; n: number }[]
  sheets: { key: string; n: number }[]
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
}

export type FaultSummary = { total: number; none: number; pass: number; not_pass: number; no_access: number }

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

export type FaultDetail = {
  fault: Fault
  audit: FaultAudit | null
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
}

function toParams(f: FaultFilters): Record<string, string | number> {
  const p: Record<string, string | number> = {}
  if (f.q?.trim()) p.q = f.q.trim()
  if (f.province) p.province = f.province
  if (f.cause) p.cause = f.cause
  if (f.severity) p.severity = f.severity
  if (f.sheet) p.sheet = f.sheet
  if (f.audit) p.audit = f.audit
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

/** ดาวน์โหลด xlsx ตามตัวกรอง — BE ปฏิเสธถ้าเกิน 10,000 แถว (ข้อความอยู่ใน error) */
export async function exportFaults(f: FaultFilters): Promise<void> {
  const res = await api.get<Blob>('/faults/export', { params: toParams(f), responseType: 'blob', timeout: 120_000 })
  const cd = String(res.headers['content-disposition'] ?? '')
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? 'faults_audit.xlsx'
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
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

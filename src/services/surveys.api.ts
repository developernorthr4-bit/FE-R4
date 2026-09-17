import { api } from '../lib/api'
import type { MapKind } from './online.api'

/**
 * งานสำรวจ — ปลายทาง 1 ตัว · จุดปัญหาหลายจุด · รูปหลายรูป
 * id ของงาน/จุด/รูปส่งไปเองได้ (uuid) BE รับเป็น idempotent — เผื่อแอปออฟไลน์
 */
export type SurveyStatus = 'draft' | 'submitted' | 'closed'
export type SurveyResult = 'pass' | 'needs_fix' | 'no_access'
export type SurveySeverity = 'low' | 'medium' | 'high'

export const SURVEY_STATUS_LABEL: Record<SurveyStatus, string> = {
  draft: 'ร่าง', submitted: 'ส่งแล้ว', closed: 'ปิดงาน',
}
export const SURVEY_STATUS_BADGE: Record<SurveyStatus, string> = {
  draft: 'badge-ghost', submitted: 'badge-info', closed: 'badge-success',
}
export const SURVEY_RESULT_LABEL: Record<SurveyResult, string> = {
  pass: 'ผ่าน', needs_fix: 'ต้องแก้ไข', no_access: 'เข้าไม่ถึง',
}
export const SEVERITY_LABEL: Record<SurveySeverity, string> = { low: 'ต่ำ', medium: 'กลาง', high: 'สูง' }
export const SEVERITY_BADGE: Record<SurveySeverity, string> = {
  low: 'badge-ghost', medium: 'badge-warning', high: 'badge-error',
}

export type SurveyLookupItem = { id: number; code: string; nameTh: string; sortOrder: number; isActive: boolean }
export type SurveyLookups = { jobTypes: SurveyLookupItem[]; pointTypes: SurveyLookupItem[] }

export type SurveyRow = {
  id: string
  surveyNo: string
  surveyDate: string
  targetKind: MapKind
  targetCode: string
  siteId: string | null
  siteCode: string | null
  siteName: string | null
  provinceName: string | null
  jobTypeName: string | null
  status: SurveyStatus
  result: SurveyResult | null
  surveyorName: string
  pointCount: number
  photoCount: number
  updatedAt: string
}

export type Survey = {
  id: string
  surveyNo: string
  targetKind: MapKind
  targetCode: string
  siteId: string | null
  siteCode: string | null
  siteName: string | null
  provinceId: number | null
  provinceName: string | null
  jobTypeId: number
  jobTypeName: string | null
  surveyDate: string
  surveyorId: string
  surveyorName: string
  companions: string | null
  status: SurveyStatus
  result: SurveyResult | null
  summary: string | null
  startLat: string | null
  startLng: string | null
  routeM: number | null
  routeSec: number | null
  eventId: string | null
  submittedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export type SurveyPoint = {
  id: string
  seqNo: number
  pointTypeId: number
  pointTypeName: string | null
  severity: SurveySeverity
  lat: number
  lng: number
  note: string | null
  resolvedAt: string | null
  createdAt: string
}

export type SurveyPhoto = {
  id: string
  pointId: string | null
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  takenAt: string | null
  uploadedAt: string
  /** signed URL อายุ 1 ชม. · null = ที่เก็บไฟล์ยังไม่พร้อม */
  url: string | null
}

export type SurveyDetail = {
  survey: Survey
  points: SurveyPoint[]
  photos: SurveyPhoto[]
  can: { edit: boolean; close: boolean; delete: boolean }
}

export type SurveyFilters = {
  q?: string
  status?: SurveyStatus | ''
  province?: number | ''
  jobType?: number | ''
  from?: string
  to?: string
  mine?: boolean
  siteId?: string
  limit?: number
  offset?: number
}

/** จุดปัญหาที่ส่งมาให้วางบนแผนที่ (ไม่มีรูป แค่จำนวน) */
export type SurveyMapPoint = {
  id: string
  surveyId: string
  surveyNo: string
  surveyDate: string
  targetCode: string
  lat: number
  lng: number
  type: string | null
  severity: SurveySeverity
  note: string | null
  photos: number
  resolved: boolean
}

let lookupsCache: SurveyLookups | null = null
export async function loadSurveyLookups(): Promise<SurveyLookups> {
  if (lookupsCache) return lookupsCache
  const res = await api.get<SurveyLookups>('/surveys/lookups')
  lookupsCache = res.data
  return lookupsCache
}

export async function listSurveys(f: SurveyFilters) {
  const params: Record<string, string | number> = {}
  if (f.q?.trim()) params.q = f.q.trim()
  if (f.status) params.status = f.status
  if (f.province) params.province = f.province
  if (f.jobType) params.jobType = f.jobType
  if (f.from) params.from = f.from
  if (f.to) params.to = f.to
  if (f.mine) params.mine = 1
  if (f.siteId) params.siteId = f.siteId
  params.limit = f.limit ?? 50
  params.offset = f.offset ?? 0
  const res = await api.get<{ surveys: SurveyRow[]; total: number; limit: number; offset: number }>('/surveys', { params })
  return res.data
}

export type SurveyHeaderInput = {
  jobTypeId: number | ''
  surveyDate: string
  companions: string
  summary: string
  result: SurveyResult | ''
  startLat: number | null
  startLng: number | null
  routeM: number | null
  routeSec: number | null
  eventId: string
}

export async function createSurvey(input: SurveyHeaderInput & { id?: string; targetKind: MapKind; targetCode: string }): Promise<Survey> {
  const res = await api.post<{ survey: Survey }>('/surveys', input)
  return res.data.survey
}

export async function updateSurvey(id: string, patch: Partial<SurveyHeaderInput>): Promise<Survey> {
  const res = await api.patch<{ survey: Survey }>(`/surveys/${id}`, patch)
  return res.data.survey
}

export async function getSurvey(id: string): Promise<SurveyDetail> {
  const res = await api.get<SurveyDetail>(`/surveys/${id}`)
  return res.data
}

export async function setSurveyStatus(id: string, action: 'submit' | 'close' | 'reopen'): Promise<Survey> {
  const res = await api.post<{ survey: Survey }>(`/surveys/${id}/${action}`)
  return res.data.survey
}

export async function deleteSurvey(id: string): Promise<void> {
  await api.delete(`/surveys/${id}`)
}

export type PointInput = {
  id?: string
  pointTypeId: number
  severity: SurveySeverity
  lat: number
  lng: number
  note: string
}

export async function addPoint(surveyId: string, p: PointInput): Promise<SurveyPoint> {
  const res = await api.post<{ point: SurveyPoint }>(`/surveys/${surveyId}/points`, p)
  return res.data.point
}

export async function updatePoint(surveyId: string, pointId: string, p: Partial<PointInput> & { resolved?: boolean }): Promise<SurveyPoint> {
  const res = await api.patch<{ point: SurveyPoint }>(`/surveys/${surveyId}/points/${pointId}`, p)
  return res.data.point
}

export async function deletePoint(surveyId: string, pointId: string): Promise<void> {
  await api.delete(`/surveys/${surveyId}/points/${pointId}`)
}

/** ไฟล์ต้องย่อมาแล้ว (lib/image-resize.ts) BE ปฏิเสธเกิน 2 MB */
export async function uploadPhoto(
  surveyId: string,
  file: Blob,
  meta: { pointId?: string | null; width?: number; height?: number; takenAt?: string | null; lat?: number | null; lng?: number | null },
): Promise<SurveyPhoto> {
  const fd = new FormData()
  fd.append('file', file, 'photo.jpg')
  if (meta.pointId) fd.append('pointId', meta.pointId)
  if (meta.width) fd.append('width', String(meta.width))
  if (meta.height) fd.append('height', String(meta.height))
  if (meta.takenAt) fd.append('takenAt', meta.takenAt)
  if (meta.lat != null && meta.lng != null) { fd.append('lat', String(meta.lat)); fd.append('lng', String(meta.lng)) }
  const res = await api.post<{ photo: SurveyPhoto }>(`/surveys/${surveyId}/photos`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data.photo
}

export async function deletePhoto(surveyId: string, photoId: string): Promise<void> {
  await api.delete(`/surveys/${surveyId}/photos/${photoId}`)
}

export async function getSurveyMapPoints(p: {
  bbox: [number, number, number, number]
  status?: SurveyStatus | ''
  resolved?: boolean
}): Promise<{ points: SurveyMapPoint[]; capped: boolean }> {
  const params: Record<string, string | number> = { bbox: p.bbox.join(',') }
  if (p.status) params.status = p.status
  if (p.resolved) params.resolved = 1
  const res = await api.get<{ points: SurveyMapPoint[]; capped: boolean }>('/surveys/points/map', { params })
  return res.data
}

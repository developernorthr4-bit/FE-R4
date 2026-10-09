import { api } from '../lib/api'
import type { BackupStatus } from '../lib/backup'

/** BE /backup/* และ /sites/:id/backup — สูตรอยู่ที่ BE-R4/src/backup/calc.ts */

export type BackupRules = {
  targets: Record<string, number>
  dod: { LITHIUM: number; VRLA: number; other: number }
  maxLoadA: number
}

/** ชื่อฟิลด์เป็น snake_case ตามที่ SQL คืนมา (ใช้ชุดเดียวกันทั้งรายงานและรายสถานี) */
export type BackupRow = {
  site_id: string
  site_code: string
  grade: string | null
  province_id: number
  province_name: string
  cabinet_id: string | null
  load_a: number | null
  pm_year: string | null
  pm_date: string | null
  battery_count: number
  nominal_ah: number | null
  usable_ah: number | null
  soh_missing: number
  soh_zero: number
  cap_missing: number
  faulty_count: number
  hours: number | null
  target: number | null
  status: BackupStatus
}

export type BackupBattery = {
  id: string
  bankCode: string | null
  typeCode: string | null
  typeName: string | null
  brand: string | null
  model: string | null
  capacityAh: number | null
  qty: number
  healthPct: number | null
  status: string
  dod: number
  usableAh: number
  /** false = ไม่ถูกนับในสูตร (ไม่ active หรือไม่รู้ความจุ) */
  counted: boolean
}

export type BackupFilters = {
  province?: number | ''
  grade?: string
  /** pass | fail | unknown | ชื่อสถานะ */
  status?: string
  q?: string
}

function params(f: BackupFilters): Record<string, string | number> {
  const p: Record<string, string | number> = {}
  if (f.province) p.province = f.province
  if (f.grade) p.grade = f.grade
  if (f.status) p.status = f.status
  if (f.q?.trim()) p.q = f.q.trim()
  return p
}

export async function getSiteBackup(siteId: string) {
  const res = await api.get<{ rules: BackupRules; backup: BackupRow; batteries: BackupBattery[] }>(
    `/sites/${siteId}/backup`,
  )
  return res.data
}

export async function getBackupRules(): Promise<BackupRules> {
  const res = await api.get<{ rules: BackupRules }>('/backup/rules')
  return res.data.rules
}

export async function saveBackupRules(rules: BackupRules) {
  const res = await api.put<{ rules: BackupRules; changed: boolean }>('/backup/rules', rules)
  return res.data
}

export type BackupRulesChange = {
  changedAt: string
  byName: string | null
  before: BackupRules | null
  after: BackupRules | null
}

export async function getBackupRulesHistory(): Promise<BackupRulesChange[]> {
  const res = await api.get<{ history: BackupRulesChange[] }>('/backup/rules/history')
  return res.data.history
}

export async function getBackupSummary(province?: number | '') {
  const res = await api.get<{ rules: BackupRules; cells: { grade: string | null; status: BackupStatus; n: number }[] }>(
    '/backup/summary', { params: province ? { province } : {} },
  )
  return res.data
}

export async function listBackupSites(f: BackupFilters & { limit?: number; offset?: number }) {
  const res = await api.get<{ sites: BackupRow[]; total: number; limit: number; offset: number }>(
    '/backup/sites', { params: { ...params(f), limit: f.limit ?? 50, offset: f.offset ?? 0 } },
  )
  return res.data
}

/** ดาวน์โหลด xlsx ตามตัวกรองเดียวกับหน้าจอ (blob ผ่าน api เพื่อให้มี token ไปด้วย) */
export async function exportBackup(f: BackupFilters) {
  const res = await api.get<Blob>('/backup/export', { params: params(f), responseType: 'blob', timeout: 120_000 })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `backup_${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

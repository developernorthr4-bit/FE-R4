import { api } from '../lib/api'

export type AppSetting = {
  key: string
  value: string
  description: string | null
  updatedBy: string | null
  updatedAt: string
}

export type AuditStats = {
  /** จำนวนแถวทั้งหมดใน audit_log */
  rows: number
  /** แถวที่ไม่มี actor = มาจาก importer ไม่ใช่การกระทำของคน */
  importRows: number
  /** ขนาด audit_log รวม index */
  bytes: number
  /** ขนาดฐานข้อมูลทั้งก้อน */
  dbBytes: number
  /** โควตาของแพ็กเกจ (Supabase free tier = 500 MB) */
  quotaBytes: number
}

export type SettingsResponse = {
  settings: AppSetting[]
  audit: AuditStats
}

export async function loadSettings(): Promise<SettingsResponse> {
  const res = await api.get<SettingsResponse>('/settings')
  return res.data
}

/** เปิด/ปิดการบันทึก audit_log ทั้งระบบ — คืน changed=false ถ้าค่าเดิมตรงอยู่แล้ว */
export async function setAuditEnabled(enabled: boolean): Promise<{ enabled: boolean; changed: boolean }> {
  const res = await api.patch<{ enabled: boolean; changed: boolean }>('/settings/audit', { enabled })
  return res.data
}

/** 64,266,240 → "61.3 MB" — ตัวเลขดิบอ่านไม่รู้เรื่องเวลาเทียบกับโควตา */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

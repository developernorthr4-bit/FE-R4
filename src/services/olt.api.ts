import { api } from '../lib/api'
import { downloadFile } from '../lib/download'
import type { OltJob, OltJobDetail } from '../lib/olt'

/**
 * เรียก OLT Bot ฝั่ง BE
 *
 * ⚠️ รหัสผ่านของระบบ spantree ส่งไปกับ createJob ครั้งเดียวเท่านั้น
 *    ห้ามเก็บลง localStorage ห้ามใส่ Pinia ห้ามใส่ query string
 *    BE เอาไปล็อกอินทันทีแล้วทิ้ง เหลือแต่คุกกี้ในหน่วยความจำของเซิร์ฟเวอร์
 */

export type CreateJobInput = {
  username: string
  password: string
  vals: string[]
  threshold: number
}

export type CreateJobResult = {
  id: string
  total: number
  queuePosition: number
}

export async function createJob(input: CreateJobInput): Promise<CreateJobResult> {
  const res = await api.post<CreateJobResult>('/olt/jobs', input)
  return res.data
}

export async function listJobs(): Promise<OltJob[]> {
  const res = await api.get<OltJob[]>('/olt/jobs')
  return res.data
}

export async function getJob(id: string): Promise<OltJobDetail> {
  const res = await api.get<OltJobDetail>(`/olt/jobs/${id}`)
  return res.data
}

export async function cancelJob(id: string): Promise<void> {
  await api.post(`/olt/jobs/${id}/cancel`)
}

/**
 * โหลดไฟล์ Excel
 *
 * (ทำไมต้องผ่าน axios / revokeObjectURL — ดู lib/download.ts)
 */
export async function downloadExcel(id: string): Promise<void> {
  await downloadFile(`/olt/jobs/${id}/excel`, { fallbackName: `spantree_${id}.xlsx` })
}

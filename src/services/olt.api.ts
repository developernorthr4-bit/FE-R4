import { api } from '../lib/api'
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
 * ต้องดึงผ่าน axios ไม่ใช่เปิดลิงก์ตรง ๆ เพราะ endpoint ต้องมี Bearer token
 * ซึ่ง <a href> แนบไปให้ไม่ได้ พอได้ blob มาแล้วค่อยสร้างลิงก์ชั่วคราวแล้วกดแทน
 *
 * revokeObjectURL สำคัญ — ถ้าไม่เรียก เบราว์เซอร์จะถือ blob ไว้จนกว่าจะปิดแท็บ
 * โหลดสิบครั้งก็ค้างสิบก้อน
 */
export async function downloadExcel(id: string): Promise<void> {
  const res = await api.get(`/olt/jobs/${id}/excel`, { responseType: 'blob' })

  const disposition = String(res.headers['content-disposition'] ?? '')
  const match = /filename="([^"]+)"/.exec(disposition)
  const filename = match?.[1] ?? `spantree_${id}.xlsx`

  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

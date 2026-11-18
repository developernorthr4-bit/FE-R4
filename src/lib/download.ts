import { api } from './api'

/**
 * สั่งเบราว์เซอร์เซฟ blob เป็นไฟล์
 *
 * แนบ <a> เข้า body ก่อนกด — Firefox บางรุ่นไม่ยอมดาวน์โหลดจากลิงก์ที่ไม่อยู่ในหน้า
 * revokeObjectURL สำคัญ — ถ้าไม่เรียก เบราว์เซอร์จะถือ blob ไว้จนกว่าจะปิดแท็บ โหลดสิบครั้งก็ค้างสิบก้อน
 */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export type DownloadOptions = {
  params?: Record<string, unknown>
  /** ชื่อไฟล์เมื่ออ่านจาก content-disposition ไม่ได้ */
  fallbackName: string
  /** ms · ไม่ใส่ = ค่าเริ่มต้นของ api (60 วิ) */
  timeout?: number
}

/**
 * ดึงไฟล์จาก BE เป็น blob แล้วเซฟ — ต้องผ่าน axios ไม่ใช่ <a href> ตรง ๆ เพราะ endpoint ต้องการ Bearer token
 *
 * ชื่อไฟล์: ลองอ่าน content-disposition ก่อน แต่ตอนนี้ BE ไม่ได้เปิด exposeHeaders
 * เบราว์เซอร์จึงอ่านข้ามโดเมนไม่ได้ และได้ fallbackName เสมอ — คงการอ่านไว้ วันหน้า BE เปิดแล้วได้ชื่อจาก BE ทันที
 */
export async function downloadFile(path: string, opts: DownloadOptions): Promise<void> {
  const res = await api.get<Blob>(path, {
    params: opts.params,
    responseType: 'blob',
    ...(opts.timeout !== undefined ? { timeout: opts.timeout } : {}),
  })
  const cd = String(res.headers['content-disposition'] ?? '')
  saveBlob(res.data, /filename="([^"]+)"/.exec(cd)?.[1] ?? opts.fallbackName)
}

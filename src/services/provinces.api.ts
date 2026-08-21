import { api } from '../lib/api'

export type Province = {
  id: number
  code: string
  nameTh: string
  nameEn: string | null
}

/**
 * รายชื่อ 15 จังหวัดในขอบเขต — เปิดสาธารณะเพราะหน้า register ต้องใช้ก่อนล็อกอิน
 * แคชระดับโมดูล ทั้งหน้า register และหน้าจัดการผู้ใช้เรียกใช้ตัวเดียวกัน
 */
let cache: Province[] | null = null
let inflight: Promise<Province[]> | null = null

export async function loadProvinces(): Promise<Province[]> {
  if (cache) return cache
  inflight ??= api.get<{ provinces: Province[] }>('/provinces')
    .then((res) => {
      cache = res.data.provinces
      return cache
    })
    .finally(() => { inflight = null })
  return inflight
}

import { api } from '../lib/api'

/**
 * ข้อมูลสถานีเท่าที่หน้าจอต้องใช้
 *
 * ไม่ใส่ provinceId/provinceName เพราะ SitePicker ถูกจำกัดด้วยจังหวัดของเหตุการณ์อยู่แล้ว
 * และการทำให้ type แคบลงทำให้ /events/:id ส่งชิปกลับมาได้เลยโดยไม่ต้องยิงเพิ่มอีกรอบ
 */
export type SiteLite = {
  id: string
  siteCode: string
  siteName: string | null
}

export async function searchSites(q: string, provinceId: number, limit = 20) {
  const res = await api.get<{ sites: SiteLite[] }>('/sites/search', {
    params: { q, provinceId, limit },
  })
  return res.data.sites
}

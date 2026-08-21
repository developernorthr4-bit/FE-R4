import { api } from '../lib/api'

export type SiteLite = {
  id: string
  siteCode: string
  siteName: string | null
  provinceId: number
  provinceName: string
  status: string
}

export async function searchSites(q: string, provinceId: number, limit = 20) {
  const res = await api.get<{ sites: SiteLite[] }>('/sites/search', {
    params: { q, provinceId, limit },
  })
  return res.data.sites
}

/** ใช้ตอนเปิดฟอร์มแก้ไข — มี siteId อยู่แล้วแต่ต้องการรหัส/ชื่อมาโชว์บนชิป */
export async function getSitesByIds(ids: string[]) {
  if (ids.length === 0) return []
  const res = await api.post<{ sites: SiteLite[] }>('/sites/by-ids', { ids })
  return res.data.sites
}

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

// ─────────────────────────────────────────────────────────────────────────────
// หน้าแผนที่ติดตามสถานี
// ─────────────────────────────────────────────────────────────────────────────

/**
 * สถานีแบบย่อสำหรับวางหมุด — คีย์สั้นเพราะมี 7,300 แถว
 * i=id · c=รหัส · p=จังหวัด · o=ค่าย · b=จำนวนย่านความถี่
 */
export type MapSite = {
  i: string
  c: string
  p: number
  o: number | null
  lat: number | null
  lng: number | null
  b: number
}

export type SiteSummary = {
  totals: { total: number; withLatLng: number; withoutOperator: number; withoutFrequency: number }
  byProvince: { id: number; name: string; count: number }[]
  operators: { id: number; code: string; name: string; colorSlot: number; count: number }[]
  byBand: { id: number; name: string; count: number }[]
}

export type SiteFrequency = {
  id: string
  bandId: number
  code: string
  tech: string | null
  bandLabel: string | null
  nominalMhz: string | null
  equipmentId: string | null
  status: string
}

export type SiteDevice = {
  id: string
  cpeName: string
  neType: string | null
  mgmtIp: string | null
  status: string
  ringId: string | null
  ringCode: string | null
  topoType: string | null
  hopNo: number | null
  role: string | null
}

export type SiteDetail = {
  id: string
  siteCode: string
  siteName: string | null
  provinceId: number
  provinceName: string
  districtName: string | null
  operatorId: number | null
  operatorCode: string | null
  operatorName: string | null
  operatorColorSlot: number | null
  lat: number | null
  lng: number | null
  address: string | null
  status: string
  isVerified: boolean
  remark: string | null
}

/**
 * โหลดสถานีทั้งหมดครั้งเดียวแล้วแคชไว้
 *
 * ~250 KB บนสาย (gzip แล้ว) โหลดรอบเดียวจบ หลังจากนั้นการค้นหาและกรอง
 * ทุกอย่างทำในเครื่อง = 0 ms ไม่ต้องยิงข้ามทวีปทุกครั้งที่เลื่อนแผนที่
 */
let mapCache: MapSite[] | null = null
let mapInflight: Promise<MapSite[]> | null = null

export async function loadMapSites(): Promise<MapSite[]> {
  if (mapCache) return mapCache
  mapInflight ??= api.get<{ sites: MapSite[] }>('/sites/map')
    .then((res) => {
      mapCache = res.data.sites
      return mapCache
    })
    .finally(() => { mapInflight = null })
  return mapInflight
}

export async function getSiteSummary() {
  const res = await api.get<SiteSummary>('/sites/summary')
  return res.data
}

export async function getSiteDetail(id: string) {
  const res = await api.get<{
    site: SiteDetail; frequencies: SiteFrequency[]; devices: SiteDevice[]
  }>(`/sites/${id}`)
  return res.data
}

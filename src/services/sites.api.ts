import { api } from '../lib/api'
import type { SiteAssets } from '../lib/assets'
import type { SiteFilters, SitePayload, SiteRow, SiteStatus } from '../lib/sites'

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

// ─────────────────────────────────────────────────────────────────────────────
// จัดการสถานี (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

/*
 * endpoint ทั้งหมดในหมวดนี้เขียนแล้วที่ BE-R4/src/routes/sites.ts
 *
 *   GET    /sites/lookups            → { operators[], districts[] }
 *   GET    /sites?q&province&operator&status&includeDeleted&limit&offset
 *                                    → { sites[], total, limit, offset }
 *   POST   /sites          body = SitePayload         → { site }
 *   PATCH  /sites/:id      body = Partial<SitePayload> → { site }
 *   DELETE /sites/:id                → 204  (soft delete: เซ็ต deleted_at)
 *   POST   /sites/:id/restore        → 204  (เซ็ต deleted_at กลับเป็น null)
 *
 * 🪤 กับดักการประกาศ route: /sites/lookups ต้องมาก่อน /sites/:id เสมอ
 *    ไม่งั้น Hono จะจับคำว่า "lookups" เป็นค่าของ :id แล้วได้ 404 แบบงง ๆ
 *    (เหมือนที่คอมเมนต์ไว้แล้วสำหรับ /map และ /summary)
 *
 * 🪤 กติกาสิทธิ์: editor เขียนได้เฉพาะจังหวัดใน province_scope ของตัวเอง
 *    ตอน PATCH ที่ย้ายจังหวัด ต้องตรวจ canWriteProvince ทั้งจังหวัดเดิมและจังหวัดใหม่
 *    ไม่งั้น editor ของเชียงใหม่จะย้ายสถานีของน่านเข้ามาเป็นของตัวเองได้
 */

export type SiteLookups = {
  operators: { id: number; code: string; nameTh: string; colorSlot: number }[]
  /**
   * อำเภอทั้ง 15 จังหวัดในขอบเขต — มีแค่ 173 แถว จึงส่งมาทั้งก้อนครั้งเดียว
   * แล้วให้ฟอร์มกรองตามจังหวัดในเครื่อง ดีกว่ายิง /districts?provinceId= ใหม่
   * ทุกครั้งที่เปลี่ยนจังหวัด — เสียเวลาข้ามทวีป ~150 ms เพื่อข้อมูลสิบกว่าแถว
   */
  districts: { id: number; provinceId: number; nameTh: string }[]
}

let lookupsCache: SiteLookups | null = null
let lookupsInflight: Promise<SiteLookups> | null = null

export async function loadSiteLookups(): Promise<SiteLookups> {
  if (lookupsCache) return lookupsCache
  lookupsInflight ??= api.get<SiteLookups>('/sites/lookups')
    .then((res) => {
      lookupsCache = res.data
      return lookupsCache
    })
    .finally(() => { lookupsInflight = null })
  return lookupsInflight
}

/**
 * ล้างแคชที่ค้างอยู่ในหน่วยความจำ
 *
 * ต้องเรียกหลังทุกการเขียน ไม่งั้นแก้พิกัดหรือค่ายเสร็จแล้วกลับไปหน้าแผนที่
 * จะยังเห็นของเก่า เพราะ loadMapSites() คืนแคชโดยไม่ยิงซ้ำ
 * เรียกให้เองในฟังก์ชันเขียนข้างล่างทุกตัว ผู้เรียกจึงลืมไม่ได้
 */
export function invalidateSiteCaches() {
  mapCache = null
  lookupsCache = null
}

export async function listSites(f: SiteFilters) {
  const params: Record<string, string | number> = {}
  if (f.q?.trim()) params.q = f.q.trim()
  if (f.province) params.province = f.province
  // -1 คือ "ยังไม่ระบุค่าย" — ส่งเป็นคำว่า none ไม่ใช่ -1
  // เพราะฝั่ง BE ที่รับเป็นตัวเลขแล้วเผลอเอาไปใส่ where operator_id = -1 จะได้ 0 แถวเงียบ ๆ
  if (f.operator === -1) params.operator = 'none'
  else if (f.operator) params.operator = f.operator
  if (f.status) params.status = f.status
  if (f.includeDeleted) params.includeDeleted = '1'
  params.limit = f.limit ?? 25
  params.offset = f.offset ?? 0

  const res = await api.get<{ sites: SiteRow[]; total: number; limit: number; offset: number }>(
    '/sites', { params },
  )
  return res.data
}

/**
 * แถวที่ POST/PATCH ส่งกลับมา — คอลัมน์ของตาราง sites ล้วน ๆ
 *
 * ไม่ใช่ SiteDetail เพราะ BE ใช้ .returning() ซึ่งให้เฉพาะคอลัมน์ของตารางนั้น
 * ไม่มี provinceName / operatorName ที่ต้อง join มา และไม่ควรให้ BE join เพิ่ม
 * เพราะหน้าจอเด้งออกทันทีหลังบันทึก อ่านแค่ siteCode ไปขึ้นข้อความเท่านั้น
 */
export type SavedSite = {
  id: string
  siteCode: string
  siteName: string | null
  provinceId: number
  districtId: number | null
  operatorId: number | null
  lat: number | null
  lng: number | null
  address: string | null
  status: SiteStatus
  isVerified: boolean
  remark: string | null
}

export async function createSite(payload: SitePayload) {
  const res = await api.post<{ site: SavedSite }>('/sites', payload)
  invalidateSiteCaches()
  return res.data.site
}

export async function updateSite(id: string, payload: Partial<SitePayload>) {
  const res = await api.patch<{ site: SavedSite }>(`/sites/${id}`, payload)
  invalidateSiteCaches()
  return res.data.site
}

/**
 * ลบแบบซ่อน (soft delete) — เซ็ต deleted_at ไม่ได้ลบแถวจริง
 *
 * ต่างจากเหตุการณ์ที่ลบถาวรได้ เพราะสถานีมีความถี่ อุปกรณ์ CPE และเหตุการณ์
 * ห้อยอยู่ด้วย foreign key แบบ cascade — ลบจริงทีเดียวข้อมูลเหล่านั้นหายตามหมด
 * และ importer รอบหน้าจะสร้างสถานีเดิมขึ้นมาใหม่แบบไม่มีประวัติ
 */
export async function deleteSite(id: string) {
  await api.delete(`/sites/${id}`)
  invalidateSiteCaches()
}

export async function restoreSite(id: string) {
  await api.post(`/sites/${id}/restore`)
  invalidateSiteCaches()
}

// ─────────────────────────────────────────────────────────────────────────────
// ตู้ / อุปกรณ์ / แบตเตอรี่ ในสถานี
// ─────────────────────────────────────────────────────────────────────────────

/*
 * ทุกตัวในหมวดนี้ "ลบถาวร" ไม่ใช่ soft delete ต่างจากสถานีข้างบน
 *
 * ผลตรวจ PM ผูกกับตู้และก้อนแบตด้วย on delete cascade และตอนนี้ทุกแถวมีผลตรวจ
 * ครบ 100% ลบหนึ่งแถวคือผลตรวจของแถวนั้นหายด้วยเสมอ — BE จึงส่ง pmCheckCount
 * มากับทุกแถวเพื่อให้กล่องยืนยันเขียนจำนวนที่จะหายได้ก่อนกด
 *
 * ไม่มีแคชในหมวดนี้เลย (ต่างจาก loadMapSites/loadSiteLookups) เพราะข้อมูลของ
 * สถานีเดียวมีไม่กี่สิบแถว และแผงต้องเห็นผลทันทีหลังกดเพิ่ม/ลบ
 */

/** ส่งขึ้นไปตอนเพิ่ม/แก้ตู้ — สตริงว่างแปลว่า "ไม่ระบุ" BE แปลงเป็น null ให้เอง */
export type CabinetPayload = {
  cabinetCode: string
  assetTypeId: string
  brand: string
  model: string
  serialNo: string
  installedAt: string
  status: string
  remark: string
}

export type BatteryPayload = {
  cabinetId: string
  bankCode: string
  assetTypeId: string
  brand: string
  model: string
  voltageV: string
  capacityAh: string
  stringCount: string
  qty: string
  installDate: string
  expiryDate: string
  healthPct: string
  status: string
  remark: string
}

export type EquipmentPayload = {
  cabinetId: string
  assetTypeId: string
  name: string
  brand: string
  model: string
  serialNo: string
  mgmtIp: string
  qty: string
  installedAt: string
  warrantyUntil: string
  status: string
  remark: string
}

export async function getSiteAssets(siteId: string): Promise<SiteAssets> {
  const res = await api.get<SiteAssets>(`/sites/${siteId}/assets`)
  return res.data
}

export async function createCabinet(siteId: string, payload: CabinetPayload) {
  await api.post(`/sites/${siteId}/cabinets`, payload)
}

export async function updateCabinet(siteId: string, id: string, payload: CabinetPayload) {
  await api.patch(`/sites/${siteId}/cabinets/${id}`, payload)
}

export async function deleteCabinet(siteId: string, id: string) {
  await api.delete(`/sites/${siteId}/cabinets/${id}`)
}

export async function createBattery(siteId: string, payload: BatteryPayload) {
  await api.post(`/sites/${siteId}/batteries`, payload)
}

export async function updateBattery(siteId: string, id: string, payload: BatteryPayload) {
  await api.patch(`/sites/${siteId}/batteries/${id}`, payload)
}

export async function deleteBattery(siteId: string, id: string) {
  await api.delete(`/sites/${siteId}/batteries/${id}`)
}

export async function createEquipment(siteId: string, payload: EquipmentPayload) {
  await api.post(`/sites/${siteId}/equipments`, payload)
}

export async function updateEquipment(siteId: string, id: string, payload: EquipmentPayload) {
  await api.patch(`/sites/${siteId}/equipments/${id}`, payload)
}

export async function deleteEquipment(siteId: string, id: string) {
  await api.delete(`/sites/${siteId}/equipments/${id}`)
}

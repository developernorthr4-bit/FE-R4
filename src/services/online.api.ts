import { api } from '../lib/api'

/**
 * โครงข่ายงาน online — สถานีหลัก → OLT → L1 → L2 → บ้านลูกค้า
 *
 * ทุกตัวที่นี่ "อ่านอย่างเดียว" รอบนี้เก็บข้อมูลอย่างเดียวยังไม่มีการแก้ผ่านหน้าจอ
 * การแก้ทำที่ไฟล์ต้นทางแล้ว import ใหม่ (npm run import:online ฝั่ง BE)
 *
 * ⚠️ ไม่มีแคชโดยตั้งใจ ต่างจาก loadMapSites ที่แคชสถานีทั้งภาคไว้ในหน่วยความจำ
 *    ข้อมูลชุดนี้มี 96,000 โหนด ถ้าแคชแบบเดียวกันคือถือทั้งโครงข่ายไว้ในเบราว์เซอร์
 *    ที่นี่จึงขอทีละกิ่งตามที่กดกาง แล้วให้ตัว component จำผลไว้เองระหว่างเปิดหน้า
 */

/** เหตุผลที่ OLT ยังผูกกับสถานีไม่ได้ — ค่าตรงกับ enum online_link_status ฝั่ง BE */
export type OnlineLinkStatus = 'linked' | 'site_missing' | 'unknown_code' | 'na'

export const LINK_STATUS_LABEL: Record<OnlineLinkStatus, string> = {
  linked: 'ผูกกับสถานีแล้ว',
  site_missing: 'ยังไม่มีสถานีนี้ในระบบ',
  unknown_code: 'รหัสสถานีไม่ถูกต้อง',
  na: 'ไฟล์ไม่ได้ระบุสถานี',
}

/** คำอธิบายว่า "แล้วต้องทำยังไงต่อ" — แต่ละสถานะแก้คนละทาง */
export const LINK_STATUS_HINT: Record<OnlineLinkStatus, string> = {
  linked: '',
  site_missing: 'รหัสถูกต้อง แต่ยังไม่มีสถานีนี้ในตารางสถานี — เพิ่มสถานีแล้วจะผูกให้เอง',
  unknown_code: 'ไม่พบรหัสนี้ทั้งในระบบและในไฟล์ Uplink — น่าจะพิมพ์ผิด ต้องแก้ที่ไฟล์ OLT.xlsx',
  na: 'ไฟล์ไม่ได้บอกว่า OLT ตัวนี้อยู่สถานีไหน — ต้องไปตามหาข้อมูลเพิ่ม',
}

export type OnlineOlt = {
  id: string
  oltCode: string
  lat: number | null
  lng: number | null
  linkStatus: OnlineLinkStatus
  l1Count: number
  l2Count: number
}

export type OnlineNode = {
  id: string
  nodeCode: string
  level: 'l1' | 'l2'
  lat: number | null
  lng: number | null
  /**
   * false = เลิกใช้งานแล้ว — ไฟล์ต้นทางบอกด้วยการไม่ให้พิกัดมา
   * ต้นไม้ยังแสดงตัวพวกนี้อยู่เพราะเป็นประวัติของสถานี ส่วนแผนที่ไม่วาด
   */
  active: boolean
  /** จำนวนลูกที่มีจริง — ใช้ตัดสินว่าจะแสดงปุ่มกางไหม โดยไม่ต้องยิงถามก่อน */
  childCount: number
}

export type OrphanOlt = OnlineOlt & {
  /** รหัสสถานีตามที่เขียนไว้ในไฟล์ ผิดหรือถูกก็ตามนั้น */
  parentSiteCode: string | null
}

export type OrphanPage = {
  olts: OrphanOlt[]
  total: number
  limit: number
  offset: number
  /** นับทั้งตารางเสมอ ไม่ใช่เฉพาะหน้าที่เห็น */
  summary: Partial<Record<OnlineLinkStatus, number>>
}

export type OnlineSummary = {
  olts: Partial<Record<OnlineLinkStatus, number>>
  l1: number
  l2: number
  sitesWithOlt: number
}

export async function getSiteOlts(siteId: string): Promise<OnlineOlt[]> {
  const res = await api.get<{ olts: OnlineOlt[] }>(`/online/sites/${siteId}/olts`)
  return res.data.olts
}

/**
 * ชั้นถัดจาก OLT — ปกติเป็น L1 ทั้งหมด
 * แต่มี L2 บางตัวที่ไฟล์ไม่ได้บอก L1 ID จึงห้อยกับ OLT ตรง ๆ และโผล่ที่นี่ด้วย
 */
export async function getOltChildren(oltId: string): Promise<OnlineNode[]> {
  const res = await api.get<{ nodes: OnlineNode[] }>(`/online/olts/${oltId}/children`)
  return res.data.nodes
}

export async function getNodeChildren(nodeId: string): Promise<OnlineNode[]> {
  const res = await api.get<{ nodes: OnlineNode[] }>(`/online/nodes/${nodeId}/children`)
  return res.data.nodes
}

export async function listOrphanOlts(params: {
  status?: string
  q?: string
  limit?: number
  offset?: number
}): Promise<OrphanPage> {
  const res = await api.get<OrphanPage>('/online/orphans', { params })
  return res.data
}

export async function getOnlineSummary(): Promise<OnlineSummary> {
  const res = await api.get<OnlineSummary>('/online/summary')
  return res.data
}

/** จุดที่ผู้ใช้กดค้างไว้ — ใช้ส่งต่อระหว่างต้นไม้กับแผนที่ ให้ทั้งสองฝั่งชี้ที่เดียวกัน */
export type OnlineFocus = {
  id: string
  kind: 'olt' | 'node'
  /** OLT ต้นสังกัด — ต้นไม้ต้องกางชั้นนี้ก่อนถึงจะเห็นตัวที่ถูกเลือก */
  oltId: string
  /** L1 ที่คร่อมอยู่ ถ้ามี — null แปลว่าห้อยกับ OLT ตรง ๆ */
  parentId: string | null
}

export type GeoOlt = {
  id: string
  code: string
  lat: number | null
  lng: number | null
}

export type GeoNode = {
  id: string
  code: string
  level: 'l1' | 'l2'
  oltId: string
  parentId: string | null
  lat: number | null
  lng: number | null
  childCount: number
}

export type SiteGeo = {
  site: { lat: number | null; lng: number | null }
  olts: GeoOlt[]
  nodes: GeoNode[]
  /** false = ยังไม่ได้ส่ง L2 มา (สถานีใหญ่เกิน) ต้องขอเพิ่มด้วย withL2 */
  l2Included: boolean
  l2Total: number
  /** จำนวนจุดที่วาดไม่ได้เพราะไม่มีพิกัด — บอกผู้ใช้ ไม่ใช่ซ่อนเงียบ ๆ */
  noCoord: number
  /** โหนดที่เลิกใช้แล้วของสถานีนี้ — ไม่ได้ส่งมาใน nodes ส่งมาแค่จำนวน */
  retired: number
}

/**
 * ทุกจุดของสถานีนี้พร้อมกันในรอบเดียว สำหรับวาดแผนที่
 *
 * ต่างจาก getOltChildren/getNodeChildren ที่ขอทีละชั้นตามที่กดกาง — แผนที่ต้อง
 * รู้ทุกจุดก่อนถึงจะจัดกรอบและลากเส้นได้ ถ้าใช้ของเดิมจะเป็นสิบ ๆ request ต่อครั้ง
 */
export async function getSiteGeo(siteId: string, withL2 = false): Promise<SiteGeo> {
  const res = await api.get<SiteGeo>(`/online/sites/${siteId}/geo`, {
    params: withL2 ? { l2: 1 } : undefined,
  })
  return res.data
}

/* ═══════════════════════════════════════════════════════════════════════════
 * แผนที่รวมทั้งภาค
 * ═══════════════════════════════════════════════════════════════════════════ */

/** ชั้นของโครงข่าย เรียงจากบนลงล่าง */
export type MapKind = 'site' | 'olt' | 'l1' | 'l2'

/**
 * ข้อมูลหนึ่งชั้นในรูป "คอลัมน์" ไม่ใช่ array ของ object
 *
 * ทุก array ยาวเท่ากันและ index เดียวกันคือจุดเดียวกัน — 30,000 จุดแบบ object
 * คือเขียนชื่อคีย์ซ้ำ 30,000 ชุด แบบนี้เขียนครั้งเดียว payload เล็กลงเกินครึ่ง
 *
 * py/px คือพิกัดของพ่อ ส่งมาด้วยเพราะพ่ออาจอยู่นอกกรอบจอ ถ้าไม่มีเส้นที่วิ่งออก
 * นอกจอจะหายไป ทั้งที่เป็นเส้นผิดปกติที่อยากเห็นที่สุด · null = ไม่มีพ่อให้ลาก
 *
 * ตัวระบุตัวตนคือ "รหัส" ไม่ใช่ uuid — รหัสไม่ซ้ำทั้งตารางอยู่แล้วและสั้นกว่ามาก
 */
export type MapLayer = {
  code: string[]
  y: number[]
  x: number[]
  py: (number | null)[]
  px: (number | null)[]
}

export type MapView = {
  zoom: number
  /** ระดับซูมที่ BE เริ่มส่งแต่ละชั้นมาให้ */
  minZoom: { l1: number; l2: number }
  site: MapLayer
  olt: MapLayer
  l1: MapLayer
  l2: MapLayer
  /** true = ชั้นนั้นชนเพดานแล้ว ที่เห็นไม่ใช่ทั้งหมดในกรอบ */
  capped: { site: boolean; l1: boolean; l2: boolean }
  /** จำนวนทั้งหมดในระบบ (หรือในจังหวัดที่กรอง) — ขอมาเฉพาะตอนที่ต้องใช้ */
  totals?: Record<MapKind, number>
}

export type MapHit = { kind: MapKind; code: string; lat: number | null; lng: number | null }
export type ChainStep = { kind: MapKind; code: string; lat: number | null; lng: number | null }

/**
 * ขอจุดทั้งหมดที่อยู่ในกรอบจอ ณ ระดับซูมนี้
 *
 * ยิงใหม่ทุกครั้งที่แพน/ซูม (หน้าจอ debounce ให้แล้ว) และไม่แคชโดยตั้งใจ —
 * ข้อมูล 96,000 โหนดถ้าสะสมไว้ในเบราว์เซอร์คือถือทั้งโครงข่ายไว้ในหน่วยความจำ
 */
export async function getMapView(p: {
  bbox: [number, number, number, number]
  zoom: number
  province?: number | ''
  totals?: boolean
}): Promise<MapView> {
  const params: Record<string, string | number> = {
    bbox: p.bbox.join(','),
    zoom: Math.round(p.zoom),
  }
  if (p.province) params.province = p.province
  if (p.totals) params.totals = 1
  const res = await api.get<MapView>('/online/map', { params })
  return res.data
}

/** ค้นรหัสข้ามทั้งสี่ชั้น — ตัวที่ขึ้นต้นด้วยคำค้นมาก่อน */
export async function searchOnline(q: string): Promise<MapHit[]> {
  const res = await api.get<{ hits: MapHit[] }>('/online/search', { params: { q } })
  return res.data.hits
}

/**
 * สายโซ่จากจุดนี้ขึ้นไปถึงสถานี เรียงจากบนลงล่าง
 * ต้องถาม BE ไม่ใช่ไล่จากข้อมูลที่โหลดมา เพราะพ่อของพ่ออาจอยู่นอกกรอบจอ
 */
export async function getChain(kind: MapKind, code: string): Promise<ChainStep[]> {
  const res = await api.get<{ chain: ChainStep[] }>(`/online/chain/${kind}/${encodeURIComponent(code)}`)
  return res.data.chain
}

/* ═══════════════════════════════════════════════════════════════════════════
 * รัศมีรอบจุดที่เลือก — "รอบตัวนี้มีอะไรอยู่บ้าง"
 * ═══════════════════════════════════════════════════════════════════════════ */

/** ชั้นถัดลงไปของแต่ละชั้น — l2 เป็นชั้นล่างสุด จึงไม่มีรัศมีให้ดู */
export const CHILD_OF: Record<MapKind, MapKind | null> = {
  site: 'olt',
  olt: 'l1',
  l1: 'l2',
  l2: null,
}

export type RadiusItem = {
  code: string
  m: number
  lat: number
  lng: number
  /** true = ขึ้นกับจุดที่เลือกอยู่จริง · false = อยู่ใกล้แต่ขึ้นกับตัวอื่น */
  mine: boolean
  parentCode: string | null
}

export type RadiusResult = {
  origin: { kind: MapKind; code: string; lat: number; lng: number }
  childKind: MapKind
  km: number
  items: RadiusItem[]
  summary: { total: number; mine: number; others: number; capped: boolean }
}

/** รายชื่อชั้นถัดไปที่อยู่ในรัศมีของจุดนี้ */
export async function getRadius(kind: MapKind, code: string, km: number): Promise<RadiusResult> {
  const res = await api.get<RadiusResult>(
    `/online/radius/${kind}/${encodeURIComponent(code)}`,
    { params: { km } },
  )
  return res.data
}

/**
 * ดาวน์โหลดรายการในรัศมีเป็นไฟล์ Excel
 *
 * ต้องผ่าน axios ไม่ใช่ <a href> ตรง ๆ เพราะ endpoint ต้องการ Bearer token
 * ซึ่งลิงก์ธรรมดาไม่ได้แนบไปให้ — ดึงเป็น blob แล้วค่อยสั่งเซฟจากฝั่งเบราว์เซอร์
 */
export async function downloadRadiusXlsx(kind: MapKind, code: string, km: number): Promise<void> {
  const res = await api.get<Blob>(
    `/online/radius/${kind}/${encodeURIComponent(code)}/export`,
    { params: { km }, responseType: 'blob' },
  )
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `radius_${code}_${km}km.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ═══════════════════════════════════════════════════════════════════════════
 * เคเบิลใยแก้ว — ชั้นข้อมูลประกอบ
 * ═══════════════════════════════════════════════════════════════════════════ */

export type CableGroup = {
  /** จำนวนคอร์ · 0 = ไฟล์ไม่ได้ระบุ */
  core: number
  /** แต่ละเส้นเป็น [lat, lng, lat, lng, ...] แบนตัวเดียว ลำดับเดียวกับ Leaflet */
  lines: number[][]
}

export type CableView = {
  zoom: number
  /** ต่ำกว่าซูมนี้ BE ไม่ส่งเคเบิลมาเลย */
  minZoom: number
  /** เว้นจุดทุก ๆ กี่จุด (LOD) — 1 = ส่งครบทุกจุด */
  step: number
  groups: CableGroup[]
  total: number
  capped: boolean
}

export type CableHit = {
  code: string
  core: number | null
  source: string | null
  lengthM: number
  vertices: number
  /** ห่างจากจุดที่กดกี่เมตร */
  m: number
}

export type CableSummary = {
  cores: { core: number | null; cables: number; km: number }[]
  total: number
}

/**
 * เคเบิลในกรอบจอ จัดกลุ่มตามจำนวนคอร์มาให้แล้ว
 *
 * ไม่มีรหัสของแต่ละเส้นติดมา ตั้งใจให้เล็ก — 4,185 เส้นในกรอบเดียวถ้าแนบรหัสมาด้วย
 * คือส่วนต่างอีกหกสิบกว่ากิโลไบต์ต่อการแพนหนึ่งครั้ง ตอนกดดูรายละเอียดค่อยถาม
 * getCableAt ทีละครั้งแทน
 */
export async function getCables(p: {
  bbox: [number, number, number, number]
  zoom: number
  cores?: number[]
}): Promise<CableView> {
  const params: Record<string, string | number> = {
    bbox: p.bbox.join(','),
    zoom: Math.round(p.zoom),
  }
  if (p.cores?.length) params.cores = p.cores.join(',')
  const res = await api.get<CableView>('/online/cables', { params })
  return res.data
}

/** เส้นที่อยู่ใกล้จุดที่กดที่สุด ภายในระยะ m เมตร */
export async function getCableAt(lat: number, lng: number, m: number): Promise<CableHit | null> {
  const res = await api.get<{ cable: CableHit | null }>('/online/cables/at', {
    params: { lat, lng, m },
  })
  return res.data.cable
}

export async function getCableSummary(): Promise<CableSummary> {
  const res = await api.get<CableSummary>('/online/cables/summary')
  return res.data
}

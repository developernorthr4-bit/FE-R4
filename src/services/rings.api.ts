import { api } from '../lib/api'

/**
 * วงสื่อสัญญาณ (CPE ring / chain) — อ่านอย่างเดียวทั้งไฟล์
 *
 * ข้อมูลมาจากไฟล์ CPE ring แก้ผ่านหน้าจอไม่ได้เลย (เหมือนอุปกรณ์ CPE) ต้องแก้ไฟล์
 * ต้นทางแล้ว import ใหม่ จึงไม่มีฟังก์ชัน create/update/delete ที่นี่โดยตั้งใจ
 *
 * ไม่แคชผลไว้ ต่างจาก loadMapSites — วงมี 1,123 วง แต่การเปิดดูเป็นการเปิดทีละวง
 * ไม่ใช่การกางทั้งภาคพร้อมกัน แคชแล้วได้ความเสี่ยงเรื่องข้อมูลเก่ามากกว่าความเร็ว
 */

/** สมาชิกหนึ่งตัวในวง — หนึ่งแถว = อุปกรณ์ CPE หนึ่งตัว (1 สถานีมีได้หลายตัว) */
export type RingMember = {
  ringId: string
  memberId: string
  /** null = ไฟล์ต้นทางไม่ได้ให้ลำดับมา · ค่าซ้ำกันได้จริง (72 วง) */
  hopNo: number | null
  role: string | null
  /** manual = คนแก้ไว้เอง importer จะไม่เขียนทับ */
  roleSource: string
  cpeId: string
  cpeName: string
  neType: string | null
  mgmtIp: string | null
  cpeStatus: string
  siteId: string
  siteCode: string
  siteName: string | null
  siteGrade: string | null
  siteStatus: string
  provinceName: string | null
  lat: number | null
  lng: number | null
  /** รหัสโหนดสื่อสัญญาณที่วิ่งขึ้นไปหา — มีเฉพาะหัว/ปลายวง */
  uplinkA: string | null
  uplinkB: string | null
}

/**
 * ต้นทางของวง — สองชั้นที่ตอบคำถามคนละแบบ
 *   headNode   โหนดสื่อสัญญาณต้นทาง (DN/PN) — ล้มแล้ววงตายทั้งวง
 *   headSite   สถานีหัววง — จุดที่ทีมหน้างานเข้าไปไล่ก่อน
 *   tail*      ทางออกที่สองของวงปิด (วงเปิดจะเป็น null)
 * ทุกช่องเป็น null ได้ เพราะ 156 วงไม่มี head เลย (ไฟล์ไม่ได้ให้ uplink มา)
 */
export type RingSource = {
  headSiteId: string | null
  headSiteCode: string | null
  headCpeName: string | null
  headNode: string | null
  tailSiteId: string | null
  tailSiteCode: string | null
  tailNode: string | null
}

/** คำเตือนคุณภาพข้อมูลของวงนั้น — บอกตรง ๆ ดีกว่าให้หน้าจอเดาแทนไฟล์ */
export type RingWarnings = {
  noHead: boolean
  dupHop: boolean
}

/** หนึ่งแถวในรายการวง */
export type RingHeader = {
  id: string
  ringCode: string
  topoType: string | null
  isActive: boolean
  hopCount: number
  provinceId: number | null
  provinceName: string | null
  parentRingId: string | null
  parentRingCode: string | null
  memberCount: number
  /** น้อยกว่า memberCount ได้ ถ้าสถานีเดียวมี CPE หลายตัวในวงเดียวกัน */
  siteCount: number
  childCount: number
  headSiteId: string | null
  headSiteCode: string | null
  headCpeName: string | null
  sourceNode: string | null
}

export type RingPage = {
  rings: RingHeader[]
  total: number
  limit: number
  offset: number
}

export type RingSummary = {
  total: number
  withoutHead: number
  children: number
  byTopo: { topoType: string | null; n: number }[]
  sitesWithRing: number
  /** สถานีที่ไม่มี CPE ในไฟล์ ring เลย — อธิบายว่าทำไมเปิดสถานีแล้วมักไม่เห็นวง */
  sitesWithoutRing: number
}

export type RingChild = {
  id: string
  ringCode: string
  topoType: string | null
  memberCount: number
  anchorSiteCode: string | null
}

export type RingDetail = RingHeader & {
  remark: string | null
  pnNode: string | null
  pnNodeType: string | null
  rnNode: string | null
  rnNodeType: string | null
  parentTopoType: string | null
  /** จุดที่วงนี้เกาะวงแม่ — อุปกรณ์ตัวนี้อยู่บนวงแม่ ไม่ใช่ในวงนี้ */
  anchorCpeName: string | null
  anchorSiteId: string | null
  anchorSiteCode: string | null
  source: RingSource
  warnings: RingWarnings
}

/** วงหนึ่งวงพร้อมสมาชิก — รูปแบบที่การ์ดในหน้าสถานีใช้ */
export type RingWithMembers = RingHeader & {
  source: RingSource
  warnings: RingWarnings
  members: RingMember[]
}

export type RingListParams = {
  q?: string
  province?: number
  topo?: string
  /** '1' = เอาเฉพาะวงที่ไฟล์ไม่ได้บอกต้นทาง (รายการงานค้าง) */
  noHead?: '1'
  limit?: number
  offset?: number
}

export async function listRings(params: RingListParams = {}): Promise<RingPage> {
  const res = await api.get<RingPage>('/rings', { params })
  return res.data
}

export async function getRingSummary(): Promise<RingSummary> {
  const res = await api.get<RingSummary>('/rings/summary')
  return res.data
}

export async function getRing(id: string): Promise<{
  ring: RingDetail
  members: RingMember[]
  children: RingChild[]
}> {
  const res = await api.get<{ ring: RingDetail; members: RingMember[]; children: RingChild[] }>(`/rings/${id}`)
  return res.data
}

/**
 * วงทั้งหมดของสถานีหนึ่ง พร้อมสมาชิกครบทุกวงในคำขอเดียว
 *
 * คืนเป็นอาเรย์เสมอ — 202 สถานีอยู่มากกว่าหนึ่งวง ถ้าหน้าจอสมมุติว่ามีวงเดียว
 * จะโชว์ไม่ครบแบบเงียบ ๆ ซึ่งแย่กว่าไม่โชว์เลย
 */
export async function getSiteRings(siteId: string): Promise<RingWithMembers[]> {
  const res = await api.get<{ rings: RingWithMembers[] }>(`/rings/by-site/${siteId}`)
  return res.data.rings
}

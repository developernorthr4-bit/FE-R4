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

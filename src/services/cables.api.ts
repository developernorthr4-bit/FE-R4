import { api } from '../lib/api'

/**
 * เคเบิลใยแก้ว — แยกไฟล์จาก online.api.ts เพราะไม่ใช่ของงาน online อย่างเดียว
 *
 * สายชุดเดียวกันนี้ใช้ร่วมกันทั้งงาน online และงาน mobile ฝั่ง BE จึงเป็น
 * /cables ไม่ใช่ /online/cables และตารางชื่อ cables ไม่ใช่ online_cables
 * (เคยตั้งชื่อผิดตอนแรก แก้ใน migration 0016)
 */
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
  const res = await api.get<CableView>('/cables', { params })
  return res.data
}

/** เส้นที่อยู่ใกล้จุดที่กดที่สุด ภายในระยะ m เมตร */
export async function getCableAt(lat: number, lng: number, m: number): Promise<CableHit | null> {
  const res = await api.get<{ cable: CableHit | null }>('/cables/at', {
    params: { lat, lng, m },
  })
  return res.data.cable
}

export async function getCableSummary(): Promise<CableSummary> {
  const res = await api.get<CableSummary>('/cables/summary')
  return res.data
}

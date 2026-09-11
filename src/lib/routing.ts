/**
 * เส้นทางเดินทางตามถนน — ถาม OSRM demo server ตรงจากเบราว์เซอร์
 *
 * ใช้ router.project-osrm.org เพราะฟรี ไม่ต้องมี API key แบบเดียวกับ tile ของ
 * OpenStreetMap ที่ใช้อยู่ ข้อแลกคือเป็นเซิร์ฟเวอร์สาธารณะ ไม่รับประกัน uptime —
 * ผู้เรียกต้องรับมือกรณีล้มเอง (แผนที่สำรวจวาดเส้นตรง + ระยะทางอากาศแทน)
 * ถ้าวันหน้าใช้หนัก ตั้ง OSRM เองแล้วเปลี่ยนแค่ OSRM_BASE บรรทัดเดียว
 *
 * โปรไฟล์ driving อย่างเดียว ไม่มีข้อมูลจราจร — เวลาที่ได้เป็น "โดยประมาณ" จริง ๆ
 */
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'
const TIMEOUT_MS = 10_000

export type LatLng = [number, number]

export type RouteLeg = {
  /** ระยะทางถนน (เมตร) */
  m: number
  /** เวลาโดยประมาณ (วินาที) */
  sec: number
}

export type RouteResult = {
  legs: RouteLeg[]
  /** เส้นทางทั้งสาย [lat, lng][] ลำดับเดียวกับ Leaflet */
  line: LatLng[]
  m: number
  sec: number
}

type OsrmResponse = {
  code: string
  message?: string
  routes?: {
    distance: number
    duration: number
    geometry: { coordinates: [number, number][] }
    legs: { distance: number; duration: number }[]
  }[]
}

/**
 * เส้นทางผ่านจุดตามลำดับ (จุดแรก = จุดเริ่ม) ต้องมีอย่างน้อย 2 จุด
 * OSRM รับพิกัดเป็น lng,lat (สลับกับ Leaflet) และคั่นจุดด้วย ;
 */
export async function routeVia(points: LatLng[]): Promise<RouteResult> {
  if (points.length < 2) throw new Error('ต้องมีจุดอย่างน้อย 2 จุด')
  const coords = points.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';')
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson&steps=false`

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  let body: OsrmResponse
  try {
    const res = await fetch(url, { signal: ctl.signal })
    if (!res.ok) throw new Error(`OSRM ตอบ ${res.status}`)
    body = (await res.json()) as OsrmResponse
  } finally {
    clearTimeout(timer)
  }
  const route = body.routes?.[0]
  if (body.code !== 'Ok' || !route) {
    throw new Error(body.message || 'OSRM หาเส้นทางไม่ได้')
  }
  return {
    legs: route.legs.map((l) => ({ m: l.distance, sec: l.duration })),
    line: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng),
    m: route.distance,
    sec: route.duration,
  }
}

/**
 * ลิงก์เปิดนำทางใน Google Maps — ทางหนีทีไล่ตอน OSRM ล้ม และเป็นทางที่ช่างจะใช้
 * นำทางจริงบนมือถืออยู่ดี (เปิดจาก WebView จะเด้งไปแอป Google Maps)
 * Google รับ waypoints คั่นด้วย | ได้สูงสุด 9 จุด เราใช้ไม่เกิน 3
 */
export function googleMapsUrl(from: LatLng, stops: LatLng[]): string {
  if (stops.length === 0) return ''
  const fmt = ([lat, lng]: LatLng) => `${lat.toFixed(6)},${lng.toFixed(6)}`
  const dest = stops[stops.length - 1]!
  const via = stops.slice(0, -1)
  const p = new URLSearchParams({
    api: '1',
    origin: fmt(from),
    destination: fmt(dest),
    travelmode: 'driving',
  })
  if (via.length) p.set('waypoints', via.map(fmt).join('|'))
  return `https://www.google.com/maps/dir/?${p.toString()}`
}

/** "1 ชม. 20 นาที" / "12 นาที" */
export function formatDuration(sec: number): string {
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} นาที`
  const h = Math.floor(min / 60)
  const r = min % 60
  return r ? `${h} ชม. ${r} นาที` : `${h} ชม.`
}

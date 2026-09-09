import L from 'leaflet'

/**
 * ไม้บรรทัดวัดระยะบนแผนที่ — วัดเป็นเส้นหลายท่อน หรือปิดรูปเพื่อวัดพื้นที่
 *
 * แยกออกมาจาก component เพราะเป็นเรื่องเรขาคณิตล้วน ๆ ไม่เกี่ยวกับ Vue
 * ตัวมันเองถือ layer ของ Leaflet เอง แล้วรายงานผลกลับผ่าน onChange
 * — component มีหน้าที่แค่เอาตัวเลขไปแสดงกับส่งคลิกเข้ามา
 *
 * ระยะคิดแบบ haversine (ระยะบนผิวโลกจริง) ส่วนพื้นที่ใช้สูตร spherical excess
 * ซึ่งแม่นพอสำหรับรูปขนาดไม่กี่กิโลเมตร ไม่ใช่การประมาณแบบระนาบแบน
 */

const R = 6371008.8

export type RulerState = {
  points: [number, number][]
  /** ระยะของแต่ละท่อนเป็นเมตร */
  segments: number[]
  totalM: number
  /** ตารางเมตร — null เมื่อไม่ได้อยู่โหมดพื้นที่ หรือจุดยังไม่ครบสามจุด */
  areaM2: number | null
  active: boolean
  done: boolean
}

export function metresBetween(a: [number, number], b: [number, number]): number {
  const dy = ((b[0] - a[0]) * Math.PI) / 180
  const dx = ((b[1] - a[1]) * Math.PI) / 180
  const s = Math.sin(dy / 2) ** 2
    + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dx / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** พื้นที่ของรูปปิดบนทรงกลม (ตารางเมตร) */
function sphericalArea(pts: [number, number][]): number {
  if (pts.length < 3) return 0
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    sum += ((b[1] - a[1]) * Math.PI) / 180
      * (2 + Math.sin((a[0] * Math.PI) / 180) + Math.sin((b[0] * Math.PI) / 180))
  }
  return Math.abs((sum * R * R) / 2)
}

export function formatM(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} กม.` : `${Math.round(m)} ม.`
}

export function formatArea(m2: number): string {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(3)} ตร.กม.`
  // ไร่เป็นหน่วยที่ใช้จริงหน้างานมากกว่าตารางเมตรเมื่อพื้นที่ใหญ่ขึ้น
  const rai = m2 / 1600
  return rai >= 1 ? `${Math.round(m2).toLocaleString()} ตร.ม. (${rai.toFixed(2)} ไร่)`
    : `${Math.round(m2).toLocaleString()} ตร.ม.`
}

export type RulerOptions = {
  onChange: (s: RulerState) => void
  /** ดึงจุดเข้าหาโหนดที่ใกล้ที่สุด — คืน null ถ้าไม่มีอะไรใกล้พอ */
  snap?: (ll: L.LatLng) => [number, number] | null
  color?: string
}

export function createRuler(map: L.Map, opts: RulerOptions) {
  const gLine = L.layerGroup().addTo(map)
  const gLabel = L.layerGroup().addTo(map)

  let points: [number, number][] = []
  let active = false
  let done = false
  let area = false

  const color = opts.color ?? '#facc15'

  function state(): RulerState {
    const segments: number[] = []
    for (let i = 1; i < points.length; i++) segments.push(metresBetween(points[i - 1]!, points[i]!))
    let totalM = segments.reduce((a, b) => a + b, 0)
    if (area && points.length > 2) totalM += metresBetween(points[points.length - 1]!, points[0]!)
    return {
      points: [...points],
      segments,
      totalM,
      areaM2: area && points.length > 2 ? sphericalArea(points) : null,
      active,
      done,
    }
  }

  function label(at: [number, number], text: string, strong = false) {
    L.marker(at, {
      interactive: false,
      icon: L.divIcon({
        className: '',
        html: `<span class="ruler-label${strong ? ' ruler-total' : ''}">${text}</span>`,
        iconSize: [0, 0],
      }),
    }).addTo(gLabel)
  }

  function render() {
    gLine.clearLayers()
    gLabel.clearLayers()
    if (!points.length) return

    const line: [number, number][] = area && points.length > 2 ? [...points, points[0]!] : points
    if (line.length > 1) {
      L.polyline(line, { color, weight: 3, opacity: 0.95, interactive: false }).addTo(gLine)
    }

    for (const p of points) {
      L.circleMarker(p, {
        radius: 4, color: '#111827', weight: 2, fillColor: color, fillOpacity: 1, interactive: false,
      }).addTo(gLine)
    }

    // ป้ายระยะสะสมที่ปลายแต่ละท่อน — อ่านง่ายกว่าระยะรายท่อนตอนวัดหลายจุด
    let run = 0
    for (let i = 1; i < points.length; i++) {
      run += metresBetween(points[i - 1]!, points[i]!)
      label(points[i]!, formatM(run), i === points.length - 1 && !area)
    }

    const s = state()
    if (s.areaM2 !== null) label(points[0]!, formatArea(s.areaM2), true)
  }

  function emit() {
    render()
    opts.onChange(state())
  }

  return {
    isActive: () => active,
    isDone: () => done,

    start(withArea = false) {
      active = true
      done = false
      area = withArea
      points = []
      emit()
    },

    setArea(v: boolean) {
      area = v
      emit()
    },

    addPoint(ll: L.LatLng) {
      if (!active || done) return
      const snapped = opts.snap?.(ll)
      points.push(snapped ?? [ll.lat, ll.lng])
      emit()
    },

    undo() {
      if (!active) return
      points.pop()
      done = false
      emit()
    },

    finish() {
      if (!active || points.length < 2) return
      done = true
      emit()
    },

    stop() {
      active = false
      done = false
      points = []
      emit()
    },

    destroy() {
      gLine.remove()
      gLabel.remove()
    },
  }
}

export type Ruler = ReturnType<typeof createRuler>

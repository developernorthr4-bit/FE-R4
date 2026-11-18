import type L from 'leaflet'
import { ref, shallowRef, watch, type Ref } from 'vue'
import type { Ruler, RulerState } from '@/lib/ruler'
import type { MapKind, MapView } from '@/services/online.api'

/**
 * ไม้บรรทัดของ OnlineNetworkMap — state + ดูดเข้าหาหมุด + เปิด/ปิด + คีย์ลัด
 * ตัว ruler (createRuler) หน้าแม่สร้างใน onMounted พร้อมผูก click/dblclick/contextmenu/keydown
 */
export function useMapRuler(ctx: {
  map: Ref<L.Map | null>
  view: Ref<MapView | null>
  KINDS: MapKind[]
}) {
  const { map, view, KINDS } = ctx

  const ruler = shallowRef<Ruler | null>(null)
  const rulerOn = ref(false)
  const rulerArea = ref(false)
  const rulerSnap = ref(true)
  const rul = ref<RulerState | null>(null)

  /** ดึงจุดเข้าหาโหนดที่ใกล้ที่สุดในระยะ ~14 พิกเซล จากข้อมูลที่โหลดมาแล้ว */
  function snapTo(ll: L.LatLng): [number, number] | null {
    const m = map.value
    const v = view.value
    if (!m || !v || !rulerSnap.value) return null

    const target = m.latLngToContainerPoint(ll)
    let best: [number, number] | null = null
    let bestPx = 14

    for (const k of KINDS) {
      const lay = v[k]
      for (let i = 0; i < lay.code.length; i++) {
        const y = lay.y[i]
        const x = lay.x[i]
        if (y === undefined || x === undefined) continue
        const p = m.latLngToContainerPoint([y, x])
        const d = Math.hypot(p.x - target.x, p.y - target.y)
        if (d < bestPx) { bestPx = d; best = [y, x] }
      }
    }
    return best
  }

  function startRuler() {
    rulerOn.value = true
    ruler.value?.start(rulerArea.value)
    const m = map.value
    if (!m) return
    m.getContainer().classList.add('cursor-crosshair')
    // ดับเบิลคลิก = จบการวัด ถ้าไม่ปิดตัวซูมไว้ มันจะซูมเข้าไปด้วยทุกครั้งที่จบ
    m.doubleClickZoom.disable()
  }

  function stopRuler() {
    rulerOn.value = false
    ruler.value?.stop()
    const m = map.value
    if (!m) return
    m.getContainer().classList.remove('cursor-crosshair')
    m.doubleClickZoom.enable()
  }

  function onKey(e: KeyboardEvent) {
    if (!rulerOn.value) {
      // M เปิดไม้บรรทัด เหมือนไฟล์ต้นแบบ — แต่ต้องไม่ชนกับการพิมพ์ในช่องค้นหา
      if (e.key.toLowerCase() === 'm' && !(e.target instanceof HTMLInputElement)) startRuler()
      return
    }
    if (e.key === 'Escape') stopRuler()
    else if (e.key === 'Enter') ruler.value?.finish()
    else if (e.key === 'Backspace') { e.preventDefault(); ruler.value?.undo() }
  }

  watch(rulerArea, (v) => ruler.value?.setArea(v))

  return {
    ruler,
    rulerOn,
    rulerArea,
    rulerSnap,
    rul,
    snapTo,
    startRuler,
    stopRuler,
    onKey,
  }
}

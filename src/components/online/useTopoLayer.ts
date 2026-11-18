import L from 'leaflet'
import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import { errorMessage } from '@/lib/api'
import { NODE_LEVEL, RING_TOPOS, TOPO_COLOR, TOPO_COLOR_FALLBACK } from '@/lib/rings'
import { shapeMarker } from '@/lib/shape-marker'
import { getRingMap, type RingMapData } from '@/services/rings.api'

/** ชั้น "เส้นเชื่อม Site–Site" (Topology) ของ OnlineNetworkMap — gTopo หน้าแม่สร้างใน onMounted ใต้ gLine */
export function useTopoLayer(ctx: {
  renderer: Ref<L.Canvas | null>
  province: Ref<number | ''>
}) {
  const { renderer, province } = ctx

  /**
   * ชั้นเสริมแบบเดียวกับ /rings/map ปิดเป็นค่าเริ่มต้นทั้งเส้นสถานีและเส้นขึ้นโหนด
   *
   * ใช้ /rings/map ทั้งภาค (~518 KB) โหลดครั้งแรกที่เปิดชั้นแล้วเก็บไว้ใช้ต่อ
   * ไม่ขอตามกรอบจอเหมือนชั้นอื่น เพราะ endpoint นี้ไม่มี bbox และข้อมูลเปลี่ยนแค่ตอนนำเข้า Topology
   * กดเส้นไม่ได้ (interactive: false) — คลิกบนแผนที่นี้ใช้กับหมุดและเคเบิลแล้ว ดูรายวงที่ /rings/map
   * ล้มก็ไม่กระทบแผนที่หลัก แค่บอกในแผง
   */
  const gTopo = shallowRef<L.LayerGroup | null>(null)
  const topoOn = ref(false)
  const topoNodesOn = ref(false)
  const topoData = shallowRef<RingMapData | null>(null)
  const topoLoading = ref(false)
  const topoError = ref<string | null>(null)
  const topoShown = ref(0)

  const topoColor = (value: string | null | undefined) => (value && TOPO_COLOR[value]) || TOPO_COLOR_FALLBACK

  /** ชนิดวงที่มีในจังหวัดที่เลือก — คำอธิบายสีโชว์เฉพาะที่มีจริง */
  const topoLegend = computed(() => {
    const d = topoData.value
    if (!d) return []
    const present = new Set(d.rings.filter((_, i) => topoRingPasses(i)).map((r) => r[2]))
    return RING_TOPOS.filter((t) => present.has(t))
  })

  function topoRingPasses(index: number): boolean {
    const ring = topoData.value?.rings[index]
    if (!ring) return false
    return !province.value || ring[3] === province.value
  }

  async function loadTopo() {
    if (!topoOn.value) { gTopo.value?.clearLayers(); topoShown.value = 0; return }
    if (!topoData.value && !topoLoading.value) {
      topoLoading.value = true
      topoError.value = null
      try {
        topoData.value = await getRingMap()
      } catch (err) {
        topoError.value = errorMessage(err, 'โหลดเส้นเชื่อมไม่สำเร็จ')
      } finally {
        topoLoading.value = false
      }
    }
    drawTopo()
  }

  function drawTopo() {
    const g = gTopo.value
    const d = topoData.value
    if (!g) return
    g.clearLayers()
    topoShown.value = 0
    if (!topoOn.value || !d) return
    const rend = renderer.value ?? undefined

    const byTopo = new Map<string, [number, number][][]>()
    for (const [a, b, ring] of d.links) {
      if (!topoRingPasses(ring)) continue
      const sa = d.stations[a]
      const sb = d.stations[b]
      if (!sa || !sb) continue
      const key = d.rings[ring]?.[2] ?? ''
      if (!byTopo.has(key)) byTopo.set(key, [])
      byTopo.get(key)!.push([[sa[2], sa[3]], [sb[2], sb[3]]])
      topoShown.value += 1
    }
    for (const [key, lines] of byTopo) {
      L.polyline(lines, {
        color: topoColor(key), weight: 1.5, opacity: 0.6, interactive: false, renderer: rend,
      }).addTo(g)
    }

    if (!topoNodesOn.value) return
    const nodes = new Set<number>()
    const byLevel = new Map<string, [number, number][][]>()
    for (const [node, station, ring] of d.uplinks) {
      if (!topoRingPasses(ring)) continue
      const n = d.nodes[node]
      const s = d.stations[station]
      if (!n || !s) continue
      nodes.add(node)
      if (!byLevel.has(n[1])) byLevel.set(n[1], [])
      byLevel.get(n[1])!.push([[n[2], n[3]], [s[2], s[3]]])
    }
    for (const [level, lines] of byLevel) {
      L.polyline(lines, {
        color: NODE_LEVEL[level as keyof typeof NODE_LEVEL].color,
        weight: 1.5, opacity: 0.7, dashArray: '2 5', interactive: false, renderer: rend,
      }).addTo(g)
    }
    for (const index of nodes) {
      const n = d.nodes[index]!
      const level = NODE_LEVEL[n[1]]
      const tip = document.createElement('span')
      tip.style.whiteSpace = 'pre-line'
      tip.textContent = `${level.label} · ${n[0]}\n${n[4].join('\n')}`
      shapeMarker([n[2], n[3]], {
        shape: level.shape,
        radius: Math.max(level.radius - 4, 5),
        color: '#ffffff', weight: 1.5, fillColor: level.color, fillOpacity: 0.95,
        bubblingMouseEvents: false, renderer: rend,
      })
        .bindTooltip(tip, { direction: 'top' })
        .addTo(g)
    }
  }

  watch(topoOn, () => void loadTopo())
  watch(topoNodesOn, drawTopo)
  watch(province, drawTopo)

  return {
    gTopo,
    topoOn,
    topoNodesOn,
    topoData,
    topoLoading,
    topoError,
    topoShown,
    topoColor,
    topoLegend,
    topoRingPasses,
    loadTopo,
    drawTopo,
  }
}

<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import { errorMessage } from '../lib/api'
import {
  NODE_LEVEL, NODE_LEVELS, RING_TOPOS, TOPO_BADGE, TOPO_COLOR, TOPO_COLOR_FALLBACK, TOPO_LABEL,
} from '../lib/rings'
import { glyphPoints, shapeMarker } from '../lib/shape-marker'
import { loadProvinces, type Province } from '../services/provinces.api'
import { getRingMap, type RingMapData } from '../services/rings.api'

/**
 * แผนที่รวมโครงข่าย CPE ทั้งภาค
 *
 * เส้นบอกว่าสถานีไหนเชื่อมกับสถานีไหนจาก Topology แต่ลากตรงระหว่างสถานี จึงไม่ใช่แนวสายจริง
 * และบอกไม่ได้ว่าขณะนี้สัญญาณวิ่งเส้นไหน
 *
 * ทุกอย่างวาดบน canvas ตัวเดียว · เส้นรวมเป็น polyline ตามชนิดวงเพื่อให้ลื่นในระดับภาค
 * ป้ายชื่อเป็น DOM จึงแสดงเฉพาะตอนซูมเข้าและจำกัดจำนวน
 */
const LABEL_MIN_ZOOM = 13
const LABEL_LIMIT = 200
const SELECTED_LABEL_LIMIT = 60
const RESULT_LIMIT = 6

const data = shallowRef<RingMapData | null>(null)
const provinces = ref<Province[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const province = ref('')
const topo = ref('')
const showLinks = ref(true)
const showNodes = ref(true)
const panelOpen = ref(true)
const search = ref('')

const selectedRing = ref<number | null>(null)
const selectedStation = ref<number | null>(null)

/* ---------- ข้อมูลที่ผ่านตัวกรอง ---------- */
function ringPasses(index: number): boolean {
  const ring = data.value?.rings[index]
  if (!ring) return false
  if (province.value && String(ring[3]) !== province.value) return false
  return !topo.value || ring[2] === topo.value
}

const visibleStations = computed(() => {
  const d = data.value
  if (!d) return []
  return d.stations.flatMap((s, index) => (s[4].some(ringPasses) ? [index] : []))
})

const topoCounts = computed(() => {
  const count = new Map<string, number>()
  for (const r of data.value?.rings ?? []) {
    if (r[2] && (!province.value || String(r[3]) === province.value)) {
      count.set(r[2], (count.get(r[2]) ?? 0) + 1)
    }
  }
  return count
})

const legendTopos = computed(() => RING_TOPOS.filter((t) => topoCounts.value.has(t)))

const provinceOptions = computed(() => {
  const present = new Set((data.value?.rings ?? []).map((r) => r[3]))
  return provinces.value.filter((p) => present.has(p.id))
})

const ringStations = computed(() => {
  const d = data.value
  const ring = selectedRing.value
  if (!d || ring === null) return []
  return d.stations.flatMap((s, index) => (s[4].includes(ring) ? [{ index, code: s[1], siteId: s[0] }] : []))
})

const selectedRingRow = computed(() => (
  selectedRing.value === null ? null : data.value?.rings[selectedRing.value] ?? null
))

/** สถานีที่เลือกอยู่หลายวงได้ จึงให้สลับวงจากแผงรายละเอียด */
const stationRings = computed(() => {
  const d = data.value
  const station = selectedStation.value === null ? null : d?.stations[selectedStation.value]
  if (!d || !station) return []
  return station[4].map((index) => ({ index, code: d.rings[index]![1] }))
})

const searchResults = computed(() => {
  const d = data.value
  const q = search.value.trim().toUpperCase()
  if (!d || q.length < 2) return []
  const stations = d.stations.flatMap((s, index) => (
    s[1].toUpperCase().includes(q) ? [{ kind: 'station' as const, index, code: s[1] }] : []
  )).slice(0, RESULT_LIMIT)
  const rings = d.rings.flatMap((r, index) => (
    r[1].toUpperCase().includes(q) ? [{ kind: 'ring' as const, index, code: r[1] }] : []
  )).slice(0, RESULT_LIMIT)
  return [...stations, ...rings]
})

const topoColor = (value: string | null | undefined) => (value && TOPO_COLOR[value]) || TOPO_COLOR_FALLBACK
const nodeGlyph = (level: keyof typeof NODE_LEVEL) => glyphPoints(NODE_LEVEL[level].shape)

/* ---------- แผนที่ ---------- */
const wrap = ref<HTMLDivElement | null>(null)
const el = ref<HTMLDivElement | null>(null)
const isFullscreen = ref(false)
const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true

const map = shallowRef<L.Map | null>(null)
const renderer = shallowRef<L.Canvas | null>(null)
let baseLayer: L.LayerGroup | null = null
let highlightLayer: L.LayerGroup | null = null
let labelLayer: L.LayerGroup | null = null
let stationMarkers: L.CircleMarker[] = []
let currentRadius = 0

function tooltipText(text: string): HTMLElement {
  const span = document.createElement('span')
  span.style.whiteSpace = 'pre-line'
  span.textContent = text
  return span
}

function radiusForZoom(zoom: number): number {
  if (zoom < 9) return 2.5
  if (zoom < 12) return 4
  return 6
}

function initMap() {
  if (!el.value || map.value) return
  const m = L.map(el.value, {
    preferCanvas: true, minZoom: 5, maxZoom: 19, zoomAnimationThreshold: 2,
  }).setView([18.2, 99.8], 7)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap',
  }).addTo(m)
  renderer.value = L.canvas({ padding: 0.3 })
  baseLayer = L.layerGroup().addTo(m)
  highlightLayer = L.layerGroup().addTo(m)
  labelLayer = L.layerGroup().addTo(m)
  m.on('click', clearSelection)
  m.on('zoomend', applyZoomRadius)
  m.on('moveend', drawLabels)
  map.value = m
}

function drawBase() {
  const d = data.value
  const g = baseLayer
  if (!d || !g) return
  g.clearLayers()
  stationMarkers = []
  const rend = renderer.value ?? undefined
  const zoom = map.value?.getZoom() ?? 7
  currentRadius = radiusForZoom(zoom)
  const visible = new Set(visibleStations.value)

  if (showLinks.value) {
    const byTopo = new Map<string, [number, number][][]>()
    for (const [a, b, ring] of d.links) {
      if (!ringPasses(ring) || !visible.has(a) || !visible.has(b)) continue
      const key = d.rings[ring]?.[2] ?? ''
      const sa = d.stations[a]!
      const sb = d.stations[b]!
      if (!byTopo.has(key)) byTopo.set(key, [])
      byTopo.get(key)!.push([[sa[2], sa[3]], [sb[2], sb[3]]])
    }
    for (const [key, lines] of byTopo) {
      L.polyline(lines, {
        color: topoColor(key), weight: 1.5, opacity: 0.6, interactive: false, renderer: rend,
      }).addTo(g)
    }
  }

  const visibleNodes = new Set<number>()
  if (showNodes.value) {
    const byLevel = new Map<string, [number, number][][]>()
    for (const [node, station, ring] of d.uplinks) {
      if (!ringPasses(ring) || !visible.has(station)) continue
      visibleNodes.add(node)
      if (!showLinks.value) continue
      const n = d.nodes[node]!
      const s = d.stations[station]!
      if (!byLevel.has(n[1])) byLevel.set(n[1], [])
      byLevel.get(n[1])!.push([[n[2], n[3]], [s[2], s[3]]])
    }
    for (const [level, lines] of byLevel) {
      L.polyline(lines, {
        color: NODE_LEVEL[level as keyof typeof NODE_LEVEL].color,
        weight: 1.5,
        opacity: 0.7,
        dashArray: '2 5',
        interactive: false,
        renderer: rend,
      }).addTo(g)
    }
  }

  for (const index of visible) {
    const s = d.stations[index]!
    const marker = L.circleMarker([s[2], s[3]], {
      radius: currentRadius,
      color: '#ffffff',
      weight: 1,
      fillColor: topoColor(d.rings[s[4].find(ringPasses) ?? -1]?.[2]),
      fillOpacity: 0.95,
      bubblingMouseEvents: false,
      renderer: rend,
    })
      .bindTooltip(() => tooltipText(
        `${s[1]}\n${s[4].map((r) => d.rings[r]?.[1]).join(', ')}`,
      ), { direction: 'top', offset: [0, -4] })
      .on('click', () => selectStation(index, false))
      .addTo(g)
    stationMarkers.push(marker)
  }

  for (const index of visibleNodes) {
    const n = d.nodes[index]!
    const level = NODE_LEVEL[n[1]]
    shapeMarker([n[2], n[3]], {
      shape: level.shape,
      radius: Math.max(level.radius - 4, 5),
      color: '#ffffff',
      weight: 1.5,
      fillColor: level.color,
      fillOpacity: 0.95,
      bubblingMouseEvents: false,
      renderer: rend,
    })
      .bindTooltip(() => tooltipText(`${level.label} · ${n[0]}\n${n[4].join('\n')}`), { direction: 'top' })
      .addTo(g)
  }
}

function applyZoomRadius() {
  const zoom = map.value?.getZoom()
  if (zoom === undefined) return
  const radius = radiusForZoom(zoom)
  if (radius === currentRadius) return
  currentRadius = radius
  stationMarkers.forEach((marker) => marker.setRadius(radius))
}

function drawLabels() {
  const m = map.value
  const d = data.value
  const g = labelLayer
  if (!m || !d || !g) return
  g.clearLayers()
  if (m.getZoom() < LABEL_MIN_ZOOM) return
  const bounds = m.getBounds()
  const inView = visibleStations.value.filter((index) => {
    const s = d.stations[index]!
    return bounds.contains([s[2], s[3]])
  })
  if (inView.length > LABEL_LIMIT) return
  for (const index of inView) {
    const s = d.stations[index]!
    L.tooltip({ permanent: true, direction: 'right', offset: [8, 0], className: 'ring-map-label' })
      .setLatLng([s[2], s[3]])
      .setContent(tooltipText(s[1]))
      .addTo(g)
  }
}

function drawHighlight() {
  const d = data.value
  const g = highlightLayer
  if (!g) return
  g.clearLayers()
  const ring = selectedRing.value
  if (!d || ring === null) return
  const rend = renderer.value ?? undefined
  const color = topoColor(d.rings[ring]?.[2])

  const lines = d.links.flatMap(([a, b, linkRing]) => {
    if (linkRing !== ring) return []
    const sa = d.stations[a]!
    const sb = d.stations[b]!
    return [[[sa[2], sa[3]], [sb[2], sb[3]]] as [number, number][]]
  })
  if (lines.length) {
    L.polyline(lines, { color, weight: 4, opacity: 0.95, interactive: false, renderer: rend }).addTo(g)
  }

  const showLabel = ringStations.value.length <= SELECTED_LABEL_LIMIT
  for (const station of ringStations.value) {
    const s = d.stations[station.index]!
    const marker = L.circleMarker([s[2], s[3]], {
      radius: 7,
      color: '#111827',
      weight: 2,
      fillColor: color,
      fillOpacity: 1,
      bubblingMouseEvents: false,
      renderer: rend,
    })
      .on('click', () => selectStation(station.index, false))
      .addTo(g)
    if (showLabel) {
      marker.bindTooltip(tooltipText(s[1]), { permanent: true, direction: 'right', offset: [9, 0] })
    }
  }
}

function fitStations(indexes: number[]) {
  const m = map.value
  const d = data.value
  if (!m || !d || indexes.length === 0) return
  const points = indexes.map((index): [number, number] => {
    const s = d.stations[index]!
    return [s[2], s[3]]
  })
  // เปลี่ยนซูมหลายระดับแบบมีแอนิเมชันเคยค้าง จึงปิดแอนิเมชันทุกจุดที่จัดกรอบ
  if (points.length === 1) m.setView(points[0]!, 14, { animate: false })
  else m.fitBounds(L.latLngBounds(points).pad(0.2), { animate: false })
}

function selectRing(index: number, fit = true) {
  selectedRing.value = index
  drawHighlight()
  if (fit) fitStations(ringStations.value.map((s) => s.index))
}

function selectStation(index: number, fit = true) {
  const station = data.value?.stations[index]
  if (!station) return
  selectedStation.value = index
  const ring = station[4].find(ringPasses) ?? station[4][0]
  if (ring !== undefined) selectRing(ring, false)
  if (fit) fitStations([index])
}

function clearSelection() {
  selectedRing.value = null
  selectedStation.value = null
  drawHighlight()
}

function pickResult(result: { kind: 'station' | 'ring'; index: number }) {
  search.value = ''
  if (result.kind === 'station') {
    selectStation(result.index)
  } else {
    selectedStation.value = null
    selectRing(result.index)
  }
}

function clearFilters() {
  province.value = ''
  topo.value = ''
}

watch([province, topo], () => {
  if (selectedRing.value !== null && !ringPasses(selectedRing.value)) clearSelection()
  drawBase()
  drawLabels()
  fitStations(visibleStations.value)
})
watch([showLinks, showNodes], drawBase)

/* ---------- เต็มจอ ---------- */
async function toggleFullscreen() {
  const box = wrap.value
  if (!box) return
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await box.requestFullscreen()
  } catch {
    // บางบริบทไม่ยอมให้เข้าเต็มจอ — ยังใช้แผนที่ขนาดปกติได้
  }
}

function onFullscreenChange() {
  isFullscreen.value = document.fullscreenElement !== null
  setTimeout(() => { map.value?.invalidateSize() }, 60)
}

onMounted(async () => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  initMap()
  try {
    const [mapData, provinceRows] = await Promise.all([getRingMap(), loadProvinces().catch(() => [])])
    data.value = mapData
    provinces.value = provinceRows
    drawBase()
    fitStations(visibleStations.value)
  } catch (err) {
    error.value = errorMessage(err, 'โหลดแผนที่รวมไม่สำเร็จ')
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  map.value?.remove()
  map.value = null
})
</script>

<template>
  <AppLayout wide>
    <div ref="wrap" class="relative h-full w-full overflow-hidden bg-base-100">
      <!-- ห้ามผูก :class กับ div นี้ เพราะ Vue จะเขียนทับ class ของ Leaflet -->
      <div ref="el" class="h-full w-full" />

      <button
        type="button"
        class="btn btn-sm absolute left-3 top-3 z-[810] shadow-lg"
        :aria-expanded="panelOpen"
        @click="panelOpen = !panelOpen"
      >
        {{ panelOpen ? 'ซ่อนแผง' : 'แสดงแผง' }}
      </button>

      <div class="absolute right-3 top-3 z-[800] flex gap-2">
        <button type="button" class="btn btn-sm shadow-lg" @click="fitStations(visibleStations)">ดูทั้งหมด</button>
        <button v-if="canFullscreen" type="button" class="btn btn-sm shadow-lg" @click="toggleFullscreen">
          {{ isFullscreen ? '⤡ ย่อ' : '⤢ เต็มจอ' }}
        </button>
      </div>

      <!-- แผงควบคุม -->
      <aside
        v-if="panelOpen"
        class="absolute left-3 top-14 z-[800] flex max-h-[calc(100%-5rem)] w-72 max-w-[calc(100%-1.5rem)] flex-col gap-3 overflow-y-auto rounded-box border border-base-300 bg-base-100/95 p-3 text-sm shadow-lg"
      >
        <div>
          <h1 class="font-semibold">แผนที่รวมโครงข่าย</h1>
          <RouterLink to="/rings" class="link link-hover text-xs opacity-70">← รายการวง</RouterLink>
        </div>

        <label class="form-control">
          <span class="mb-1 block text-xs opacity-70">ค้นหารหัสสถานีหรือรหัสวง</span>
          <input v-model="search" type="search" class="input input-bordered input-sm w-full" placeholder="เช่น CMI0072">
        </label>
        <ul v-if="searchResults.length" class="-mt-2 flex flex-col rounded-field border border-base-300">
          <li v-for="r in searchResults" :key="`${r.kind}-${r.index}`">
            <button type="button" class="flex w-full justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-base-200" @click="pickResult(r)">
              <span class="font-mono">{{ r.code }}</span>
              <span class="opacity-60">{{ r.kind === 'station' ? 'สถานี' : 'วง' }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="search.trim().length >= 2" class="-mt-2 text-xs opacity-60">ไม่พบบนแผนที่ อาจเป็นสถานีที่ยังไม่มีพิกัด</p>

        <div class="grid grid-cols-2 gap-2">
          <label class="form-control">
            <span class="mb-1 block text-xs opacity-70">จังหวัด</span>
            <select v-model="province" class="select select-bordered select-sm w-full">
              <option value="">ทุกจังหวัด</option>
              <option v-for="p in provinceOptions" :key="p.id" :value="String(p.id)">{{ p.nameTh }}</option>
            </select>
          </label>
          <label class="form-control">
            <span class="mb-1 block text-xs opacity-70">ชนิด</span>
            <select v-model="topo" class="select select-bordered select-sm w-full">
              <option value="">ทุกชนิด</option>
              <option v-for="t in legendTopos" :key="t" :value="t">{{ TOPO_LABEL[t] }}</option>
            </select>
          </label>
        </div>
        <button v-if="province || topo" type="button" class="btn btn-ghost btn-xs -mt-1 self-start" @click="clearFilters">
          ล้างตัวกรอง
        </button>

        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <label class="label cursor-pointer gap-2 p-0 text-xs">
            <input v-model="showLinks" type="checkbox" class="checkbox checkbox-xs">
            เส้นเชื่อมต่อ
          </label>
          <label class="label cursor-pointer gap-2 p-0 text-xs">
            <input v-model="showNodes" type="checkbox" class="checkbox checkbox-xs">
            โหนดชั้นบน
          </label>
        </div>

        <div class="flex flex-col gap-1 border-t border-base-300 pt-2 text-xs">
          <span v-for="t in legendTopos" :key="t" class="flex items-center justify-between gap-2">
            <span class="flex items-center gap-1.5">
              <span class="inline-block size-3 rounded-full" :style="{ background: TOPO_COLOR[t] }" />
              {{ TOPO_LABEL[t] }}
            </span>
            <span class="opacity-60">{{ topoCounts.get(t)?.toLocaleString() }}</span>
          </span>
          <template v-if="showNodes">
            <span v-for="level in NODE_LEVELS" :key="level" class="flex items-center gap-1.5">
              <svg viewBox="-10 -10 20 20" class="size-3.5" aria-hidden="true">
                <polygon :points="nodeGlyph(level)" :fill="NODE_LEVEL[level].color" />
              </svg>
              {{ NODE_LEVEL[level].label }}
            </span>
          </template>
        </div>

        <p class="border-t border-base-300 pt-2 text-xs opacity-70">
          เส้นลากตรงระหว่างสถานี ไม่ใช่แนวสายจริง และไม่ได้บอกว่าขณะนี้สัญญาณวิ่งเส้นไหน
          <template v-if="data"> · แสดง {{ visibleStations.length.toLocaleString() }} สถานี</template>
          <template v-if="data?.hidden.stations"> · ไม่มีพิกัด {{ data.hidden.stations.toLocaleString() }} สถานี</template>
          <template v-if="data?.hidden.links"> · ซ่อน {{ data.hidden.links.toLocaleString() }} เส้น</template>
          <template v-if="data?.hidden.uplinks"> · ซ่อนเส้นขึ้นโหนด {{ data.hidden.uplinks.toLocaleString() }} เส้น</template>
        </p>
      </aside>

      <!-- รายละเอียดวงที่เลือก -->
      <aside
        v-if="selectedRingRow"
        class="absolute bottom-6 right-3 z-[800] flex max-h-[60%] w-72 max-w-[calc(100%-1.5rem)] flex-col gap-2 overflow-y-auto rounded-box border border-base-300 bg-base-100/95 p-3 text-sm shadow-lg"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="break-all font-mono font-medium">{{ selectedRingRow[1] }}</p>
            <span v-if="selectedRingRow[2]" class="badge badge-sm" :class="TOPO_BADGE[selectedRingRow[2]]">
              {{ TOPO_LABEL[selectedRingRow[2]] ?? selectedRingRow[2] }}
            </span>
          </div>
          <button type="button" class="btn btn-ghost btn-xs" aria-label="ปิดรายละเอียด" @click="clearSelection">✕</button>
        </div>

        <div v-if="stationRings.length > 1" class="flex flex-wrap items-center gap-1 text-xs">
          <span class="opacity-60">สถานีนี้อยู่ {{ stationRings.length }} วง:</span>
          <button
            v-for="r in stationRings"
            :key="r.index"
            type="button"
            class="btn btn-xs font-mono"
            :class="{ 'btn-primary': r.index === selectedRing }"
            @click="selectRing(r.index, false)"
          >{{ r.code }}</button>
        </div>

        <RouterLink :to="`/rings/${selectedRingRow[0]}`" class="btn btn-primary btn-sm">ดูรายละเอียดวง</RouterLink>

        <p class="text-xs opacity-60">บนแผนที่ {{ ringStations.length }} สถานี · สถานีที่ไม่มีพิกัดดูได้ในหน้ารายละเอียด</p>
        <ul class="flex flex-wrap gap-1">
          <li v-for="s in ringStations" :key="s.index">
            <RouterLink :to="`/sites/${s.siteId}/edit`" class="badge badge-ghost badge-sm font-mono">{{ s.code }}</RouterLink>
          </li>
        </ul>
      </aside>

      <div v-if="loading" class="absolute inset-0 z-[790] flex items-center justify-center bg-base-100/50">
        <span class="loading loading-spinner loading-lg opacity-70" />
      </div>
      <div v-if="error" class="alert alert-error absolute left-1/2 top-16 z-[820] w-auto max-w-[90%] -translate-x-1/2 text-sm">
        {{ error }}
      </div>
    </div>
  </AppLayout>
</template>

<style>
.ring-map-label {
  border: 0;
  background: rgb(255 255 255 / 0.85);
  box-shadow: none;
  color: #111827;
  font-size: 11px;
  padding: 0 4px;
}
.ring-map-label::before {
  display: none;
}
</style>

<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { errorMessage } from '../lib/api'
import { cableColor, coreOrder, drawCables as paintCables } from '../lib/cable-layer'
import { categorical } from '../lib/palette'
import { formatDuration, googleMapsUrl, routeVia, type LatLng, type RouteResult } from '../lib/routing'
import { formatM, metresBetween } from '../lib/ruler'
import { glyphPoints, shapeMarker, type MarkerShape } from '../lib/shape-marker'
import { getCables, type CableView } from '../services/cables.api'
import { getChain, searchOnline, type ChainStep, type MapHit, type MapKind } from '../services/online.api'
import { useThemeStore } from '../stores/theme'

/**
 * แผนที่สำรวจ — "จะไปตัวนี้ ต้องไปทางไหน แถวนั้นมีสายอะไรบ้าง"
 *
 * ต่างจากแผนที่โครงข่าย online ตรงที่หน้านี้ไม่กางทั้งภาค: ผู้ใช้กรอกปลายทางมาหนึ่งตัว
 * (สถานี/OLT/L1/L2) เราไล่สายโซ่ขึ้นไปถึงสถานี uplink วาดแค่ 4 จุดนั้น กางเคเบิล
 * ทุกเส้นในกรอบรอบสายโซ่โดยไม่รอซูม แล้วถาม OSRM ว่าจากจุดเริ่ม (GPS หรือกดเลือก)
 * ขับรถไปอย่างไร — เส้นทางเป็นถนนจริง ไม่ได้อิงแนวเคเบิล (ตกลงกันไว้แบบนั้น)
 *
 * OSRM เป็นเซิร์ฟเวอร์สาธารณะ ล้มได้ — ล้มแล้ววาดเส้นตรงบอกระยะทางอากาศแทน
 * และมีปุ่มเปิด Google Maps ไว้เสมอ เพราะสุดท้ายช่างก็นำทางด้วยมันอยู่ดี
 */
const props = defineProps<{ embed?: boolean }>()
const theme = useThemeStore()

const panelOpen = ref(!props.embed)
const cbCls = computed(() => (props.embed ? 'checkbox checkbox-sm' : 'checkbox checkbox-xs'))

declare global {
  interface Window { ReactNativeWebView?: { postMessage(msg: string): void } }
}

const SLOT: Record<MapKind, number> = { site: 8, olt: 1, l1: 3, l2: 7 }
const LABEL: Record<MapKind, string> = { site: 'สถานี', olt: 'OLT', l1: 'L1', l2: 'L2' }
const SHAPE: Record<MapKind, MarkerShape> = { site: 'triangle', olt: 'square', l1: 'diamond', l2: 'circle' }
/** หน้านี้มีแค่ 4 หมุด จึงใหญ่กว่าหน้า online ได้ — ให้นิ้วกดโดนบนมือถือ */
const RADIUS: Record<MapKind, number> = { site: 10, olt: 9, l1: 8, l2: 7 }
/** สีเส้นทาง — น้ำเงินเข้มขอบขาว ให้ต่างจากเคเบิลทุกคอร์ชัด ๆ */
const ROUTE_COLOR = '#2563eb'
const START_COLOR = '#2563eb'
/** BE ปิดชั้นเคเบิลต่ำกว่าซูมนี้ — หน้านี้ส่งค่าไม่ต่ำกว่านี้เพื่อให้ได้เคเบิลเสมอ (cap ยังคุมอยู่) */
const Z_CABLE = 11

const NORTH_BOUNDS = L.latLngBounds([15.0, 97.3], [20.5, 101.8])
const BASEMAP = {
  auto: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  light: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  sat: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  none: '',
} as const
type Basemap = keyof typeof BASEMAP

const el = ref<HTMLElement | null>(null)
const map = shallowRef<L.Map | null>(null)
const tiles = shallowRef<L.TileLayer | null>(null)
const renderer = shallowRef<L.Canvas | null>(null)
const gCable = shallowRef<L.LayerGroup | null>(null)
const gRoute = shallowRef<L.LayerGroup | null>(null)
const gChain = shallowRef<L.LayerGroup | null>(null)
const gStart = shallowRef<L.LayerGroup | null>(null)

const basemap = ref<Basemap>('auto')
const error = ref<string | null>(null)

/* ---------- ปลายทาง + สายโซ่ ---------- */
const q = ref('')
const sugg = ref<MapHit[]>([])
const target = ref<{ kind: MapKind; code: string } | null>(null)
const chain = ref<ChainStep[]>([])
const chainLoading = ref(false)

/* ---------- จุดเริ่ม ---------- */
const start = ref<LatLng | null>(null)
const startFrom = ref<'gps' | 'click' | null>(null)
const pickingStart = ref(false)
const gpsBusy = ref(false)
const gpsError = ref<string | null>(null)

/* ---------- เส้นทาง ---------- */
const visitAll = ref(false)
const route = ref<RouteResult | null>(null)
/** true = OSRM ล้ม เส้นที่เห็นเป็นเส้นตรงและระยะเป็นระยะทางอากาศ */
const routeFallback = ref(false)
const routing = ref(false)

/* ---------- เคเบิล ---------- */
const cablesOn = ref(true)
const cableMono = ref(false)
const cables = ref<CableView | null>(null)
/** กรอบที่โหลดเคเบิลไว้แล้ว — แพนอยู่ในนี้ไม่ต้องโหลดซ้ำ */
let cableBounds: L.LatLngBounds | null = null

function color(kind: MapKind): string {
  return categorical(SLOT[kind], theme.resolved === 'dark')
}

/** ขั้นในสายโซ่ที่มีพิกัด เรียงจากสถานีลงมา */
const located = computed(() =>
  chain.value.filter((s): s is ChainStep & { lat: number; lng: number } => s.lat !== null && s.lng !== null),
)
const targetStep = computed(() =>
  located.value.find((s) => target.value && s.kind === target.value.kind && s.code === target.value.code) ?? null,
)
/** จุดที่จะไป ตามลำดับ — โหมดแวะ = ทุกขั้นที่มีพิกัด · ปกติ = ปลายทางตัวเดียว */
const stops = computed<LatLng[]>(() => {
  if (visitAll.value) return located.value.map((s) => [s.lat, s.lng])
  const t = targetStep.value
  return t ? [[t.lat, t.lng]] : []
})
/** ชื่อของแต่ละช่วง ไว้แสดงคู่กับระยะ */
const legNames = computed<string[]>(() => {
  const names = visitAll.value
    ? located.value.map((s) => `${LABEL[s.kind]} ${s.code}`)
    : targetStep.value ? [`${LABEL[targetStep.value.kind]} ${targetStep.value.code}`] : []
  return ['จุดเริ่ม', ...names]
})
const mapsUrl = computed(() => (start.value && stops.value.length ? googleMapsUrl(start.value, stops.value) : ''))
const visibleCores = computed(() => coreOrder((cables.value?.groups ?? []).map((g) => g.core)))

/* ---------- ค้นหา ---------- */

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => {
  clearTimeout(searchTimer)
  const term = v.trim()
  if (term.length < 2) { sugg.value = []; return }
  searchTimer = setTimeout(async () => {
    try { sugg.value = await searchOnline(term) } catch { sugg.value = [] }
  }, 250)
})

async function pick(hit: MapHit) {
  sugg.value = []
  q.value = ''
  await select(hit.kind, hit.code)
}

async function select(kind: MapKind, code: string) {
  target.value = { kind, code }
  chainLoading.value = true
  error.value = null
  try {
    chain.value = await getChain(kind, code)
  } catch (err) {
    error.value = errorMessage(err, 'ไล่สายโซ่ไม่สำเร็จ')
    chain.value = []
    chainLoading.value = false
    return
  }
  chainLoading.value = false
  drawChain()
  fitAll()
  await Promise.all([loadCablesAround(), computeRoute()])
  notifyApp(kind, code)
}

function clearTarget() {
  target.value = null
  chain.value = []
  route.value = null
  gChain.value?.clearLayers()
  gRoute.value?.clearLayers()
}

/** บอกแอปมือถือว่าเลือกอะไร — แอปสนใจแค่รหัสสถานีปลายสายโซ่ */
function notifyApp(kind: MapKind, code: string) {
  if (!props.embed) return
  const site = chain.value.find((s) => s.kind === 'site')?.code ?? null
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'chain', kind, code, site }))
}

/* ---------- วาดสายโซ่ ---------- */

function drawChain() {
  const g = gChain.value
  const m = map.value
  if (!g || !m) return
  g.clearLayers()
  const dark = theme.resolved === 'dark'
  const edge = dark ? '#ffffff' : '#111827'
  const rend = renderer.value ?? undefined
  const pts = located.value.map((s) => [s.lat, s.lng] as LatLng)

  // เส้นพ่อ-ลูกเป็นเส้นประ ให้ต่างจากเส้นทางถนน (ทึบ) กับเคเบิล (บาง)
  if (pts.length > 1) {
    L.polyline(pts, { color: edge, weight: 2.5, opacity: 0.7, dashArray: '6 6', interactive: false, renderer: rend }).addTo(g)
  }
  for (const s of located.value) {
    const isTarget = target.value?.kind === s.kind && target.value.code === s.code
    shapeMarker([s.lat, s.lng], {
      shape: SHAPE[s.kind],
      radius: RADIUS[s.kind] + (isTarget ? 3 : 0),
      color: edge,
      weight: isTarget ? 4 : 2.5,
      fillColor: color(s.kind),
      fillOpacity: 1,
      renderer: rend,
    })
      .bindTooltip(`${LABEL[s.kind]} ${s.code}`, { permanent: true, direction: 'top', offset: [0, -RADIUS[s.kind]], className: 'survey-label' })
      .on('click', () => flyTo(s))
      .addTo(g)
  }
}

function flyTo(s: { lat: number; lng: number }) {
  const m = map.value
  if (m) m.setView([s.lat, s.lng], Math.max(m.getZoom(), 16), { animate: false })
}

/** ให้เห็นทั้งสายโซ่ + จุดเริ่มในจอเดียว */
function fitAll() {
  const m = map.value
  if (!m) return
  const pts: LatLng[] = located.value.map((s) => [s.lat, s.lng])
  if (start.value) pts.push(start.value)
  if (!pts.length) return
  if (pts.length === 1) { m.setView(pts[0]!, 15, { animate: false }); return }
  m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16, animate: false })
}

/* ---------- จุดเริ่ม ---------- */

function locate() {
  gpsError.value = null
  if (!('geolocation' in navigator)) {
    gpsError.value = 'เบราว์เซอร์นี้ไม่มีตำแหน่ง — กดบนแผนที่เพื่อตั้งจุดเริ่มแทน'
    return
  }
  gpsBusy.value = true
  navigator.geolocation.getCurrentPosition(
    (p) => {
      gpsBusy.value = false
      setStart([p.coords.latitude, p.coords.longitude], 'gps')
    },
    (e) => {
      gpsBusy.value = false
      // บน http:// ที่ไม่ใช่ localhost เบราว์เซอร์ปฏิเสธเสมอ — บอกทางออกไปเลย
      gpsError.value = e.code === e.PERMISSION_DENIED
        ? 'ไม่ได้รับสิทธิ์ตำแหน่ง (หรือหน้านี้ไม่ได้เปิดผ่าน https) — กดบนแผนที่เพื่อตั้งจุดเริ่มแทน'
        : 'หาตำแหน่งไม่สำเร็จ — กดบนแผนที่เพื่อตั้งจุดเริ่มแทน'
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
  )
}

function setStart(p: LatLng, from: 'gps' | 'click') {
  start.value = p
  startFrom.value = from
  pickingStart.value = false
  drawStart()
  if (!chain.value.length) map.value?.setView(p, Math.max(map.value.getZoom(), 13), { animate: false })
  else fitAll()
  void computeRoute()
}

function drawStart() {
  const g = gStart.value
  if (!g) return
  g.clearLayers()
  if (!start.value) return
  L.circleMarker(start.value, {
    radius: 9, color: '#ffffff', weight: 3, fillColor: START_COLOR, fillOpacity: 1,
    renderer: renderer.value ?? undefined,
  })
    .bindTooltip('จุดเริ่ม', { permanent: true, direction: 'top', offset: [0, -9], className: 'survey-label' })
    .addTo(g)
}

/* ---------- เส้นทาง ---------- */

let routeSeq = 0
async function computeRoute() {
  const from = start.value
  const to = stops.value
  if (!from || !to.length) {
    route.value = null
    gRoute.value?.clearLayers()
    return
  }
  const mine = ++routeSeq
  routing.value = true
  routeFallback.value = false
  try {
    const r = await routeVia([from, ...to])
    if (mine !== routeSeq) return
    route.value = r
  } catch {
    if (mine !== routeSeq) return
    // OSRM ล้ม → เส้นตรง ระยะทางอากาศ ความเร็วสมมติ 40 กม./ชม. ให้พอเดาเวลา
    const pts = [from, ...to]
    const legs = pts.slice(1).map((p, i) => {
      const m = metresBetween(pts[i]!, p)
      return { m, sec: (m / 40_000) * 3600 }
    })
    route.value = {
      legs,
      line: pts,
      m: legs.reduce((a, l) => a + l.m, 0),
      sec: legs.reduce((a, l) => a + l.sec, 0),
    }
    routeFallback.value = true
  } finally {
    if (mine === routeSeq) routing.value = false
  }
  drawRoute()
}

function drawRoute() {
  const g = gRoute.value
  if (!g) return
  g.clearLayers()
  const r = route.value
  if (!r) return
  const rend = renderer.value ?? undefined
  const dash = routeFallback.value ? '10 8' : undefined
  // ขอบขาวใต้เส้นน้ำเงิน ให้เส้นทางลอยเหนือเคเบิล/ถนนของ tile
  L.polyline(r.line, { color: '#ffffff', weight: 8, opacity: 0.9, interactive: false, renderer: rend, dashArray: dash }).addTo(g)
  L.polyline(r.line, { color: ROUTE_COLOR, weight: 4.5, opacity: 1, interactive: false, renderer: rend, dashArray: dash }).addTo(g)
}

watch(visitAll, () => void computeRoute())

/* ---------- เคเบิล ---------- */

/** โหลดเคเบิลรอบสายโซ่+จุดเริ่ม ทันทีที่รู้ว่าจะไปไหน ไม่รอซูม */
async function loadCablesAround() {
  const pts: LatLng[] = located.value.map((s) => [s.lat, s.lng])
  if (start.value) pts.push(start.value)
  if (!pts.length) return
  const b = pts.length === 1
    ? L.latLng(pts[0]!).toBounds(4_000)
    : L.latLngBounds(pts).pad(0.2)
  await loadCables(b)
}

async function loadCables(b: L.LatLngBounds) {
  const m = map.value
  if (!m || !cablesOn.value) return
  cableBounds = b
  try {
    cables.value = await getCables({
      bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()],
      zoom: Math.max(m.getZoom(), Z_CABLE),
    })
    drawCables()
  } catch (err) {
    error.value = errorMessage(err, 'โหลดเคเบิลไม่สำเร็จ')
  }
}

/** แพนออกนอกกรอบที่โหลดไว้ → โหลดตามกรอบจอ (เผื่อขอบ) */
let panTimer: ReturnType<typeof setTimeout> | undefined
function onMoved() {
  const m = map.value
  if (!m || !cablesOn.value) return
  clearTimeout(panTimer)
  panTimer = setTimeout(() => {
    const view = m.getBounds()
    if (cableBounds?.contains(view)) return
    void loadCables(view.pad(0.3))
  }, 300)
}

function drawCables() {
  const g = gCable.value
  if (!g) return
  paintCables(g, cables.value, {
    dark: theme.resolved === 'dark',
    mono: cableMono.value,
    renderer: renderer.value ?? undefined,
  })
}

watch(cablesOn, (on) => {
  if (!on) { cables.value = null; cableBounds = null; gCable.value?.clearLayers(); return }
  const m = map.value
  if (m) void loadCables(m.getBounds().pad(0.3))
})
watch(cableMono, drawCables)

/* ---------- พื้นหลัง ---------- */

const plainTiles = computed(() => basemap.value === 'light' || basemap.value === 'sat')

function applyBasemap() {
  const m = map.value
  if (!m) return
  if (tiles.value) { m.removeLayer(tiles.value); tiles.value = null }
  const url = BASEMAP[basemap.value]
  if (!url) return
  tiles.value = L.tileLayer(url, {
    maxZoom: 19,
    attribution: basemap.value === 'sat' ? '&copy; Esri' : '&copy; OpenStreetMap',
  }).addTo(m)
  tiles.value.bringToBack()
}
watch(basemap, applyBasemap)

/* ---------- วงจรชีวิต ---------- */

onMounted(() => {
  if (!el.value) return
  const m = L.map(el.value, {
    preferCanvas: true, minZoom: 5, maxZoom: 19, zoomControl: false, zoomAnimationThreshold: 2,
  })
  L.control.zoom({ position: 'bottomright' }).addTo(m)
  m.fitBounds(NORTH_BOUNDS)

  // 🪤 canvas ตัวเดียวสำหรับทุกชั้น ไม่งั้นใบบนกลืนคลิกของใบล่าง
  renderer.value = L.canvas({ padding: 0.3 })
  gCable.value = L.layerGroup().addTo(m)
  gRoute.value = L.layerGroup().addTo(m)
  gChain.value = L.layerGroup().addTo(m)
  gStart.value = L.layerGroup().addTo(m)
  map.value = m
  applyBasemap()

  m.on('click', (e) => {
    if (!pickingStart.value) return
    setStart([e.latlng.lat, e.latlng.lng], 'click')
  })
  m.on('moveend zoomend', onMoved)

  locate()
})

onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  clearTimeout(panTimer)
  map.value?.remove()
  map.value = null
})

watch(() => theme.resolved, () => {
  applyBasemap()
  drawChain()
  drawCables()
})
</script>

<template>
  <div
    class="relative h-full w-full overflow-hidden"
    :class="{ 'map-plain': plainTiles, 'cursor-crosshair': pickingStart }"
  >
    <!-- 🪤 ห้ามผูก :class กับ div นี้ — Leaflet ยึดไปเป็น container (ดู OnlineNetworkMap.vue) -->
    <div ref="el" class="h-full w-full" />

    <button
      v-if="embed && !panelOpen"
      type="button"
      class="btn btn-sm absolute left-3 top-3 z-[800] shadow-lg"
      @click="panelOpen = true"
    >
      ☰ สำรวจ
    </button>

    <div
      v-show="panelOpen"
      class="pointer-events-auto absolute left-3 top-3 z-[800] max-h-[calc(100%-7.5rem)] w-80 max-w-[calc(100%-1.5rem)]
             overflow-auto rounded-box border border-base-300 bg-base-100/95 p-3 shadow-lg backdrop-blur"
    >
      <div class="mb-2 flex items-start gap-2">
        <div class="min-w-0">
          <p class="text-sm font-semibold">แผนที่สำรวจ</p>
          <p class="text-xs opacity-60">กรอกปลายทาง → เห็นสายโซ่ เคเบิล และทางไป</p>
        </div>
        <button v-if="embed" type="button" class="btn btn-ghost btn-sm ml-auto" title="พับแผง" @click="panelOpen = false">✕</button>
      </div>

      <!-- ปลายทาง -->
      <div class="relative">
        <input
          v-model="q" type="search" placeholder="รหัสปลายทาง (OLT / L1 / L2 / สถานี)"
          class="input input-bordered input-sm w-full"
        >
        <ul
          v-if="sugg.length"
          class="absolute inset-x-0 top-full z-[900] mt-1 max-h-60 overflow-auto rounded-box
                 border border-base-300 bg-base-100 shadow-lg"
        >
          <li v-for="h in sugg" :key="`${h.kind}-${h.code}`">
            <button
              type="button"
              class="flex w-full items-center gap-2 px-2 py-2 text-left text-xs hover:bg-base-200"
              @click="pick(h)"
            >
              <svg class="size-3 shrink-0" viewBox="-10 -10 20 20" aria-hidden="true">
                <polygon v-if="glyphPoints(SHAPE[h.kind])" :points="glyphPoints(SHAPE[h.kind])" :fill="color(h.kind)" />
                <circle v-else r="7" :fill="color(h.kind)" />
              </svg>
              <span class="font-mono">{{ h.code }}</span>
              <span class="ml-auto opacity-60">{{ LABEL[h.kind] }}</span>
              <span v-if="h.lat === null" class="text-warning">ไม่มีพิกัด</span>
            </button>
          </li>
        </ul>
      </div>

      <!-- สายโซ่ -->
      <div v-if="target" class="mt-3">
        <div class="mb-1 flex items-center">
          <p class="text-xs font-semibold uppercase opacity-60">สายโซ่ถึงสถานี uplink</p>
          <button type="button" class="btn btn-ghost btn-xs ml-auto" @click="clearTarget">ล้าง</button>
        </div>
        <p v-if="chainLoading" class="text-xs opacity-60">กำลังไล่สายโซ่…</p>
        <ul v-else class="space-y-0.5">
          <li v-for="s in chain" :key="`${s.kind}-${s.code}`">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-base-200"
              :class="{ 'font-semibold': target.kind === s.kind && target.code === s.code }"
              :disabled="s.lat === null"
              @click="s.lat !== null && s.lng !== null && flyTo({ lat: s.lat, lng: s.lng })"
            >
              <svg class="size-3.5 shrink-0" viewBox="-10 -10 20 20" aria-hidden="true">
                <polygon v-if="glyphPoints(SHAPE[s.kind])" :points="glyphPoints(SHAPE[s.kind])" :fill="color(s.kind)" />
                <circle v-else r="7" :fill="color(s.kind)" />
              </svg>
              <span class="w-8 shrink-0 opacity-60">{{ LABEL[s.kind] }}</span>
              <span class="font-mono">{{ s.code }}</span>
              <span v-if="s.lat === null" class="ml-auto text-warning">ไม่มีพิกัด</span>
              <span v-else class="ml-auto font-mono opacity-50">{{ s.lat.toFixed(4) }}, {{ s.lng!.toFixed(4) }}</span>
            </button>
          </li>
        </ul>
        <p v-if="!chainLoading && chain.length && !chain.some((s) => s.kind === 'site')" class="mt-1 text-xs text-warning">
          สายโซ่นี้ไล่ขึ้นไปไม่ถึงสถานี (OLT ยังไม่ผูกสถานี)
        </p>
      </div>

      <!-- จุดเริ่ม -->
      <div class="mt-3 border-t border-base-300 pt-2">
        <p class="mb-1 text-xs font-semibold uppercase opacity-60">จุดเริ่ม</p>
        <p class="text-xs">
          <template v-if="start">
            <span class="font-mono">{{ start[0].toFixed(5) }}, {{ start[1].toFixed(5) }}</span>
            <span class="opacity-60"> · {{ startFrom === 'gps' ? 'จาก GPS' : 'กดบนแผนที่' }}</span>
          </template>
          <span v-else class="opacity-60">ยังไม่มีจุดเริ่ม</span>
        </p>
        <div class="mt-1 flex gap-1">
          <button type="button" class="btn btn-sm flex-1" :disabled="gpsBusy" @click="locate">
            {{ gpsBusy ? 'กำลังหา…' : '📍 ใช้ตำแหน่งฉัน' }}
          </button>
          <button
            type="button" class="btn btn-sm flex-1" :class="{ 'btn-primary': pickingStart }"
            @click="pickingStart = !pickingStart"
          >
            {{ pickingStart ? 'กดบนแผนที่…' : 'เลือกบนแผนที่' }}
          </button>
        </div>
        <p v-if="gpsError" class="mt-1 text-xs text-warning">{{ gpsError }}</p>
      </div>

      <!-- เส้นทาง -->
      <div class="mt-3 border-t border-base-300 pt-2">
        <p class="mb-1 text-xs font-semibold uppercase opacity-60">เส้นทาง</p>
        <label class="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
          <input v-model="visitAll" type="checkbox" :class="cbCls">
          <span>แวะทุกจุดในสายโซ่ (สถานี → OLT → L1 → L2)</span>
        </label>
        <p v-if="!start || !stops.length" class="mt-1 text-xs opacity-60">
          ต้องมีทั้งจุดเริ่มและปลายทางที่มีพิกัด
        </p>
        <p v-else-if="routing" class="mt-1 text-xs opacity-60">กำลังคำนวณเส้นทาง…</p>
        <template v-else-if="route">
          <p v-if="routeFallback" class="mt-1 text-xs text-warning">
            คำนวณเส้นทางถนนไม่ได้ (OSRM ไม่ตอบ) — แสดงเส้นตรงและระยะทางอากาศแทน
          </p>
          <p class="mt-1 text-sm">
            <b>{{ formatM(route.m) }}</b> · ประมาณ <b>{{ formatDuration(route.sec) }}</b>
            <span v-if="!routeFallback" class="opacity-60"> ทางรถยนต์</span>
          </p>
          <ol v-if="route.legs.length > 1" class="mt-1 space-y-0.5 text-xs">
            <li v-for="(leg, i) in route.legs" :key="i" class="flex gap-1">
              <span class="opacity-60">{{ legNames[i] }} → {{ legNames[i + 1] }}</span>
              <span class="ml-auto whitespace-nowrap font-mono">{{ formatM(leg.m) }} · {{ formatDuration(leg.sec) }}</span>
            </li>
          </ol>
          <a v-if="mapsUrl" :href="mapsUrl" target="_blank" rel="noopener" class="btn btn-sm mt-2 w-full">
            เปิดนำทางใน Google Maps
          </a>
        </template>
      </div>

      <!-- เคเบิล -->
      <div class="mt-3 border-t border-base-300 pt-2">
        <label class="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
          <input v-model="cablesOn" type="checkbox" :class="cbCls">
          <span>เคเบิลใยแก้ว</span>
          <span v-if="cables" class="ml-auto text-xs opacity-60">{{ cables.total.toLocaleString() }} เส้น</span>
        </label>
        <template v-if="cablesOn">
          <label class="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
            <input v-model="cableMono" type="checkbox" :class="cbCls">
            <span>สีเดียว (ไม่แยกคอร์)</span>
          </label>
          <p v-if="cables?.capped" class="text-xs text-warning">แสดงบางส่วน — ซูมเข้าเพื่อดูครบ</p>
          <div v-if="!cableMono && visibleCores.length" class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            <span v-for="core in visibleCores" :key="core" class="inline-flex items-center gap-1">
              <span class="h-0.5 w-4 rounded" :style="{ background: cableColor(core, theme.resolved === 'dark') }" />
              {{ core || 'ไม่ระบุ' }}<span v-if="core" class="opacity-60">c</span>
            </span>
          </div>
        </template>
      </div>

      <!-- พื้นหลัง -->
      <div class="mt-3 border-t border-base-300 pt-2">
        <p class="mb-1 text-xs font-semibold uppercase opacity-60">พื้นหลัง</p>
        <select v-model="basemap" class="select select-bordered select-sm w-full">
          <option value="auto">ตามธีม (OpenStreetMap)</option>
          <option value="light">แผนที่ถนน</option>
          <option value="sat">ภาพถ่ายดาวเทียม (Esri)</option>
          <option value="none">ไม่มีพื้นหลัง</option>
        </select>
      </div>

      <RouterLink
        v-if="!embed && target"
        :to="{ path: '/online/map', query: { kind: target.kind, code: target.code } }"
        class="btn btn-ghost btn-sm mt-3 w-full"
      >
        เปิดในแผนที่โครงข่าย online →
      </RouterLink>
    </div>

    <!-- แถบสรุปล่างซ้าย — เห็นได้แม้พับแผง (มือถือ) -->
    <div
      v-if="error || pickingStart || route"
      class="absolute bottom-3 left-3 z-[800] max-w-[min(28rem,calc(100%-1.5rem))] rounded-box
             border border-base-300 bg-base-100/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
    >
      <p v-if="error" class="text-error">{{ error }}</p>
      <p v-else-if="pickingStart">กดบนแผนที่ตรงจุดที่จะออกเดินทาง</p>
      <template v-else-if="route">
        <p>
          <span class="font-mono font-semibold">{{ target?.code }}</span>
          · {{ formatM(route.m) }} · {{ formatDuration(route.sec) }}
          <span v-if="routeFallback" class="text-warning"> (เส้นตรง)</span>
        </p>
        <a v-if="mapsUrl && !panelOpen" :href="mapsUrl" target="_blank" rel="noopener" class="link link-primary">
          เปิดนำทางใน Google Maps
        </a>
      </template>
    </div>
  </div>
</template>

<style>
/* ป้ายชื่อหมุด — เป็น tooltip ของ Leaflet จึงอยู่นอกขอบเขต scoped style */
.survey-label {
  padding: 1px 6px;
  border-radius: 5px;
  border: 1px solid rgba(0, 0, 0, 0.25);
  background: rgba(255, 255, 255, 0.92);
  color: #111827;
  font-size: 11px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}
:root[data-theme='dark'] .survey-label {
  background: rgba(15, 21, 32, 0.92);
  border-color: rgba(255, 255, 255, 0.25);
  color: #f3f4f6;
}
.survey-label::before {
  display: none;
}

.cursor-crosshair .leaflet-container {
  cursor: crosshair;
}

/* ยกเลิกการกลับสี tile ของธีมมืดสำหรับแผนที่ถนน/ดาวเทียม (กฎเดียวกับ OnlineNetworkMap.vue) */
:root[data-theme='dark'] .map-plain .leaflet-tile-pane {
  filter: none;
}
</style>

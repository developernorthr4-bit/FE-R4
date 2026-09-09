<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { errorMessage } from '../lib/api'
import OltRadiusPanel from './OltRadiusPanel.vue'
import { categorical } from '../lib/palette'
import {
  getChain, getMapView, searchOnline,
  type ChainStep, type MapHit, type MapKind, type MapView,
} from '../services/online.api'
import { loadProvinces, type Province } from '../services/provinces.api'
import { useThemeStore } from '../stores/theme'

/**
 * แผนที่โครงข่ายงาน online ทั้งภาค — สถานี → OLT → L1 → L2
 *
 * ต่างจาก SiteOnlineMap.vue ที่วาดสถานีเดียว อันนั้นขอข้อมูลทั้งสถานีมาทีเดียว
 * เพราะรู้ว่าจบที่ไม่กี่พันจุด ส่วนอันนี้มี 95,906 จุดจึงขอตามกรอบจอทุกครั้งที่แพน
 *
 * สามอย่างที่ทำให้มันไหว ต้องอยู่ครบทั้งสาม
 *   1. BE ปิดชั้นตามซูม — L1 โผล่ที่ซูม 11 · L2 ที่ 13 ต่ำกว่านั้นไม่ส่งมาเลย
 *   2. ขอเฉพาะที่อยู่ในกรอบจอ (+ขอบเผื่อ 15%) ไม่ใช่ทั้งภาค
 *   3. เส้นทั้งชั้นเป็น polyline เดียว ไม่ใช่ object ต่อเส้น — 6,000 เส้นเหลือ 1 object
 *
 * ไม่แคชผลโดยตั้งใจ ถ้าเก็บสะสมทุกกรอบที่เคยเปิดคือถือทั้งโครงข่ายไว้ในเบราว์เซอร์
 */
const theme = useThemeStore()

const KINDS: MapKind[] = ['site', 'olt', 'l1', 'l2']
/** ชั้นที่มีเส้นวิ่งขึ้นไปหาพ่อ — สถานีเป็นชั้นบนสุดจึงไม่มี */
const EDGE_KINDS = ['olt', 'l1', 'l2'] as const
type EdgeKind = (typeof EDGE_KINDS)[number]

/* สีชุดเดียวกับแผนที่รายสถานี เพื่อให้สองหน้าอ่านด้วยสายตาชุดเดียวกัน
   ขนาดจุดเป็นช่องทางที่สอง — ห้ามให้สีเป็นช่องทางเดียวที่บอกความหมาย */
const SLOT: Record<MapKind, number> = { site: 8, olt: 1, l1: 3, l2: 7 }
const RADIUS: Record<MapKind, number> = { site: 5, olt: 4, l1: 3, l2: 2 }
const LABEL: Record<MapKind, string> = { site: 'สถานี', olt: 'OLT', l1: 'L1', l2: 'L2' }

/** เส้นที่ยาวเกินนี้ = ข้อมูลผิด ไม่ใช่สายที่ยาวจริง (ของจริงไกลสุด 69.7 กม.) */
const ANOM_KM = 30
const ANOM_SLOT = 2

/*
 * โหมด Re-design — ระบายสี L1 ตามระยะถึง OLT ตามเกณฑ์ใน note.txt
 * ตัวที่ต้องแก้วาดใหญ่กว่าและวาดทีหลัง จะได้ไม่ถูกตัวที่ผ่านเกณฑ์กลบ
 * ทั้งภาคมีที่ต้อง Re-design 2,230 ตัว · เฝ้าดู 760 · ผ่าน 13,230 · วัดไม่ได้ 76
 */
const BAND_SLOT = [6, 4, 8] as const
const BAND_RADIUS = [2, 4, 5] as const
const BAND_LABEL_SHORT = ['≤ 3,500 ม.', '3,501–4,000 ม.', '> 4,000 ม.'] as const

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
const gLine = shallowRef<L.LayerGroup | null>(null)
const gPoint = shallowRef<L.LayerGroup | null>(null)
const gHi = shallowRef<L.LayerGroup | null>(null)
const renderer = shallowRef<L.Canvas | null>(null)

const view = ref<MapView | null>(null)
const totals = ref<Record<MapKind, number> | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const zoom = ref(0)

const showPoint = ref<Record<MapKind, boolean>>({ site: true, olt: true, l1: true, l2: true })
const showEdge = ref<Record<EdgeKind, boolean>>({ olt: true, l1: true, l2: true })
const anomalyOnly = ref(false)
const province = ref<number | ''>('')
const provinces = ref<Province[]>([])
const basemap = ref<Basemap>('auto')

const shownPoint = ref<Record<MapKind, number>>({ site: 0, olt: 0, l1: 0, l2: 0 })
const shownEdge = ref<Record<EdgeKind, number>>({ olt: 0, l1: 0, l2: 0 })
const anomalyCount = ref(0)

const chain = ref<ChainStep[]>([])
const q = ref('')
const sugg = ref<MapHit[]>([])

const odn = ref(false)
const bands = ref<[boolean, boolean, boolean]>([true, true, true])
/** ซ่อน L2 และหรี่ชั้นอื่น เพื่อให้เหลือแต่สิ่งที่กำลังตัดสินใจ */
const odnFocus = ref(true)

/** จุดที่กดล่าสุด — ใช้ตัดสินว่าจะเสนอปุ่ม "วิเคราะห์รัศมี" ไหม */
const selected = ref<{ kind: MapKind; code: string } | null>(null)
/** OLT ที่เปิดแผงวิเคราะห์อยู่ */
const radiusFor = ref<string | null>(null)
const gRad = shallowRef<L.LayerGroup | null>(null)

function bandOf(d: number | null | undefined): 0 | 1 | 2 | null {
  if (d === null || d === undefined) return null
  const v = view.value?.odn
  if (d <= 0 || d > (v?.max ?? 4000)) return 2
  return d > (v?.ok ?? 3500) ? 1 : 0
}

function color(kind: MapKind): string {
  return categorical(SLOT[kind], theme.resolved === 'dark')
}

/** ระยะจริงบนผิวโลก — ใช้ตัดสินว่าเส้นไหนผิดปกติ */
function haversineKm(y1: number, x1: number, y2: number, x2: number): number {
  const R = 6371
  const dy = ((y2 - y1) * Math.PI) / 180
  const dx = ((x2 - x1) * Math.PI) / 180
  const a = Math.sin(dy / 2) ** 2
    + Math.cos((y1 * Math.PI) / 180) * Math.cos((y2 * Math.PI) / 180) * Math.sin(dx / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/* ---------- โหลดข้อมูลตามกรอบจอ ---------- */

let timer: ReturnType<typeof setTimeout> | undefined
/** กันผลลัพธ์ที่มาช้ามาทับของใหม่ ตอนแพนรัว ๆ คำขอไม่ได้กลับมาตามลำดับที่ยิงไป */
let seq = 0

function scheduleLoad() {
  clearTimeout(timer)
  timer = setTimeout(() => void load(), 250)
}

async function load(withTotals = false) {
  const m = map.value
  if (!m) return
  const b = m.getBounds().pad(0.15)
  const mine = ++seq
  loading.value = true
  error.value = null
  try {
    const data = await getMapView({
      bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()],
      zoom: m.getZoom(),
      province: province.value,
      totals: withTotals || totals.value === null,
      odn: odn.value,
    })
    if (mine !== seq) return
    view.value = data
    if (data.totals) totals.value = data.totals
    draw()
  } catch (err) {
    if (mine === seq) error.value = errorMessage(err, 'โหลดข้อมูลแผนที่ไม่สำเร็จ')
  } finally {
    if (mine === seq) loading.value = false
  }
}

/* ---------- วาด ---------- */

function draw() {
  const m = map.value
  const v = view.value
  const lines = gLine.value
  const points = gPoint.value
  if (!m || !v || !lines || !points) return

  lines.clearLayers()
  points.clearLayers()
  shownPoint.value = { site: 0, olt: 0, l1: 0, l2: 0 }
  shownEdge.value = { olt: 0, l1: 0, l2: 0 }
  anomalyCount.value = 0

  const dark = theme.resolved === 'dark'
  const rend = renderer.value ?? undefined

  /*
   * เส้นก่อนแล้วค่อยจุด — canvas วาดตามลำดับที่เพิ่ม ถ้าจุดมาก่อนเส้นจะพาดทับ
   * และรวมทุกเส้นของชั้นเดียวกันไว้ใน polyline เดียว นี่คือหัวใจที่ทำให้ 6,000
   * เส้นไม่ทำให้เบราว์เซอร์ค้าง — ถ้าแยกเป็น object ละเส้นจะหน่วงทันทีที่ซูม 13
   */
  const anomAll: L.LatLngExpression[][] = []
  const odnOn = odn.value && Array.isArray(v.l1.d)

  for (const k of EDGE_KINDS) {
    if (odnOn && odnFocus.value && k === 'l2') continue
    const lay = v[k]
    const normal: L.LatLngExpression[][] = []
    const byBand: L.LatLngExpression[][][] = [[], [], []]

    for (let i = 0; i < lay.code.length; i++) {
      const y = lay.y[i]
      const x = lay.x[i]
      const py = lay.py[i]
      const px = lay.px[i]
      if (y === undefined || x === undefined || py === null || px === null
        || py === undefined || px === undefined) continue

      const far = haversineKm(y, x, py, px) > ANOM_KM
      if (far) anomalyCount.value += 1
      if (!showEdge.value[k]) continue
      if (anomalyOnly.value && !far) continue

      const band = odnOn && k === 'l1' ? bandOf(lay.d?.[i]) : null
      if (band !== null && !bands.value[band]) continue

      if (far) anomAll.push([[py, px], [y, x]])
      else if (band !== null) byBand[band]!.push([[py, px], [y, x]])
      else normal.push([[py, px], [y, x]])
      shownEdge.value[k] += 1
    }

    for (let b = 0; b < 3; b++) {
      const segs = byBand[b]
      if (!segs?.length) continue
      L.polyline(segs, {
        color: categorical(BAND_SLOT[b as 0 | 1 | 2], dark),
        weight: b ? 1.8 : 0.8,
        opacity: b ? 0.9 : 0.35,
        renderer: rend,
        interactive: false,
      }).addTo(lines)
    }

    if (normal.length) {
      L.polyline(normal, {
        color: color(k),
        weight: k === 'olt' ? 1.6 : k === 'l1' ? 1.1 : 0.8,
        opacity: (k === 'olt' ? 0.55 : k === 'l1' ? 0.45 : 0.32) * (odnOn && odnFocus.value ? 0.4 : 1),
        renderer: rend,
        interactive: false,
      }).addTo(lines)
    }
  }

  // เส้นผิดปกติวาดทีหลังสุดและหนากว่า จะได้ไม่ถูกเส้นปกติกลบ
  if (anomAll.length) {
    L.polyline(anomAll, {
      color: categorical(ANOM_SLOT, dark),
      weight: 2,
      opacity: 0.95,
      dashArray: '5 4',
      renderer: rend,
      interactive: false,
    }).addTo(lines)
  }

  for (const k of KINDS) {
    if (!showPoint.value[k]) continue
    if (odnOn && odnFocus.value && k === 'l2') continue
    const lay = v[k]
    const base = color(k)
    // ในโหมดโฟกัส ชั้นที่ไม่ใช่ L1 หรี่ลงให้เหลือเป็นฉากหลัง ไม่ใช่ซ่อนไปเลย
    const dim = odnOn && odnFocus.value && k !== 'l1'

    /*
     * โหมด Re-design วาด L1 ทีละช่วง เขียว → เหลือง → แดง
     * canvas วาดตามลำดับที่เพิ่ม ถ้าไล่ตามลำดับใน array ตัวเขียวที่มาทีหลังจะทับ
     * ตัวแดงซึ่งเป็นตัวที่ต้องเห็น · ตัวที่วัดระยะไม่ได้ให้ไปอยู่รอบแรกสุด
     */
    const passes: number[] = odnOn && k === 'l1' ? [0, 1, 2] : [-1]

    for (const pass of passes) {
    for (let i = 0; i < lay.code.length; i++) {
      const y = lay.y[i]
      const x = lay.x[i]
      const code = lay.code[i]
      if (y === undefined || x === undefined || code === undefined) continue

      if (anomalyOnly.value && k !== 'site') {
        const py = lay.py[i]
        const px = lay.px[i]
        if (py === null || px === null || py === undefined || px === undefined) continue
        if (haversineKm(y, x, py, px) <= ANOM_KM) continue
      }

      let fill = base
      let radius = RADIUS[k]
      if (pass >= 0) {
        const band = bandOf(lay.d?.[i])
        // ตัวที่วัดไม่ได้ (OLT ไม่มีพิกัด) ไม่ใช่ "ต้องแก้" — วาดด้วยสีปกติในรอบแรก
        if (band === null) {
          if (pass !== 0) continue
        } else {
          if (band !== pass) continue
          if (!bands.value[band]) continue
          fill = categorical(BAND_SLOT[band], dark)
          radius = BAND_RADIUS[band]
        }
      }

      const mk = L.circleMarker([y, x], {
        radius,
        color: dark ? '#0b1017' : '#ffffff',
        weight: 1,
        fillColor: fill,
        fillOpacity: dim ? 0.3 : 0.95,
        renderer: rend,
      })
      mk.bindTooltip(`${code} · ${LABEL[k]}`, { direction: 'top', offset: [0, -4] })
      mk.on('click', () => void select(k, code))
      mk.addTo(points)
      shownPoint.value[k] += 1
    }
    }
  }
}

/* ---------- ไฮไลต์สายโซ่ ---------- */

async function select(kind: MapKind, code: string) {
  selected.value = { kind, code }
  try {
    chain.value = await getChain(kind, code)
  } catch (err) {
    error.value = errorMessage(err, 'ไล่สายโซ่ไม่สำเร็จ')
    return
  }
  drawChain()
}

function drawChain() {
  const g = gHi.value
  if (!g) return
  g.clearLayers()

  const dark = theme.resolved === 'dark'
  const edge = dark ? '#ffffff' : '#111827'
  const pts = chain.value
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => [s.lat as number, s.lng as number] as [number, number])

  if (pts.length > 1) {
    L.polyline(pts, { color: edge, weight: 4, opacity: 0.85, interactive: false }).addTo(g)
  }
  chain.value.forEach((s, i) => {
    const p = pts[i]
    if (!p) return
    L.circleMarker(p, {
      radius: RADIUS[s.kind] + 4,
      color: edge,
      weight: 3,
      fillColor: color(s.kind),
      fillOpacity: 1,
    }).addTo(g)
  })
}

function clearChain() {
  chain.value = []
  selected.value = null
  gHi.value?.clearLayers()
}

/* ---------- แผงวิเคราะห์รัศมี ---------- */

/** วงรัศมีรอบ OLT — คนละ layer กับไฮไลต์สายโซ่ จะได้ปิดคนละเวลากันได้ */
function setCircle(c: { lat: number; lng: number; km: number } | null) {
  const g = gRad.value
  const m = map.value
  if (!g || !m) return
  g.clearLayers()
  if (!c) return
  const dark = theme.resolved === 'dark'
  L.circle([c.lat, c.lng], {
    radius: c.km * 1000,
    color: categorical(SLOT.olt, dark),
    weight: 2,
    fillOpacity: 0.06,
    interactive: false,
  }).addTo(g)
  m.fitBounds(L.latLng(c.lat, c.lng).toBounds(c.km * 2200))
}

function gotoPoint(p: { lat: number; lng: number }) {
  const m = map.value
  if (m) m.setView([p.lat, p.lng], Math.max(m.getZoom(), 16))
}

function closeRadius() {
  radiusFor.value = null
  gRad.value?.clearLayers()
}

/* ---------- ค้นหา ---------- */

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => {
  clearTimeout(searchTimer)
  const term = v.trim()
  if (term.length < 2) {
    sugg.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      sugg.value = await searchOnline(term)
    } catch {
      sugg.value = []
    }
  }, 250)
})

function goTo(hit: MapHit) {
  const m = map.value
  if (!m || hit.lat === null || hit.lng === null) return
  sugg.value = []
  q.value = ''
  m.setView([hit.lat, hit.lng], Math.max(m.getZoom(), 16))
  void select(hit.kind, hit.code)
}

/* ---------- พื้นหลัง ---------- */

function applyBasemap() {
  const m = map.value
  if (!m) return
  if (tiles.value) {
    m.removeLayer(tiles.value)
    tiles.value = null
  }
  const url = BASEMAP[basemap.value]
  if (!url) return
  tiles.value = L.tileLayer(url, {
    maxZoom: 19,
    attribution: basemap.value === 'sat' ? '&copy; Esri' : '&copy; OpenStreetMap',
  }).addTo(m)
  tiles.value.bringToBack()
}

/* ---------- ตัวกรองที่เปิดค้างอยู่ ---------- */

const chips = computed(() => {
  const out: { key: string; label: string }[] = []
  if (province.value) {
    const p = provinces.value.find((x) => x.id === province.value)
    out.push({ key: 'province', label: `จังหวัด ${p?.nameTh ?? province.value}` })
  }
  if (anomalyOnly.value) out.push({ key: 'anom', label: `เฉพาะเส้น > ${ANOM_KM} กม.` })
  if (odn.value) out.push({ key: 'odn', label: 'โหมด Re-design' })
  if (radiusFor.value) out.push({ key: 'radius', label: `วิเคราะห์ ${radiusFor.value}` })
  for (const k of KINDS) if (!showPoint.value[k]) out.push({ key: `p:${k}`, label: `ซ่อนจุด ${LABEL[k]}` })
  for (const k of EDGE_KINDS) if (!showEdge.value[k]) out.push({ key: `e:${k}`, label: `ซ่อนเส้น ${LABEL[k]}` })
  if (chain.value.length) out.push({ key: 'chain', label: 'ไฮไลต์อยู่' })
  return out
})

function clearChip(key: string) {
  if (key === 'province') province.value = ''
  else if (key === 'anom') anomalyOnly.value = false
  else if (key === 'odn') odn.value = false
  else if (key === 'radius') closeRadius()
  else if (key === 'chain') clearChain()
  else if (key.startsWith('p:')) showPoint.value[key.slice(2) as MapKind] = true
  else if (key.startsWith('e:')) showEdge.value[key.slice(2) as EdgeKind] = true
}

function resetAll() {
  province.value = ''
  anomalyOnly.value = false
  showPoint.value = { site: true, olt: true, l1: true, l2: true }
  showEdge.value = { olt: true, l1: true, l2: true }
  bands.value = [true, true, true]
  clearChain()
  closeRadius()
  map.value?.fitBounds(NORTH_BOUNDS)
}

/* ---------- วงจรชีวิต ---------- */

onMounted(async () => {
  if (!el.value) return

  const m = L.map(el.value, { preferCanvas: true, minZoom: 5, maxZoom: 19, zoomControl: true })
  m.fitBounds(NORTH_BOUNDS)

  renderer.value = L.canvas({ padding: 0.3 })
  gLine.value = L.layerGroup().addTo(m)
  gPoint.value = L.layerGroup().addTo(m)
  gRad.value = L.layerGroup().addTo(m)
  gHi.value = L.layerGroup().addTo(m)

  map.value = m
  applyBasemap()

  zoom.value = m.getZoom()
  m.on('moveend zoomend', () => {
    zoom.value = m.getZoom()
    scheduleLoad()
  })

  try {
    provinces.value = await loadProvinces()
  } catch {
    // ไม่มีรายชื่อจังหวัดก็ยังใช้แผนที่ได้ แค่กรองไม่ได้
  }
  await load(true)
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  clearTimeout(searchTimer)
  map.value?.remove()
  map.value = null
})

watch(() => theme.resolved, () => {
  applyBasemap()
  draw()
  drawChain()
})

watch([showPoint, showEdge, anomalyOnly, bands, odnFocus], draw, { deep: true })
watch(province, () => { totals.value = null; void load(true) })
watch(basemap, applyBasemap)

/* เปิด/ปิดโหมด Re-design ต้องโหลดใหม่ ไม่ใช่แค่วาดใหม่ — BE ส่งข้อมูลคนละชุด
   (โหมดนี้ส่ง L1 ที่เกินเกณฑ์มาทุกระดับซูม พร้อมระยะถึง OLT ของแต่ละตัว) */
watch(odn, () => void load())

/** true = พื้นหลังนี้ต้องไม่โดนฟิลเตอร์กลับสีของธีมมืด */
const plainTiles = computed(() => basemap.value === 'light' || basemap.value === 'sat')

const totalOf = (k: MapKind) => totals.value?.[k] ?? 0
const edgeTotal = computed(() => shownEdge.value.olt + shownEdge.value.l1 + shownEdge.value.l2)
const cappedAny = computed(() => {
  const c = view.value?.capped
  return !!c && (c.site || c.l1 || c.l2)
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden rounded-box border border-base-300">
    <div ref="el" class="h-full w-full" :class="{ 'map-plain': plainTiles }" />

    <!-- แผงควบคุม ลอยทับแผนที่แบบเดียวกับไฟล์ต้นแบบ เพื่อไม่กินพื้นที่แผนที่ -->
    <div
      class="pointer-events-auto absolute left-3 top-3 z-[800] max-h-[calc(100%-1.5rem)] w-72
             overflow-auto rounded-box border border-base-300 bg-base-100/95 p-3 shadow-lg backdrop-blur"
    >
      <div class="mb-2">
        <p class="text-sm font-semibold">โครงข่ายงาน online</p>
        <p class="text-xs opacity-60">สถานี → OLT → L1 → L2</p>
      </div>

      <select v-model="province" class="select select-bordered select-sm w-full">
        <option :value="''">ทุกจังหวัด</option>
        <option v-for="p in provinces" :key="p.id" :value="p.id">{{ p.nameTh }}</option>
      </select>

      <div class="relative mt-2">
        <input
          v-model="q" type="search" placeholder="ค้นหารหัส (พิมพ์บางส่วนได้)"
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
              class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-base-200"
              @click="goTo(h)"
            >
              <span class="size-2 rounded-full" :style="{ background: color(h.kind) }" />
              <span class="font-mono">{{ h.code }}</span>
              <span class="ml-auto opacity-60">{{ LABEL[h.kind] }}</span>
            </button>
          </li>
        </ul>
      </div>

      <button type="button" class="btn btn-sm mt-2 w-full" @click="resetAll">
        ล้างตัวกรอง + ไฮไลต์
      </button>

      <div v-if="chips.length" class="mt-2 flex flex-wrap gap-1">
        <button
          v-for="c in chips" :key="c.key" type="button"
          class="badge badge-sm gap-1 hover:badge-error"
          @click="clearChip(c.key)"
        >
          {{ c.label }} ✕
        </button>
      </div>

      <div class="mt-3 border-t border-base-300 pt-2">
        <p class="mb-1 text-xs font-semibold uppercase opacity-60">จุด</p>
        <label v-for="k in KINDS" :key="`p-${k}`" class="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
          <input v-model="showPoint[k]" type="checkbox" class="checkbox checkbox-xs">
          <span class="size-2.5 rounded-full" :style="{ background: color(k) }" />
          {{ LABEL[k] }}
          <span class="ml-auto font-mono text-xs opacity-60">
            {{ shownPoint[k].toLocaleString() }} / {{ totalOf(k).toLocaleString() }}
          </span>
        </label>
      </div>

      <div class="mt-3 border-t border-base-300 pt-2">
        <p class="mb-1 text-xs font-semibold uppercase opacity-60">เส้นเชื่อม</p>
        <label v-for="k in EDGE_KINDS" :key="`e-${k}`" class="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
          <input v-model="showEdge[k]" type="checkbox" class="checkbox checkbox-xs">
          <span class="h-0.5 w-4 rounded" :style="{ background: color(k) }" />
          {{ k === 'olt' ? 'สถานี → OLT' : k === 'l1' ? 'OLT → L1' : 'L1 → L2' }}
          <span class="ml-auto font-mono text-xs opacity-60">{{ shownEdge[k].toLocaleString() }}</span>
        </label>

        <label class="mt-1 flex cursor-pointer items-center gap-2 border-t border-base-300 pt-2 text-sm">
          <input v-model="anomalyOnly" type="checkbox" class="checkbox checkbox-xs">
          <span
            class="h-0.5 w-4 rounded"
            :style="{ background: categorical(ANOM_SLOT, theme.resolved === 'dark') }"
          />
          เฉพาะเส้น &gt; {{ ANOM_KM }} กม.
          <span class="ml-auto font-mono text-xs opacity-60">{{ anomalyCount.toLocaleString() }}</span>
        </label>
      </div>

      <div class="mt-3 border-t border-base-300 pt-2">
        <p class="mb-1 text-xs font-semibold uppercase opacity-60">โหมด Re-design</p>
        <label class="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
          <input v-model="odn" type="checkbox" class="checkbox checkbox-xs">
          ระบายสี L1 ตามระยะถึง OLT
        </label>

        <template v-if="odn">
          <label
            v-for="b in [0, 1, 2]" :key="`band-${b}`"
            class="flex cursor-pointer items-center gap-2 py-0.5 pl-4 text-sm"
          >
            <input v-model="bands[b]" type="checkbox" class="checkbox checkbox-xs">
            <span
              class="rounded-full"
              :style="{
                background: categorical(BAND_SLOT[b], theme.resolved === 'dark'),
                width: `${BAND_RADIUS[b] * 2}px`,
                height: `${BAND_RADIUS[b] * 2}px`,
              }"
            />
            {{ BAND_LABEL_SHORT[b] }}
            <span class="ml-auto font-mono text-xs opacity-60">
              {{ (view?.odn.counts
                ? [view.odn.counts.ok, view.odn.counts.watch, view.odn.counts.redesign][b] ?? 0
                : 0).toLocaleString() }}
            </span>
          </label>

          <label class="flex cursor-pointer items-center gap-2 py-0.5 pl-4 text-sm">
            <input v-model="odnFocus" type="checkbox" class="checkbox checkbox-xs">
            โฟกัส: ซ่อน L2 · หรี่ชั้นอื่น
          </label>

          <p class="mt-1 text-xs leading-relaxed opacity-60">
            ตัวที่เกิน 3,500 ม. แสดงทุกระดับซูม ส่วนตัวที่ผ่านเกณฑ์รอซูมถึง
            {{ view?.minZoom.l1 ?? 11 }} ตามปกติ
            <template v-if="view?.odn.counts?.unknown">
              · วัดระยะไม่ได้ {{ view.odn.counts.unknown.toLocaleString() }} ตัว
              (OLT ต้นสังกัดไม่มีพิกัด)
            </template>
          </p>
          <p class="mt-1 rounded border border-warning/40 bg-warning/10 p-1.5 text-xs leading-relaxed">
            ⚠️ ระยะที่ใช้เป็น <b>เส้นตรง</b> ไม่ใช่ความยาวสายจริง — ไฟล์ต้นทางไม่มี
            ODN_length มาให้ ใช้จัดลำดับความสำคัญได้ แต่ยังไม่ใช่ ODN จริง
          </p>
        </template>
      </div>

      <div class="mt-3 border-t border-base-300 pt-2">
        <p class="mb-1 text-xs font-semibold uppercase opacity-60">พื้นหลัง</p>
        <select v-model="basemap" class="select select-bordered select-sm w-full">
          <option value="auto">ตามธีม (OpenStreetMap)</option>
          <option value="light">แผนที่ถนน</option>
          <option value="sat">ภาพถ่ายดาวเทียม (Esri)</option>
          <option value="none">ไม่มีพื้นหลัง</option>
        </select>
        <p class="mt-2 text-xs leading-relaxed opacity-60">
          ซูมปัจจุบัน <b>{{ zoom }}</b> · L1 แสดงตั้งแต่ <b>{{ view?.minZoom.l1 ?? 11 }}</b>
          · L2 ตั้งแต่ <b>{{ view?.minZoom.l2 ?? 13 }}</b><br>
          กดที่จุดเพื่อไล่สายโซ่ขึ้นไปถึงสถานี
        </p>
      </div>
    </div>

    <OltRadiusPanel
      v-if="radiusFor"
      :key="radiusFor"
      :code="radiusFor"
      @close="closeRadius"
      @circle="setCircle"
      @goto="gotoPoint"
    />

    <!-- แถบสรุปล่างซ้าย -->
    <div
      class="absolute bottom-3 left-3 z-[800] max-w-[min(32rem,calc(100%-1.5rem))] rounded-box
             border border-base-300 bg-base-100/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
    >
      <p v-if="loading" class="opacity-70">กำลังโหลด…</p>
      <p v-else-if="error" class="text-error">{{ error }}</p>
      <template v-else>
        <p>
          <span
            v-for="k in KINDS" :key="`s-${k}`"
            class="mr-3 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <span class="size-2 rounded-full" :style="{ background: color(k) }" />
            {{ LABEL[k] }} <b>{{ shownPoint[k].toLocaleString() }}</b>
            <span class="opacity-50">/ {{ totalOf(k).toLocaleString() }}</span>
          </span>
        </p>
        <p class="mt-0.5 opacity-70">
          เส้นเชื่อม <b>{{ edgeTotal.toLocaleString() }}</b>
          <template v-if="anomalyCount">
            · <span class="text-warning">ผิดปกติ {{ anomalyCount.toLocaleString() }}</span>
          </template>
          <template v-if="cappedAny"> · ชนเพดานแล้ว ซูมเข้าอีกเพื่อดูให้ครบ</template>
        </p>
        <p v-if="chain.length" class="mt-1 flex flex-wrap items-center gap-1">
          <template v-for="(s, i) in chain" :key="s.code">
            <span v-if="i" class="opacity-40">→</span>
            <span class="font-mono">{{ s.code }}</span>
          </template>
          <button
            v-if="selected?.kind === 'olt' && radiusFor !== selected.code"
            type="button" class="btn btn-primary btn-xs"
            @click="radiusFor = selected.code"
          >
            วิเคราะห์รัศมี
          </button>
          <button type="button" class="btn btn-ghost btn-xs" @click="clearChain">ล้าง</button>
        </p>
      </template>
    </div>
  </div>
</template>

<style>
/*
  SiteMap.vue ตั้งกฎกลับสีของ tile ในธีมมืดไว้แบบทั้งแอป ซึ่งถูกสำหรับแผนที่ถนน
  แต่ภาพถ่ายดาวเทียมโดนกลับสีแล้วดูไม่ออกว่าเป็นอะไร — คลาสนี้ยกเลิกเฉพาะแผนที่นี้
  ต้องระบุให้เจาะจงกว่าเดิม (เพิ่ม .map-plain) ไม่งั้นกฎเดิมชนะ
*/
:root[data-theme='dark'] .map-plain .leaflet-tile-pane {
  filter: none;
}
</style>

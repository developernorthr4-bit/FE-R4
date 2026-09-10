<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { errorMessage } from '../lib/api'
import { categorical, UNKNOWN_COLOR } from '../lib/palette'
import { createRuler, formatArea, formatM, type Ruler, type RulerState } from '../lib/ruler'
import { glyphPoints, shapeMarker, type MarkerShape } from '../lib/shape-marker'
import RadiusPanel from './RadiusPanel.vue'
import { getCableAt, getCables, type CableHit, type CableView } from '../services/cables.api'
import {
  CHILD_OF, getChain, getMapView, searchOnline,
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
const RADIUS: Record<MapKind, number> = { site: 6, olt: 5, l1: 4, l2: 2.5 }
const LABEL: Record<MapKind, string> = { site: 'สถานี', olt: 'OLT', l1: 'L1', l2: 'L2' }

/*
 * รูปทรงของแต่ละชั้น — ช่องทางที่สองนอกจากสี
 *
 * สี่ชั้นที่เป็นวงกลมเหมือนกันหมดต่างแค่สีกับขนาด พอจุดหนาแน่นเข้าก็แยกไม่ออก
 * และคนที่แยกสีได้ไม่ดีอ่านไม่ได้เลย · สามเหลี่ยมยอดแหลม = เสาสถานี
 * สี่เหลี่ยม = ตู้ OLT ส่วน L1/L2 เป็นข้าวหลามตัดกับจุดกลมตามลำดับความสำคัญ
 */
const SHAPE: Record<MapKind, MarkerShape> = {
  site: 'triangle', olt: 'square', l1: 'diamond', l2: 'circle',
}

/** เส้นที่ยาวเกินนี้ = ข้อมูลผิด ไม่ใช่สายที่ยาวจริง (ของจริงไกลสุด 69.7 กม.) */
const ANOM_KM = 30
const ANOM_SLOT = 2

/*
 * สีของเคเบิลตามจำนวนคอร์ — ในไฟล์มีคอร์ 16 ค่า แต่กฎใน lib/palette.ts ห้ามเกิน
 * 8 หมวด (เกินนั้นแยกสีไม่ออกภายใต้ภาวะตาบอดสี) จึงจ่ายสีให้ 6 ค่าที่พบบ่อยจริง
 * ซึ่งครอบคลุม 68,479 จาก 73,248 เส้น ที่เหลือยุบเป็น "อื่น ๆ" สีเทา
 */
const CORE_SLOT: Record<number, number> = { 6: 1, 12: 3, 24: 4, 48: 7, 60: 5, 96: 2 }
const CORE_ORDER = [24, 6, 12, 48, 60, 96]
/** สีเดียวจาง ๆ ตอนเปิดโหมดไม่แยกคอร์ — เคเบิลเป็นฉากหลัง ไม่ใช่พระเอก */
const CABLE_MONO = '#5b7086'

const NORTH_BOUNDS = L.latLngBounds([15.0, 97.3], [20.5, 101.8])

const BASEMAP = {
  auto: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  light: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  sat: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  none: '',
} as const
type Basemap = keyof typeof BASEMAP

const el = ref<HTMLElement | null>(null)
const wrap = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
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

/* ---------- เคเบิลใยแก้ว ---------- */
const cablesOn = ref(false)
const cableMono = ref(false)
const cableHidden = ref<number[]>([])
const cables = ref<CableView | null>(null)
const cableHit = ref<CableHit | null>(null)
const gCable = shallowRef<L.LayerGroup | null>(null)

/* ---------- ไม้บรรทัด ---------- */
const ruler = shallowRef<Ruler | null>(null)
const rulerOn = ref(false)
const rulerArea = ref(false)
const rulerSnap = ref(true)
const rul = ref<RulerState | null>(null)

/** จุดที่กดล่าสุด — แผงรัศมีเปิดตามตัวนี้เอง ไม่ต้องกดปุ่มเพิ่ม */
const selected = ref<{ kind: MapKind; code: string } | null>(null)
/** เวลาที่กดโดนหมุดล่าสุด ใช้กันไม่ให้คลิกเดียวถูกนับสองงาน */
let lastMarkerClick = 0
const gRad = shallowRef<L.LayerGroup | null>(null)

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
  timer = setTimeout(() => { void load(); void loadCables() }, 250)
}

/**
 * เคเบิลโหลดแยกจากโหนด ไม่ได้รวมใน /online/map
 *
 * เพราะมันเปิด/ปิดได้ และหนักกว่าโหนดหลายเท่า (ที่ซูม 13 กรอบเมืองเชียงใหม่
 * มี 4,185 เส้น 20,576 จุดหลังลดความละเอียดแล้ว) ถ้ารวมเป็น request เดียว
 * คนที่ไม่ได้เปิดชั้นนี้ก็ต้องรอมันทุกครั้งที่แพน
 */
async function loadCables() {
  const m = map.value
  if (!m) return
  if (!cablesOn.value) {
    cables.value = null
    gCable.value?.clearLayers()
    return
  }
  const b = m.getBounds().pad(0.1)
  try {
    cables.value = await getCables({
      bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()],
      zoom: m.getZoom(),
    })
    drawCables()
  } catch (err) {
    error.value = errorMessage(err, 'โหลดเคเบิลไม่สำเร็จ')
  }
}

function cableColor(core: number, dark: boolean): string {
  if (cableMono.value) return CABLE_MONO
  const slot = CORE_SLOT[core]
  return slot ? categorical(slot, dark) : (dark ? UNKNOWN_COLOR.dark : UNKNOWN_COLOR.light)
}

/**
 * วาดเป็น polyline เดียวต่อกลุ่มคอร์ ไม่ใช่ object ต่อเส้น
 * 4,185 เส้นถ้าแยกเป็น object ละเส้นคือเบราว์เซอร์หนืดทันทีที่แพน
 * แลกกับการที่กดเส้นตรง ๆ ไม่ได้ — จึงถาม BE ว่ากดโดนเส้นไหนแทน (cables/at)
 */
function drawCables() {
  const g = gCable.value
  const data = cables.value
  if (!g) return
  g.clearLayers()
  if (!data) return

  const dark = theme.resolved === 'dark'
  for (const grp of data.groups) {
    if (cableHidden.value.includes(grp.core)) continue
    const lines = grp.lines.map((flat) => {
      const out: [number, number][] = []
      for (let i = 0; i < flat.length; i += 2) out.push([flat[i]!, flat[i + 1]!])
      return out
    })
    L.polyline(lines, {
      color: cableColor(grp.core, dark),
      weight: cableMono.value ? 1 : 1.4,
      opacity: cableMono.value ? 0.35 : 0.6,
      renderer: renderer.value ?? undefined,
      interactive: false,
    }).addTo(g)
  }
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

  for (const k of EDGE_KINDS) {
    const lay = v[k]
    const normal: L.LatLngExpression[][] = []

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

      if (far) anomAll.push([[py, px], [y, x]])
      else normal.push([[py, px], [y, x]])
      shownEdge.value[k] += 1
    }

    if (normal.length) {
      L.polyline(normal, {
        color: color(k),
        weight: k === 'olt' ? 1.6 : k === 'l1' ? 1.1 : 0.8,
        opacity: k === 'olt' ? 0.55 : k === 'l1' ? 0.45 : 0.32,
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
    const lay = v[k]
    const fill = color(k)

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

      const mk = shapeMarker([y, x], {
        shape: SHAPE[k],
        radius: RADIUS[k],
        color: dark ? '#0b1017' : '#ffffff',
        weight: 1,
        fillColor: fill,
        fillOpacity: 0.95,
        renderer: rend,
      })
      mk.bindTooltip(`${code} · ${LABEL[k]}`, { direction: 'top', offset: [0, -4] })
      mk.on('click', () => { lastMarkerClick = Date.now(); void select(k, code) })
      mk.addTo(points)
      shownPoint.value[k] += 1
    }
  }
}

/* ---------- ไฮไลต์สายโซ่ ---------- */

/**
 * กดจุดบนแผนที่ = ไฮไลต์สายโซ่ + เปิดแผง "รอบตัวนี้มีอะไรบ้าง" พร้อมกัน
 * L2 เป็นชั้นล่างสุดจึงไม่มีรัศมีให้ดู กดแล้วได้แค่สายโซ่
 */
async function select(kind: MapKind, code: string) {
  if (rulerOn.value) return // กำลังวัดระยะอยู่ คลิกเป็นของไม้บรรทัด
  selected.value = CHILD_OF[kind] ? { kind, code } : null
  if (!selected.value) gRad.value?.clearLayers()
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

  /*
   * 🪤 ทุกเส้นทุกหมุดต้องส่ง renderer ตัวเดียวกับที่ draw() ใช้
   *
   * ถ้าไม่ส่ง Leaflet จะสร้าง canvas ใบใหม่ให้ แล้ววางทับใบเดิม — ใบบนสุดเป็นตัว
   * รับคลิกทั้งหมด พอไม่มีหมุดของมันตรงจุดที่กด มันก็กลืนคลิกทิ้งไปเฉย ๆ ไม่ส่งต่อ
   * ลงไปใบล่าง ผลคือพอไฮไลต์สายโซ่ครั้งแรกแล้ว "กดหมุดอะไรไม่ได้อีกเลย"
   */
  const rend = renderer.value ?? undefined

  if (pts.length > 1) {
    L.polyline(pts, {
      color: edge, weight: 4, opacity: 0.85, interactive: false, renderer: rend,
    }).addTo(g)
  }
  chain.value.forEach((s, i) => {
    const p = pts[i]
    if (!p) return
    shapeMarker(p, {
      shape: SHAPE[s.kind],
      radius: RADIUS[s.kind] + 4,
      color: edge,
      weight: 3,
      fillColor: color(s.kind),
      fillOpacity: 1,
      interactive: false,
      renderer: rend,
    }).addTo(g)
  })
}

function clearChain() {
  chain.value = []
  closeRadius()
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
    renderer: renderer.value ?? undefined,
  }).addTo(g)
  m.fitBounds(L.latLng(c.lat, c.lng).toBounds(c.km * 2200))
}

/* ---------- ไม้บรรทัด ---------- */

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

/**
 * เต็มจอจริง ๆ ของเบราว์เซอร์ ไม่ใช่แค่ซ่อนแถบเมนู
 * ต้องสั่ง invalidateSize หลังเปลี่ยนขนาด ไม่งั้น Leaflet ยังคิดว่ากล่องเท่าเดิม
 */
async function toggleFullscreen() {
  const box = wrap.value
  if (!box) return
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await box.requestFullscreen()
  } catch {
    // บางเบราว์เซอร์/บางบริบทไม่ยอมให้เข้าเต็มจอ — ไม่ใช่เรื่องคอขาดบาดตาย
  }
}

function onFullscreenChange() {
  isFullscreen.value = document.fullscreenElement !== null
  setTimeout(() => map.value?.invalidateSize(), 60)
}

function gotoPoint(p: { lat: number; lng: number }) {
  const m = map.value
  if (m) m.setView([p.lat, p.lng], Math.max(m.getZoom(), 16))
}

function closeRadius() {
  selected.value = null
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
  if (selected.value) out.push({ key: 'radius', label: `รัศมีรอบ ${selected.value.code}` })
  if (cablesOn.value) out.push({ key: 'cables', label: 'เคเบิล' })
  if (rulerOn.value) out.push({ key: 'ruler', label: 'ไม้บรรทัด' })
  for (const k of KINDS) if (!showPoint.value[k]) out.push({ key: `p:${k}`, label: `ซ่อนจุด ${LABEL[k]}` })
  for (const k of EDGE_KINDS) if (!showEdge.value[k]) out.push({ key: `e:${k}`, label: `ซ่อนเส้น ${LABEL[k]}` })
  if (chain.value.length) out.push({ key: 'chain', label: 'ไฮไลต์อยู่' })
  return out
})

function clearChip(key: string) {
  if (key === 'province') province.value = ''
  else if (key === 'anom') anomalyOnly.value = false
  else if (key === 'radius') closeRadius()
  else if (key === 'cables') cablesOn.value = false
  else if (key === 'ruler') stopRuler()
  else if (key === 'chain') clearChain()
  else if (key.startsWith('p:')) showPoint.value[key.slice(2) as MapKind] = true
  else if (key.startsWith('e:')) showEdge.value[key.slice(2) as EdgeKind] = true
}

function resetAll() {
  province.value = ''
  anomalyOnly.value = false
  cableHit.value = null
  stopRuler()
  showPoint.value = { site: true, olt: true, l1: true, l2: true }
  showEdge.value = { olt: true, l1: true, l2: true }
  clearChain()
  map.value?.fitBounds(NORTH_BOUNDS)
}

/* ---------- วงจรชีวิต ---------- */

onMounted(async () => {
  if (!el.value) return

  /* zoomControl: false แล้วไปวางเองมุมล่างขวา — ตำแหน่งเริ่มต้นของ Leaflet คือ
     มุมบนซ้าย ซึ่งเป็นที่เดียวกับแผงควบคุม กดไม่ได้เลยเพราะแผงทับอยู่ */
  /* zoomAnimationThreshold: 2 — กระโดดเกินสองระดับให้ข้ามแอนิเมชันไปเลย
     ค่าเริ่มต้นของ Leaflet คือ 4 ซึ่งครอบคลุมช่วงที่แอนิเมชันค้างพอดี */
  const m = L.map(el.value, {
    preferCanvas: true, minZoom: 5, maxZoom: 19, zoomControl: false, zoomAnimationThreshold: 2,
  })
  L.control.zoom({ position: 'bottomright' }).addTo(m)
  m.fitBounds(NORTH_BOUNDS)

  renderer.value = L.canvas({ padding: 0.3 })
  // เคเบิลอยู่ล่างสุด เป็นฉากหลังของโครงข่าย ไม่ใช่ตัวเอก
  gCable.value = L.layerGroup().addTo(m)
  gLine.value = L.layerGroup().addTo(m)
  gPoint.value = L.layerGroup().addTo(m)
  gRad.value = L.layerGroup().addTo(m)
  gHi.value = L.layerGroup().addTo(m)

  map.value = m
  applyBasemap()

  ruler.value = createRuler(m, {
    onChange: (st) => { rul.value = st },
    snap: snapTo,
    renderer: renderer.value ?? undefined,
  })

  /*
   * คลิกบนแผนที่มีสองความหมาย ขึ้นกับว่ากำลังวัดระยะอยู่ไหม
   * ถ้าไม่ได้วัด และเปิดชั้นเคเบิลอยู่ ให้ถามว่ากดโดนเส้นไหน — ระยะที่ยอมรับ
   * ผูกกับระดับซูม เพราะที่ซูมออก 20 พิกเซลคือหลายร้อยเมตรบนพื้นจริง
   */
  m.on('click', (e) => {
    if (rulerOn.value) { ruler.value?.addPoint(e.latlng); return }
    // คลิกที่โดนหมุดจะเด้งมาถึงแผนที่ด้วย — ถ้าไม่กันไว้จะไปถามหาเคเบิลทับกัน
    if (Date.now() - lastMarkerClick < 300) return
    if (!cablesOn.value) return
    const tol = Math.max(8, 40_000 / 2 ** m.getZoom() * 20)
    void getCableAt(e.latlng.lat, e.latlng.lng, tol)
      .then((hit) => { cableHit.value = hit })
      .catch(() => { cableHit.value = null })
  })

  m.on('dblclick', () => { if (rulerOn.value) ruler.value?.finish() })
  m.on('contextmenu', (e) => {
    if (!rulerOn.value) return
    L.DomEvent.preventDefault(e.originalEvent)
    ruler.value?.undo()
  })
  window.addEventListener('keydown', onKey)
  document.addEventListener('fullscreenchange', onFullscreenChange)

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
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  ruler.value?.destroy()
  map.value?.remove()
  map.value = null
})

watch(() => theme.resolved, () => {
  applyBasemap()
  draw()
  drawChain()
  drawCables()
})

watch(cablesOn, () => void loadCables())
watch([cableMono, cableHidden], drawCables, { deep: true })
watch(rulerArea, (v) => ruler.value?.setArea(v))

watch([showPoint, showEdge, anomalyOnly], draw, { deep: true })
watch(province, () => { totals.value = null; void load(true) })
watch(basemap, applyBasemap)

/** true = พื้นหลังนี้ต้องไม่โดนฟิลเตอร์กลับสีของธีมมืด */
const plainTiles = computed(() => basemap.value === 'light' || basemap.value === 'sat')

/** คอร์ที่มีจริงในกรอบนี้ เรียงตามที่พบบ่อย แล้วต่อท้ายด้วยตัวที่เหลือ */
const visibleCores = computed(() => {
  const here = new Set((cables.value?.groups ?? []).map((g) => g.core))
  const ordered = CORE_ORDER.filter((c) => here.has(c))
  const rest = [...here].filter((c) => !CORE_ORDER.includes(c)).sort((a, b) => a - b)
  return [...ordered, ...rest]
})

function toggleCore(core: number) {
  const i = cableHidden.value.indexOf(core)
  if (i >= 0) cableHidden.value = cableHidden.value.filter((c) => c !== core)
  else cableHidden.value = [...cableHidden.value, core]
}

/** ระดับซูมที่ BE เริ่มส่งเคเบิลมาให้ — ถามจากคำตอบล่าสุด ไม่ได้ตั้งค่าซ้ำฝั่งนี้ */
const cableMinZoom = computed(() => cables.value?.minZoom ?? 11)
/** ต้องซูมเข้าอีกกี่ระดับถึงจะเห็นเคเบิล · 0 = เห็นได้แล้ว */
const cableZoomShort = computed(() => Math.max(0, cableMinZoom.value - zoom.value))

/*
 * 🪤 animate: false จำเป็น ไม่ใช่แค่เรื่องความสวย
 *
 * การกระโดดซูมหลายระดับทีเดียว (7 → 11) ทำให้แอนิเมชันของ Leaflet ค้างกลางทาง
 * แล้ว zoomend ไม่ยิง — ผลคือ scheduleLoad ไม่ทำงาน ตัวเลขบนแผงค้างที่ค่าเดิม
 * และ canvas ยังเป็นภาพของซูมเก่าที่ถูกยืดจนเบลอ เจอตอนทดสอบบนเบราว์เซอร์จริง
 */
function zoomToCables() {
  map.value?.setZoom(cableMinZoom.value, { animate: false })
}

const totalOf = (k: MapKind) => totals.value?.[k] ?? 0
const edgeTotal = computed(() => shownEdge.value.olt + shownEdge.value.l1 + shownEdge.value.l2)
const cappedAny = computed(() => {
  const c = view.value?.capped
  return !!c && (c.site || c.l1 || c.l2)
})
</script>

<template>
  <div ref="wrap" class="relative h-full w-full overflow-hidden" :class="{ 'map-plain': plainTiles }">
    <!--
      🪤 ห้ามผูก :class ใด ๆ กับ div ที่ Leaflet ยึดไปเป็น container ของแผนที่

      Leaflet เติมคลาสของตัวเองเข้าไปตอน L.map() (leaflet-container, leaflet-grab, …)
      แต่พอค่าใน :class เปลี่ยน Vue จะเขียนแอตทริบิวต์ class ใหม่ทั้งก้อนจากสิ่งที่
      "ตัวมันรู้จัก" — คลาสของ Leaflet หายเกลี้ยง แล้วกฎ .leaflet-container ทั้งชุด
      หยุดทำงาน รวมถึง img{max-width:none !important} ทำให้ tile ถูก max-width ของ
      Tailwind บีบเหลือกว้าง 0 แผนที่กลายเป็นจอดำทั้งที่ tile โหลดสำเร็จหมดแล้ว
      คลาสที่ต้องสลับจึงไปอยู่ที่กล่องหุ้มข้างนอกแทน
    -->
    <div ref="el" class="h-full w-full" />

    <!-- แผงควบคุม ลอยทับแผนที่แบบเดียวกับไฟล์ต้นแบบ เพื่อไม่กินพื้นที่แผนที่ -->
    <div
      class="pointer-events-auto absolute left-3 top-3 z-[800] max-h-[calc(100%-7.5rem)] w-72
             overflow-auto rounded-box border border-base-300 bg-base-100/95 p-3 shadow-lg backdrop-blur"
    >
      <div class="mb-2 flex items-start gap-2">
        <div class="min-w-0">
          <p class="text-sm font-semibold">โครงข่ายงาน online</p>
          <p class="text-xs opacity-60">สถานี → OLT → L1 → L2</p>
        </div>
        <button
          type="button" class="btn btn-ghost btn-xs ml-auto"
          :title="isFullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ'"
          @click="toggleFullscreen"
        >
          {{ isFullscreen ? '⤡ ย่อ' : '⤢ เต็มจอ' }}
        </button>
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
              <svg class="size-3 shrink-0" viewBox="-10 -10 20 20" aria-hidden="true">
                <polygon v-if="glyphPoints(SHAPE[h.kind])" :points="glyphPoints(SHAPE[h.kind])" :fill="color(h.kind)" />
                <circle v-else r="7" :fill="color(h.kind)" />
              </svg>
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
          <svg class="size-3.5 shrink-0" viewBox="-10 -10 20 20" aria-hidden="true">
            <polygon v-if="glyphPoints(SHAPE[k])" :points="glyphPoints(SHAPE[k])" :fill="color(k)" />
            <circle v-else r="7" :fill="color(k)" />
          </svg>
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
        <p class="mb-1 text-xs font-semibold uppercase opacity-60">เคเบิลใยแก้ว</p>
        <label class="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
          <input v-model="cablesOn" type="checkbox" class="checkbox checkbox-xs">
          แสดงเส้นเคเบิล
          <span class="ml-auto font-mono text-xs opacity-60">
            {{ (cables?.total ?? 0).toLocaleString() }}
          </span>
        </label>

        <template v-if="cablesOn">
          <label class="flex cursor-pointer items-center gap-2 py-0.5 pl-4 text-sm">
            <input v-model="cableMono" type="checkbox" class="checkbox checkbox-xs">
            สีเดียวจาง ๆ (ไม่แยกคอร์)
          </label>

          <div v-if="!cableMono" class="pl-4">
            <label
              v-for="core in visibleCores" :key="`core-${core}`"
              class="flex cursor-pointer items-center gap-2 py-0.5 text-sm"
            >
              <input
                type="checkbox" class="checkbox checkbox-xs"
                :checked="!cableHidden.includes(core)"
                @change="toggleCore(core)"
              >
              <span class="h-0.5 w-4 rounded" :style="{ background: cableColor(core, theme.resolved === 'dark') }" />
              {{ core ? `${core} คอร์` : 'ไม่ระบุคอร์' }}
            </label>
          </div>

          <!--
            ต้องเตือนแบบเห็นชัด ไม่ใช่ข้อความเทาเล็ก ๆ — เคสที่เจอจริงคือติ๊กเปิด
            ตอนซูมยังไม่ถึงแล้วไม่มีอะไรขึ้น เข้าใจว่าพัง ทั้งที่แค่ยังไม่ถึงระดับซูม
          -->
          <div
            v-if="cableZoomShort > 0"
            class="mt-1 rounded-lg border border-warning/50 bg-warning/15 p-2 text-xs leading-relaxed"
          >
            <p>ยังไม่แสดงเพราะซูมไม่ถึง — ต้องซูม {{ cableMinZoom }} ขึ้นไป (ตอนนี้ {{ zoom }})</p>
            <button type="button" class="btn btn-warning btn-xs mt-1" @click="zoomToCables">
              ซูมเข้าอีก {{ cableZoomShort }} ระดับ
            </button>
          </div>

          <p v-else class="mt-1 text-xs leading-relaxed opacity-60">
            <template v-if="cables?.step && cables.step > 1">
              ลดความละเอียดเหลือทุกจุดที่ {{ cables.step }} ที่ซูมนี้ ·
            </template>
            <template v-if="cables?.capped">ชนเพดาน 6,000 เส้น ซูมเข้าอีก · </template>
            กดบนแผนที่เพื่อดูว่าเส้นไหน
          </p>
        </template>
      </div>

      <div class="mt-3 border-t border-base-300 pt-2">
        <p class="mb-1 text-xs font-semibold uppercase opacity-60">ไม้บรรทัดวัดระยะ</p>
        <button
          type="button" class="btn btn-sm w-full"
          :class="{ 'btn-warning': rulerOn }"
          @click="rulerOn ? stopRuler() : startRuler()"
        >
          {{ rulerOn ? 'หยุดวัด' : 'เริ่มวัดระยะ (M)' }}
        </button>

        <template v-if="rulerOn">
          <label class="mt-1 flex cursor-pointer items-center gap-2 text-sm">
            <input v-model="rulerSnap" type="checkbox" class="checkbox checkbox-xs">
            ดึงเข้าจุดที่ใกล้ที่สุด
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-sm">
            <input v-model="rulerArea" type="checkbox" class="checkbox checkbox-xs">
            โหมดพื้นที่ (ปิดรูป)
          </label>
          <p class="mt-1 text-xs leading-relaxed opacity-60">
            คลิกวางจุดทีละจุด · <b>ดับเบิลคลิก</b> หรือ <b>Enter</b> = จบ<br>
            <b>คลิกขวา</b> หรือ <b>Backspace</b> = ถอยจุด · <b>Esc</b> = ยกเลิก
          </p>
          <div v-if="rul && rul.points.length" class="mt-2 rounded-lg bg-base-200 p-2 text-xs">
            <p>จุด {{ rul.points.length }} · รวม <b>{{ formatM(rul.totalM) }}</b></p>
            <p v-if="rul.areaM2 !== null">พื้นที่ <b>{{ formatArea(rul.areaM2) }}</b></p>
          </div>
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
          กดที่จุดเพื่อไล่สายโซ่ขึ้นไปถึงสถานี และดูว่ารอบตัวนั้นมีอะไรอยู่บ้าง
        </p>
      </div>
    </div>

    <RadiusPanel
      v-if="selected"
      :key="`${selected.kind}-${selected.code}`"
      :kind="selected.kind"
      :code="selected.code"
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
            <svg class="size-3 shrink-0" viewBox="-10 -10 20 20" aria-hidden="true">
              <polygon v-if="glyphPoints(SHAPE[k])" :points="glyphPoints(SHAPE[k])" :fill="color(k)" />
              <circle v-else r="7" :fill="color(k)" />
            </svg>
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
        <p v-if="cablesOn && cableZoomShort > 0" class="mt-0.5 text-warning">
          เปิดชั้นเคเบิลไว้แต่ยังไม่แสดง — ซูมเข้าอีก {{ cableZoomShort }} ระดับ
        </p>

        <p v-if="cableHit" class="mt-1 flex flex-wrap items-center gap-2">
          <span class="font-mono">{{ cableHit.code }}</span>
          <span class="opacity-70">
            {{ cableHit.core ? `${cableHit.core} คอร์` : 'ไม่ระบุคอร์' }} ·
            ยาว {{ formatM(cableHit.lengthM) }} · {{ cableHit.vertices }} จุด
          </span>
          <button type="button" class="btn btn-ghost btn-xs" @click="cableHit = null">ล้าง</button>
        </p>

        <p v-if="chain.length" class="mt-1 flex flex-wrap items-center gap-1">
          <template v-for="(s, i) in chain" :key="s.code">
            <span v-if="i" class="opacity-40">→</span>
            <span class="font-mono">{{ s.code }}</span>
          </template>
          <button type="button" class="btn btn-ghost btn-xs" @click="clearChain">ล้าง</button>
        </p>
      </template>
    </div>
  </div>
</template>

<style>
/* ป้ายระยะของไม้บรรทัด — เป็น divIcon จึงอยู่นอกขอบเขต scoped style */
.ruler-label {
  display: inline-block;
  white-space: nowrap;
  transform: translate(10px, -10px);
  padding: 1px 5px;
  border-radius: 5px;
  border: 1px solid #a16207;
  background: rgba(15, 21, 32, 0.92);
  color: #fde68a;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.ruler-label.ruler-total {
  background: #3b2a10;
  color: #fbbf24;
  font-weight: 600;
  font-size: 11px;
  border-color: #ca8a04;
}

.cursor-crosshair {
  cursor: crosshair;
}

/*
  SiteMap.vue ตั้งกฎกลับสีของ tile ในธีมมืดไว้แบบทั้งแอป ซึ่งถูกสำหรับแผนที่ถนน
  แต่ภาพถ่ายดาวเทียมโดนกลับสีแล้วดูไม่ออกว่าเป็นอะไร — คลาสนี้ยกเลิกเฉพาะแผนที่นี้
  ต้องระบุให้เจาะจงกว่าเดิม (เพิ่ม .map-plain) ไม่งั้นกฎเดิมชนะ
*/
:root[data-theme='dark'] .map-plain .leaflet-tile-pane {
  filter: none;
}
</style>

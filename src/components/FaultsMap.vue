<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { errorMessage } from '../lib/api'
import {
  claimFaults, getFaultGrid, getFaultMapPoints, haversineM, loadFaultLookups, pointState, releaseClaim, RESULT_COLOR, STATE_LABEL,
  type ClaimResult, type FaultFilters, type FaultGridCell, type FaultLookups, type FaultMapPoint, type PointState,
} from '../services/faults.api'
import { loadProvinces, type Province } from '../services/provinces.api'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'

/**
 * แผนที่จุดซ่อม CM ทั้งภาค — เห็นจำนวน จอง และลงข้อมูล
 *
 * ซูม ≤11: BE รวมเป็นช่องตาราง → ก้อนตัวเลข (ตัวใหญ่ = ยังไม่ตรวจ) กดแล้วซูมเข้า
 * ซูม ≥12: จุดเดี่ยว สีตามสถานะ (ยังไม่จอง / ฉันจอง / คนอื่นจอง / pass / not pass)
 * โหมดเลือกหลายจุด → จองทั้งชุดวันเดียว = วางแผนทริปทีเดียวจบ
 *
 * embed = เปิดใน WebView ของแอป (ไม่มี AppLayout แผงพับได้)
 */
const props = defineProps<{ embed?: boolean }>()

const POINT_ZOOM = 12
const NORTH_BOUNDS = L.latLngBounds([15.0, 97.3], [20.5, 101.8])
const BASEMAP = {
  auto: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  sat: 'https://server.arcgisonline.com/ArcGis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
} as const
const LIST_MAX = 200
const SELECT_MAX = 100

const auth = useAuthStore()
const theme = useThemeStore()
const me = computed(() => auth.user?.id ?? null)
const canClaim = computed(() => auth.can('editor'))

const el = ref<HTMLElement | null>(null)
const map = shallowRef<L.Map | null>(null)
const tiles = shallowRef<L.TileLayer | null>(null)
const renderer = shallowRef<L.Canvas | null>(null)
const gPoints = shallowRef<L.LayerGroup | null>(null)
const gCells = shallowRef<L.LayerGroup | null>(null)
const gMe = shallowRef<L.LayerGroup | null>(null)

const panelOpen = ref(!props.embed)
const basemap = ref<keyof typeof BASEMAP>('auto')
const lookups = ref<FaultLookups | null>(null)
const provinces = ref<Province[]>([])
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const loading = ref(false)

/** ค่าเริ่มต้น "ยังไม่ตรวจ" — นั่นคือสิ่งที่ต้องไปดู */
const filters = reactive<FaultFilters>({ audit: 'none', claim: '', province: '', cause: '', from: '', to: '' })

const zoom = ref(8)
const points = ref<FaultMapPoint[]>([])
const cells = ref<FaultGridCell[]>([])
const capped = ref(false)
const isPointZoom = computed(() => zoom.value >= POINT_ZOOM)

/* ---------- ตำแหน่งฉัน ---------- */
const myPos = ref<[number, number] | null>(null)
const gpsBusy = ref(false)
function locate(fly = false) {
  if (!('geolocation' in navigator)) { error.value = 'เบราว์เซอร์นี้ไม่มีตำแหน่ง'; return }
  gpsBusy.value = true
  navigator.geolocation.getCurrentPosition(
    (p) => {
      gpsBusy.value = false
      myPos.value = [p.coords.latitude, p.coords.longitude]
      drawMe()
      if (fly) map.value?.setView(myPos.value, Math.max(map.value.getZoom(), 13), { animate: false })
    },
    () => { gpsBusy.value = false; if (fly) error.value = 'อ่านตำแหน่ง GPS ไม่ได้' },
    { enableHighAccuracy: true, timeout: 10_000 },
  )
}
function drawMe() {
  const g = gMe.value
  if (!g) return
  g.clearLayers()
  if (!myPos.value) return
  L.circleMarker(myPos.value, { radius: 8, color: '#ffffff', weight: 2, fillColor: '#0ea5e9', fillOpacity: 1, renderer: renderer.value ?? undefined })
    .bindTooltip('ตำแหน่งฉัน', { direction: 'top', offset: [0, -8] }).addTo(g)
}
const distKm = (p: { lat: number; lng: number }) => (myPos.value ? haversineM(myPos.value, [p.lat, p.lng]) / 1000 : null)

/* ---------- โหลดตามกรอบจอ ---------- */
let loadTimer: ReturnType<typeof setTimeout> | undefined
let loadSeq = 0
function scheduleLoad(ms = 250) {
  clearTimeout(loadTimer)
  loadTimer = setTimeout(() => void load(), ms)
}

async function load() {
  const m = map.value
  if (!m) return
  const seq = ++loadSeq
  const b = m.getBounds().pad(0.2)
  const bbox: [number, number, number, number] = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
  const z = m.getZoom()
  zoom.value = z
  loading.value = true
  error.value = null
  try {
    if (z >= POINT_ZOOM) {
      const r = await getFaultMapPoints(bbox, filters)
      if (seq !== loadSeq) return
      points.value = r.points
      capped.value = r.capped
      cells.value = []
    } else {
      const r = await getFaultGrid(bbox, z, filters)
      if (seq !== loadSeq) return
      cells.value = r.cells
      points.value = []
      capped.value = false
    }
    draw()
  } catch (err) {
    if (seq === loadSeq) error.value = errorMessage(err, 'โหลดจุดซ่อมไม่สำเร็จ')
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}
watch(filters, () => scheduleLoad(0), { deep: true })

/* ---------- วาด ---------- */
const esc = (v: string | null | undefined) => (v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] ?? ch))
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('th-TH', { dateStyle: 'medium' }) : '')

function draw() {
  drawCells()
  drawPoints()
}

/**
 * ก้อนตัวเลข — divIcon (HTML) เพราะต้องการตัวหนังสือกลางวง
 * ขนาดตามจำนวน · สีขอบตามสัดส่วน "ยังไม่ตรวจ" (ยิ่งแดงยิ่งเหลือเยอะ) · เลขใหญ่ = ยังไม่ตรวจ
 */
function drawCells() {
  const g = gCells.value
  if (!g) return
  g.clearLayers()
  if (isPointZoom.value) return
  for (const c of cells.value) {
    const big = filters.audit === 'none' || filters.audit === '' ? c.none : c.n
    const size = big >= 1000 ? 56 : big >= 200 ? 48 : big >= 50 ? 40 : 32
    const ratio = c.n ? c.none / c.n : 0
    const ring = ratio > 0.66 ? '#dc2626' : ratio > 0.33 ? '#f59e0b' : '#16a34a'
    const sub = filters.audit === 'none' || filters.audit === '' ? (c.claimed ? `<small>จอง ${c.claimed}</small>` : '') : `<small>${c.none} ค้าง</small>`
    const icon = L.divIcon({
      className: 'fault-cell',
      html: `<div style="width:${size}px;height:${size}px;border-color:${ring}"><b>${big.toLocaleString()}</b>${sub}</div>`,
      iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    })
    L.marker([c.lat, c.lng], { icon, keyboard: false })
      .bindTooltip(`ทั้งหมด ${c.n.toLocaleString()} · ยังไม่ตรวจ ${c.none.toLocaleString()} (จองแล้ว ${c.claimed}) · pass ${c.pass} · not pass ${c.notPass}`, { direction: 'top' })
      .on('click', () => {
        const m = map.value
        if (!m) return
        m.setView([c.lat, c.lng], Math.min(m.getZoom() + 2, 19), { animate: false })
      })
      .addTo(g)
  }
}

function drawPoints() {
  const g = gPoints.value
  if (!g) return
  g.clearLayers()
  if (!isPointZoom.value) return
  const rend = renderer.value ?? undefined
  for (const p of points.value) {
    const st = pointState(p, me.value)
    const sel = selected.has(p.id)
    L.circleMarker([p.lat, p.lng], {
      radius: sel ? 9 : 7, color: sel ? '#111827' : '#ffffff', weight: sel ? 3 : 1.5,
      fillColor: RESULT_COLOR[st], fillOpacity: 0.95, renderer: rend,
    })
      .on('click', () => onPointClick(p))
      .addTo(g)
  }
}

/* ---------- เลือกหลายจุด ---------- */
const selectMode = ref(false)
const selected = reactive(new Map<string, FaultMapPoint>())
const selectable = (p: FaultMapPoint) => !p.result && (!p.claimUserId || p.claimUserId === me.value)

function toggleSelect(p: FaultMapPoint) {
  if (selected.has(p.id)) selected.delete(p.id)
  else if (!selectable(p)) notice.value = p.result ? 'จุดนี้ตรวจแล้ว' : `${p.claimUserName} จองอยู่`
  else if (selected.size >= SELECT_MAX) notice.value = `เลือกได้ครั้งละไม่เกิน ${SELECT_MAX} จุด`
  else selected.set(p.id, p)
  drawPoints()
}
function selectAllInView() {
  for (const p of points.value) {
    if (selected.size >= SELECT_MAX) { notice.value = `เลือกได้ครั้งละไม่เกิน ${SELECT_MAX} จุด — เลือกครบแล้ว`; break }
    if (selectable(p)) selected.set(p.id, p)
  }
  drawPoints()
}
function clearSelection() { selected.clear(); drawPoints() }
watch(selectMode, (on) => { if (!on) clearSelection(); map.value?.closePopup() })

/* ---------- popup ของจุด ---------- */
function onPointClick(p: FaultMapPoint) {
  if (selectMode.value) { toggleSelect(p); return }
  const m = map.value
  if (!m) return
  const st = pointState(p, me.value)
  const box = document.createElement('div')
  box.className = 'text-xs leading-relaxed'
  box.innerHTML = `
    <b class="font-mono">${esc(p.cmNo)}</b> · ${esc(p.siteCode)} · ${fmtDate(p.completeAt)}<br>
    ${esc(p.cause)}${p.sub ? `<br><span class="opacity-80">${esc(p.sub)}</span>` : ''}<br>
    <span class="inline-block size-2.5 rounded-full align-middle" style="background:${RESULT_COLOR[st]}"></span>
    <b>${STATE_LABEL[st]}</b>${p.claimUserName ? ` — ${esc(p.claimUserName)} ไป ${esc(p.claimPlannedDate)}` : ''}${p.solutionName ? ` · ${esc(p.solutionName)}` : ''}${p.repairLengthM !== null ? ` · ${p.repairLengthM.toLocaleString()} ม.` : ''}
    ${myPos.value ? `<br><span class="opacity-60">ห่างจากฉัน ${distKm(p)!.toFixed(1)} กม.</span>` : ''}
  `
  const row = document.createElement('div')
  row.className = 'mt-2 flex flex-wrap gap-1'
  const btn = (label: string, cls: string, fn: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = `btn btn-xs ${cls}`
    b.textContent = label
    b.addEventListener('click', fn)
    row.appendChild(b)
  }
  if (canClaim.value && !p.result) {
    if (!p.claimUserId) btn('จองจุดนี้', 'btn-primary', () => { m.closePopup(); openClaim([p]) })
    else if (p.claimUserId === me.value) btn('ปล่อยจอง', 'btn-ghost text-error', () => { m.closePopup(); void release(p) })
  }
  const a = document.createElement('a')
  a.className = 'btn btn-xs'
  a.href = `/faults/${p.id}`
  a.textContent = p.result ? 'ดูผล' : 'ลงข้อมูล'
  row.appendChild(a)
  const gm = document.createElement('a')
  gm.className = 'btn btn-xs btn-ghost'
  gm.href = `https://www.google.com/maps?q=${p.lat},${p.lng}`
  gm.target = '_blank'
  gm.rel = 'noopener'
  gm.textContent = 'นำทาง'
  row.appendChild(gm)
  box.appendChild(row)
  L.popup({ maxWidth: 320 }).setLatLng([p.lat, p.lng]).setContent(box).openOn(m)
}

async function release(p: FaultMapPoint) {
  if (!p.claimId || !window.confirm(`ปล่อยจอง ${p.cmNo}?`)) return
  try {
    await releaseClaim(p.claimId)
    notice.value = `ปล่อยจอง ${p.cmNo} แล้ว`
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'ปล่อยจองไม่สำเร็จ')
  }
}

/* ---------- กล่องจอง ---------- */
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE') }
const claimBox = ref<{ items: FaultMapPoint[]; date: string; note: string } | null>(null)
const claiming = ref(false)
const claimResult = ref<ClaimResult | null>(null)

function openClaim(items: FaultMapPoint[]) {
  if (!items.length) return
  claimBox.value = { items, date: tomorrow(), note: '' }
  claimResult.value = null
}
async function submitClaim() {
  const c = claimBox.value
  if (!c || claiming.value) return
  claiming.value = true
  error.value = null
  try {
    const r = await claimFaults(c.items.map((i) => i.id), c.date, c.note)
    claimResult.value = r
    notice.value = `จองแล้ว ${r.claimed} จุด${r.moved ? ` · เลื่อนวัน ${r.moved}` : ''}${r.skipped.length ? ` · ข้าม ${r.skipped.length}` : ''} — ค้าง ${r.open}/${r.limit}`
    if (!r.skipped.length) { claimBox.value = null; clearSelection(); selectMode.value = false }
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'จองไม่สำเร็จ')
  } finally {
    claiming.value = false
  }
}
const skippedNames = computed(() => {
  const r = claimResult.value
  const c = claimBox.value
  if (!r || !c) return []
  return r.skipped.map((s) => `${c.items.find((i) => i.id === s.faultId)?.cmNo ?? s.faultId}: ${s.reason}`)
})

/* ---------- สรุป + รายการในกรอบจอ ---------- */
const summary = computed(() => {
  if (isPointZoom.value) {
    const s = { n: points.value.length, none: 0, mine: 0, others: 0, pass: 0, not_pass: 0, no_access: 0 }
    for (const p of points.value) s[pointState(p, me.value)]++
    return s
  }
  const s = { n: 0, none: 0, mine: 0, others: 0, pass: 0, not_pass: 0, no_access: 0 }
  for (const c of cells.value) { s.n += c.n; s.none += c.none - c.claimed; s.others += c.claimed; s.pass += c.pass; s.not_pass += c.notPass; s.no_access += c.noAccess }
  return s
})
const listed = computed(() => {
  const arr = points.value.map((p) => ({ p, st: pointState(p, me.value), km: distKm(p) }))
  if (myPos.value) arr.sort((a, b) => (a.km ?? 0) - (b.km ?? 0))
  return arr.slice(0, LIST_MAX)
})
function flyTo(p: FaultMapPoint) {
  map.value?.setView([p.lat, p.lng], Math.max(map.value.getZoom(), 15), { animate: false })
  setTimeout(() => onPointClick(p), 50)
}
const LEGEND: PointState[] = ['none', 'mine', 'others', 'pass', 'not_pass', 'no_access']

/* ---------- พื้นหลัง + วงจรชีวิต ---------- */
function applyBasemap() {
  const m = map.value
  if (!m) return
  if (tiles.value) { m.removeLayer(tiles.value); tiles.value = null }
  tiles.value = L.tileLayer(BASEMAP[basemap.value], { maxZoom: 19, attribution: basemap.value === 'sat' ? '&copy; Esri' : '&copy; OpenStreetMap' }).addTo(m)
  tiles.value.bringToBack()
}
watch(basemap, applyBasemap)

onMounted(async () => {
  if (!el.value) return
  const m = L.map(el.value, { preferCanvas: true, minZoom: 5, maxZoom: 19, zoomControl: false, zoomAnimationThreshold: 2 })
  L.control.zoom({ position: 'bottomright' }).addTo(m)
  m.fitBounds(NORTH_BOUNDS)
  // 🪤 canvas ตัวเดียวสำหรับทุกชั้น ไม่งั้นใบบนกลืนคลิกของใบล่าง
  renderer.value = L.canvas({ padding: 0.3 })
  gCells.value = L.layerGroup().addTo(m)
  gPoints.value = L.layerGroup().addTo(m)
  gMe.value = L.layerGroup().addTo(m)
  map.value = m
  applyBasemap()
  m.on('moveend zoomend', () => scheduleLoad())
  void load()
  locate(false)
  try {
    ;[lookups.value, provinces.value] = await Promise.all([loadFaultLookups(), loadProvinces()])
  } catch { /* ตัวกรองบางส่วนไม่มีก็ยังใช้แผนที่ได้ */ }
})
onBeforeUnmount(() => { clearTimeout(loadTimer); map.value?.remove(); map.value = null })
watch(() => theme.resolved, () => { if (basemap.value === 'auto') applyBasemap() })
</script>

<template>
  <div class="relative h-full w-full overflow-hidden" :class="{ 'map-plain': basemap === 'sat', 'cursor-crosshair': selectMode }">
    <!-- 🪤 ห้ามผูก :class กับ div นี้ — Leaflet ยึดไปเป็น container -->
    <div ref="el" class="h-full w-full" />

    <button v-if="!panelOpen" type="button" class="btn btn-sm absolute left-3 top-3 z-[800] shadow-lg" @click="panelOpen = true">☰ จุดซ่อม</button>

    <div
      v-show="panelOpen"
      class="pointer-events-auto absolute left-3 top-3 z-[800] flex max-h-[calc(100%-5rem)] w-80 max-w-[calc(100%-1.5rem)] flex-col
             rounded-box border border-base-300 bg-base-100/95 shadow-lg backdrop-blur"
    >
      <div class="flex items-start gap-2 p-3 pb-2">
        <div class="min-w-0">
          <p class="text-sm font-semibold">จุดซ่อม CM (Audit)</p>
          <p class="text-xs opacity-60">{{ isPointZoom ? 'กดจุดเพื่อจอง / ลงข้อมูล' : 'กดก้อนตัวเลขเพื่อซูมเข้า' }}</p>
        </div>
        <span v-if="loading" class="loading loading-spinner loading-xs mt-1 ml-auto" />
        <button type="button" class="btn btn-ghost btn-xs" :class="loading ? '' : 'ml-auto'" title="พับแผง" @click="panelOpen = false">✕</button>
      </div>

      <div class="overflow-auto px-3 pb-3">
        <div v-if="error" class="alert alert-error mb-2 py-1 text-xs"><span>{{ error }}</span></div>
        <div v-if="notice" class="alert alert-info mb-2 py-1 text-xs">
          <span>{{ notice }}</span>
          <button type="button" class="btn btn-ghost btn-xs" @click="notice = null">✕</button>
        </div>

        <!-- ตัวกรอง -->
        <div class="grid grid-cols-2 gap-1.5">
          <select v-model="filters.audit" class="select select-bordered select-xs">
            <option value="none">ยังไม่ตรวจ</option>
            <option value="">ทั้งหมด</option>
            <option value="any">ตรวจแล้ว</option>
            <option value="pass">Pass</option>
            <option value="not_pass">Not pass</option>
            <option value="no_access">เข้าไม่ถึง</option>
          </select>
          <select v-model="filters.claim" class="select select-bordered select-xs">
            <option value="">จอง: ทั้งหมด</option>
            <option value="none">ยังไม่มีคนจอง</option>
            <option value="mine">ฉันจอง</option>
            <option value="others">คนอื่นจอง</option>
          </select>
          <select v-model="filters.province" class="select select-bordered select-xs">
            <option value="">ทุกจังหวัด</option>
            <option v-for="p in provinces" :key="p.id" :value="p.id">{{ p.nameTh }}</option>
          </select>
          <select v-model="filters.cause" class="select select-bordered select-xs">
            <option value="">ทุกสาเหตุ</option>
            <option v-for="c in lookups?.causes" :key="c.key" :value="c.key">{{ c.key }}</option>
          </select>
          <input v-model="filters.from" type="date" class="input input-bordered input-xs" title="ปิดงานตั้งแต่">
          <input v-model="filters.to" type="date" class="input input-bordered input-xs" title="ถึง">
        </div>

        <!-- สรุปในกรอบจอ -->
        <div class="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          <span class="font-semibold">ในกรอบ {{ summary.n.toLocaleString() }}</span>
          <span v-for="k in LEGEND" :key="k" class="inline-flex items-center gap-1" :class="summary[k] ? '' : 'opacity-40'">
            <span class="size-2.5 rounded-full" :style="{ background: RESULT_COLOR[k] }" />{{ k === 'others' && !isPointZoom ? 'จองแล้ว' : STATE_LABEL[k] }} {{ summary[k].toLocaleString() }}
          </span>
        </div>
        <p v-if="capped" class="mt-1 text-xs text-warning">แสดงบางส่วน (3,000 จุด) — ซูมเข้าหรือกรองให้แคบลง</p>

        <!-- เครื่องมือ -->
        <div class="mt-2 flex flex-wrap gap-1">
          <button type="button" class="btn btn-xs" :disabled="gpsBusy" @click="locate(true)"><span v-if="gpsBusy" class="loading loading-spinner loading-xs" />📍 ตำแหน่งฉัน</button>
          <select v-model="basemap" class="select select-bordered select-xs">
            <option value="auto">แผนที่ถนน</option>
            <option value="sat">ดาวเทียม</option>
          </select>
          <template v-if="canClaim && isPointZoom">
            <button type="button" class="btn btn-xs" :class="selectMode ? 'btn-primary' : ''" @click="selectMode = !selectMode">
              {{ selectMode ? `เลือกอยู่ ${selected.size}` : 'เลือกหลายจุด' }}
            </button>
          </template>
        </div>
        <div v-if="selectMode" class="mt-1 flex flex-wrap gap-1">
          <button type="button" class="btn btn-xs btn-ghost" @click="selectAllInView">เลือกทั้งหมดในกรอบ</button>
          <button type="button" class="btn btn-xs btn-ghost" :disabled="!selected.size" @click="clearSelection">ล้าง</button>
          <button type="button" class="btn btn-xs btn-primary ml-auto" :disabled="!selected.size" @click="openClaim([...selected.values()])">จอง {{ selected.size }} จุด</button>
        </div>

        <!-- รายการในกรอบจอ -->
        <div v-if="isPointZoom && listed.length" class="mt-2 border-t border-base-300 pt-2">
          <p class="mb-1 text-xs opacity-60">
            {{ myPos ? 'เรียงจากใกล้ฉัน' : 'รายการในกรอบ' }}<template v-if="points.length > LIST_MAX"> · แสดง {{ LIST_MAX }} จาก {{ points.length }}</template>
          </p>
          <ul class="space-y-0.5">
            <li v-for="{ p, st, km } in listed" :key="p.id">
              <button type="button" class="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-base-200" :class="{ 'bg-base-200 font-semibold': selected.has(p.id) }" @click="selectMode ? toggleSelect(p) : flyTo(p)">
                <span class="size-2.5 shrink-0 rounded-full" :style="{ background: RESULT_COLOR[st] }" />
                <span class="truncate font-mono">{{ p.cmNo.replace('CM-', '') }}</span>
                <span class="truncate opacity-70">{{ p.siteCode }}</span>
                <span v-if="km !== null" class="ml-auto shrink-0 font-mono opacity-50">{{ km.toFixed(1) }} กม.</span>
              </button>
            </li>
          </ul>
        </div>
        <p v-else-if="isPointZoom && !loading" class="mt-2 text-xs opacity-60">ไม่มีจุดในกรอบนี้ตามตัวกรอง</p>
      </div>
    </div>

    <!-- กล่องจอง -->
    <div v-if="claimBox" class="modal modal-open z-[900]" @click.self="claimBox = null">
      <div class="modal-box">
        <h3 class="text-lg font-semibold">จอง {{ claimBox.items.length }} จุด</h3>
        <p class="mt-1 max-h-24 overflow-auto font-mono text-xs opacity-70">{{ claimBox.items.map((i) => i.cmNo).join(', ') }}</p>
        <div class="mt-3 grid gap-3">
          <label class="form-control">
            <span class="label-text text-xs opacity-70">วันที่จะไป *</span>
            <input v-model="claimBox.date" type="date" class="input input-sm input-bordered w-full">
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">โน้ต</span>
            <input v-model="claimBox.note" type="text" maxlength="500" class="input input-sm input-bordered w-full" placeholder="เช่น ทริปพิจิตรเหนือ ไปกับทีม B">
          </label>
        </div>
        <div v-if="skippedNames.length" role="alert" class="alert alert-warning mt-3 text-xs">
          <div><b>ข้าม {{ skippedNames.length }} จุด</b><ul class="mt-1 list-disc pl-4"><li v-for="s in skippedNames" :key="s">{{ s }}</li></ul></div>
        </div>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" :disabled="claiming" @click="claimBox = null">{{ claimResult ? 'ปิด' : 'ยกเลิก' }}</button>
          <button v-if="!claimResult" type="button" class="btn btn-primary" :disabled="claiming || !claimBox.date" @click="submitClaim">
            <span v-if="claiming" class="loading loading-spinner loading-xs" />จอง
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* ก้อนตัวเลขบนแผนที่ (divIcon เป็น DOM ของ Leaflet — global) */
.fault-cell > div {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 3px solid;
  background: rgba(255, 255, 255, 0.92);
  color: #111827;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  line-height: 1;
  cursor: pointer;
}
.fault-cell > div b { font-size: 13px; }
.fault-cell > div small { font-size: 9px; opacity: 0.7; margin-top: 1px; }
:root[data-theme='dark'] .fault-cell > div {
  background: rgba(15, 21, 32, 0.92);
  color: #f3f4f6;
}
.cursor-crosshair .leaflet-container { cursor: crosshair; }
:root[data-theme='dark'] .map-plain .leaflet-tile-pane { filter: none; }
</style>

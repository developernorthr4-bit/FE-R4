<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import { drawCables as paintCables } from '../lib/cable-layer'
import { formatDate, formatDateTime } from '../lib/events'
import { resizeImage } from '../lib/image-resize'
import { categorical } from '../lib/palette'
import { formatDuration } from '../lib/routing'
import { formatM } from '../lib/ruler'
import { glyphPoints, shapeMarker, type MarkerShape } from '../lib/shape-marker'
import { getCables, type CableView } from '../services/cables.api'
import { listEvents } from '../services/events.api'
import { getChain, searchOnline, type ChainStep, type MapHit, type MapKind } from '../services/online.api'
import {
  addPoint, createSurvey, deletePhoto, deletePoint, deleteSurvey, getSurvey, loadSurveyLookups,
  SEVERITY_BADGE, SEVERITY_LABEL, setSurveyStatus, SURVEY_RESULT_LABEL, SURVEY_STATUS_BADGE, SURVEY_STATUS_LABEL,
  updatePoint, updateSurvey, uploadPhoto,
  type SurveyDetail, type SurveyHeaderInput, type SurveyLookups, type SurveyPhoto, type SurveyPoint, type SurveySeverity,
} from '../services/surveys.api'
import { useFlashStore } from '../stores/flash'
import { useThemeStore } from '../stores/theme'
import type { EventRow } from '../lib/events'

/**
 * งานสำรวจ — หน้าเดียวทั้งสร้าง / แก้ / ดู
 *
 * ลำดับที่บังคับ: ต้องบันทึกหัวงานก่อน (ได้เลข SV-) ถึงจะเพิ่มจุด/รูปได้ เพราะจุดกับรูป
 * ต้องมี survey id ให้เกาะ — หน้าใหม่จึงเป็นฟอร์มหัวงานล้วน กดสร้างแล้วเด้งมาหน้า
 * /surveys/:id ต่อทันที ไม่ให้ผู้ใช้กรอกจุดไว้เยอะแล้วมาพังตอนบันทึก
 *
 * แผนที่กลางหน้า: สายโซ่ + เคเบิลรอบ ๆ + จุดปัญหา · กด "เพิ่มจุด" แล้วกดบนแผนที่
 * (หรือใช้ GPS) → กล่องกรอกประเภท/ความรุนแรง/บันทึก
 */
const route = useRoute()
const router = useRouter()
const theme = useThemeStore()
const flash = useFlashStore()

const SLOT: Record<MapKind, number> = { site: 8, olt: 1, l1: 3, l2: 7 }
const LABEL: Record<MapKind, string> = { site: 'สถานี', olt: 'OLT', l1: 'L1', l2: 'L2' }
const SHAPE: Record<MapKind, MarkerShape> = { site: 'triangle', olt: 'square', l1: 'diamond', l2: 'circle' }
const SEV_COLOR: Record<SurveySeverity, string> = { low: '#64748b', medium: '#f59e0b', high: '#dc2626' }
const Z_CABLE = 11

const isNew = computed(() => route.name === 'survey-new')
const surveyId = computed(() => (isNew.value ? null : String(route.params.id)))

const lookups = ref<SurveyLookups | null>(null)
const events = ref<EventRow[]>([])
const detail = ref<SurveyDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const saving = ref(false)

/* ---------- ปลายทาง ---------- */
const target = ref<{ kind: MapKind; code: string } | null>(null)
const chain = ref<ChainStep[]>([])
const q = ref('')
const sugg = ref<MapHit[]>([])
let searchTimer: ReturnType<typeof setTimeout> | undefined

/* ---------- หัวงาน ---------- */
const form = reactive<SurveyHeaderInput>({
  jobTypeId: '', surveyDate: new Date().toISOString().slice(0, 10), companions: '', summary: '',
  result: '', startLat: null, startLng: null, routeM: null, routeSec: null, eventId: '',
})

const survey = computed(() => detail.value?.survey ?? null)
const can = computed(() => detail.value?.can ?? { edit: isNew.value, close: false, delete: false })
const points = computed(() => detail.value?.points ?? [])
const photos = computed(() => detail.value?.photos ?? [])
const surveyPhotos = computed(() => photos.value.filter((p) => !p.pointId))
const photosOf = (pointId: string) => photos.value.filter((p) => p.pointId === pointId)
const located = computed(() => chain.value.filter((s): s is ChainStep & { lat: number; lng: number } => s.lat !== null && s.lng !== null))

function color(kind: MapKind): string { return categorical(SLOT[kind], theme.resolved === 'dark') }

/* ---------- แผนที่ ---------- */
const el = ref<HTMLElement | null>(null)
const map = shallowRef<L.Map | null>(null)
const renderer = shallowRef<L.Canvas | null>(null)
const gCable = shallowRef<L.LayerGroup | null>(null)
const gChain = shallowRef<L.LayerGroup | null>(null)
const gPoints = shallowRef<L.LayerGroup | null>(null)
const gDraft = shallowRef<L.LayerGroup | null>(null)
const cables = ref<CableView | null>(null)
let cableBounds: L.LatLngBounds | null = null
let panTimer: ReturnType<typeof setTimeout> | undefined

/* ---------- เพิ่ม/แก้จุด ---------- */
const picking = ref(false)
const pointModal = ref<{ id: string | null; lat: number; lng: number; pointTypeId: number | ''; severity: SurveySeverity; note: string } | null>(null)
const pointSaving = ref(false)
const gpsBusy = ref(false)

/* ---------- รูป ---------- */
const uploading = ref<{ done: number; total: number } | null>(null)
const lightbox = ref<SurveyPhoto | null>(null)

/* ---------- ลบ ---------- */
const confirmDeleteOpen = ref(false)
const deleting = ref(false)

// ═════════════════════════════════════════════════════════════════════════════

onMounted(async () => {
  notice.value = flash.take()
  try {
    ;[lookups.value] = await Promise.all([loadSurveyLookups(), loadEvents()])
  } catch {
    error.value = 'โหลดตัวเลือกไม่สำเร็จ'
  }
  initMap()
  if (isNew.value) {
    // มาจากแผนที่สำรวจ: ?kind=&code=&startLat=&startLng=&routeM=&routeSec=
    const qk = route.query.kind, qc = route.query.code
    if (typeof qk === 'string' && typeof qc === 'string' && (['site', 'olt', 'l1', 'l2'] as string[]).includes(qk)) {
      await setTarget(qk as MapKind, qc)
    }
    const n = (v: unknown) => (typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
    form.startLat = n(route.query.startLat)
    form.startLng = n(route.query.startLng)
    form.routeM = n(route.query.routeM)
    form.routeSec = n(route.query.routeSec)
    loading.value = false
  } else {
    await load()
  }
})

onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  clearTimeout(panTimer)
  map.value?.remove()
  map.value = null
})

/** Event ที่ยังเปิด/เฝ้าระวังอยู่ — พอสำหรับผูกงานสำรวจที่กำลังทำ */
async function loadEvents() {
  try {
    const [open, mon] = await Promise.all([
      listEvents({ status: 'open', limit: 50 }),
      listEvents({ status: 'monitoring', limit: 50 }),
    ])
    events.value = [...open.events, ...mon.events]
  } catch {
    events.value = []
  }
}

async function load() {
  if (!surveyId.value) return
  loading.value = true
  error.value = null
  try {
    detail.value = await getSurvey(surveyId.value)
    const s = detail.value.survey
    // Event ที่ผูกไว้อาจปิดไปแล้ว ไม่อยู่ในรายการ → ใส่ให้เลือกค้างได้
    Object.assign(form, {
      jobTypeId: s.jobTypeId, surveyDate: s.surveyDate, companions: s.companions ?? '', summary: s.summary ?? '',
      result: s.result ?? '', startLat: s.startLat !== null ? Number(s.startLat) : null,
      startLng: s.startLng !== null ? Number(s.startLng) : null, routeM: s.routeM, routeSec: s.routeSec, eventId: s.eventId ?? '',
    })
    await setTarget(s.targetKind, s.targetCode, false)
    drawPoints()
    fitAll()
  } catch (err) {
    error.value = errorMessage(err, 'โหลดงานสำรวจไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ปลายทาง + สายโซ่
// ═════════════════════════════════════════════════════════════════════════════

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
  await setTarget(hit.kind, hit.code)
}

async function setTarget(kind: MapKind, code: string, fit = true) {
  target.value = { kind, code }
  try {
    chain.value = await getChain(kind, code)
  } catch (err) {
    chain.value = []
    error.value = errorMessage(err, 'ไล่สายโซ่ไม่สำเร็จ')
    return
  }
  drawChain()
  if (fit) fitAll()
  await loadCablesAround()
}

// ═════════════════════════════════════════════════════════════════════════════
// แผนที่
// ═════════════════════════════════════════════════════════════════════════════

function initMap() {
  if (!el.value) return
  const m = L.map(el.value, { preferCanvas: true, minZoom: 5, maxZoom: 19, zoomAnimationThreshold: 2 })
  m.setView([18.79, 99.0], 8)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m)
  // 🪤 canvas ตัวเดียวทุกชั้น ไม่งั้นใบบนกลืนคลิก (ดู OnlineNetworkMap.vue)
  renderer.value = L.canvas({ padding: 0.3 })
  gCable.value = L.layerGroup().addTo(m)
  gChain.value = L.layerGroup().addTo(m)
  gPoints.value = L.layerGroup().addTo(m)
  gDraft.value = L.layerGroup().addTo(m)
  map.value = m
  m.on('click', (e) => {
    if (!picking.value) return
    openPointModal(null, e.latlng.lat, e.latlng.lng)
  })
  m.on('moveend zoomend', () => {
    clearTimeout(panTimer)
    panTimer = setTimeout(() => {
      const view = m.getBounds()
      if (cableBounds?.contains(view)) return
      void loadCables(view.pad(0.3))
    }, 300)
  })
}

function drawChain() {
  const g = gChain.value
  if (!g) return
  g.clearLayers()
  const dark = theme.resolved === 'dark'
  const edge = dark ? '#ffffff' : '#111827'
  const rend = renderer.value ?? undefined
  const pts = located.value.map((s) => [s.lat, s.lng] as [number, number])
  if (pts.length > 1) {
    L.polyline(pts, { color: edge, weight: 2.5, opacity: 0.7, dashArray: '6 6', interactive: false, renderer: rend }).addTo(g)
  }
  for (const s of located.value) {
    shapeMarker([s.lat, s.lng], {
      shape: SHAPE[s.kind], radius: 8, color: edge, weight: 2.5, fillColor: color(s.kind), fillOpacity: 1, renderer: rend,
    })
      .bindTooltip(`${LABEL[s.kind]} ${s.code}`, { permanent: true, direction: 'top', offset: [0, -8], className: 'survey-label' })
      .addTo(g)
  }
}

function drawPoints() {
  const g = gPoints.value
  if (!g) return
  g.clearLayers()
  const rend = renderer.value ?? undefined
  for (const p of points.value) {
    L.circleMarker([p.lat, p.lng], {
      radius: 9, color: '#ffffff', weight: 2.5, fillColor: SEV_COLOR[p.severity], fillOpacity: p.resolvedAt ? 0.4 : 1, renderer: rend,
    })
      .bindTooltip(String(p.seqNo), { permanent: true, direction: 'center', className: 'survey-seq' })
      .on('click', () => { if (can.value.edit) openPointModal(p) })
      .addTo(g)
  }
}

function fitAll() {
  const m = map.value
  if (!m) return
  const pts: [number, number][] = located.value.map((s) => [s.lat, s.lng])
  for (const p of points.value) pts.push([p.lat, p.lng])
  if (form.startLat !== null && form.startLng !== null) pts.push([form.startLat, form.startLng])
  if (!pts.length) return
  if (pts.length === 1) { m.setView(pts[0]!, 15, { animate: false }); return }
  m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 16, animate: false })
}

function flyTo(lat: number, lng: number) {
  const m = map.value
  if (m) m.setView([lat, lng], Math.max(m.getZoom(), 16), { animate: false })
}

async function loadCablesAround() {
  const pts: [number, number][] = located.value.map((s) => [s.lat, s.lng])
  if (!pts.length) return
  const b = pts.length === 1 ? L.latLng(pts[0]!).toBounds(4000) : L.latLngBounds(pts).pad(0.2)
  await loadCables(b)
}

async function loadCables(b: L.LatLngBounds) {
  const m = map.value
  if (!m) return
  cableBounds = b
  try {
    cables.value = await getCables({
      bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()],
      zoom: Math.max(m.getZoom(), Z_CABLE),
    })
    const g = gCable.value
    if (g) paintCables(g, cables.value, { dark: theme.resolved === 'dark', mono: true, renderer: renderer.value ?? undefined })
  } catch {
    // เคเบิลเป็นฉากหลัง ไม่มีก็ยังทำงานได้
  }
}

watch(() => theme.resolved, () => {
  drawChain()
  const g = gCable.value
  if (g) paintCables(g, cables.value, { dark: theme.resolved === 'dark', mono: true, renderer: renderer.value ?? undefined })
})

// ═════════════════════════════════════════════════════════════════════════════
// หัวงาน
// ═════════════════════════════════════════════════════════════════════════════

async function saveHeader() {
  error.value = null
  if (!target.value) { error.value = 'ต้องเลือกปลายทางก่อน'; return }
  if (!form.jobTypeId) { error.value = 'ต้องเลือกประเภทงาน'; return }
  saving.value = true
  try {
    if (isNew.value) {
      const created = await createSurvey({ ...form, targetKind: target.value.kind, targetCode: target.value.code })
      flash.set(`สร้างงาน ${created.surveyNo} แล้ว — เพิ่มจุดปัญหาและรูปได้เลย`)
      await router.replace(`/surveys/${created.id}`)
      await load()
    } else if (surveyId.value) {
      const s = await updateSurvey(surveyId.value, form)
      if (detail.value) detail.value.survey = { ...detail.value.survey, ...s }
      notice.value = 'บันทึกหัวงานแล้ว'
    }
  } catch (err) {
    error.value = errorMessage(err, 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

async function changeStatus(action: 'submit' | 'close' | 'reopen') {
  if (!surveyId.value) return
  saving.value = true
  error.value = null
  try {
    await setSurveyStatus(surveyId.value, action)
    await load()
    notice.value = action === 'submit' ? 'ส่งงานแล้ว' : action === 'close' ? 'ปิดงานแล้ว' : 'เปิดงานใหม่แล้ว'
  } catch (err) {
    error.value = errorMessage(err, 'เปลี่ยนสถานะไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!surveyId.value || !survey.value) return
  deleting.value = true
  try {
    await deleteSurvey(surveyId.value)
    flash.set(`ลบ ${survey.value.surveyNo} แล้ว`)
    await router.replace('/surveys')
  } catch (err) {
    error.value = errorMessage(err, 'ลบไม่สำเร็จ')
    confirmDeleteOpen.value = false
  } finally {
    deleting.value = false
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// จุดปัญหา
// ═════════════════════════════════════════════════════════════════════════════

function openPointModal(p: SurveyPoint | null, lat?: number, lng?: number) {
  picking.value = false
  gDraft.value?.clearLayers()
  pointModal.value = p
    ? { id: p.id, lat: p.lat, lng: p.lng, pointTypeId: p.pointTypeId, severity: p.severity, note: p.note ?? '' }
    : { id: null, lat: lat!, lng: lng!, pointTypeId: '', severity: 'medium', note: '' }
}

function useGps() {
  if (!('geolocation' in navigator)) { error.value = 'เบราว์เซอร์นี้ไม่มีตำแหน่ง'; return }
  gpsBusy.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      gpsBusy.value = false
      if (pointModal.value) { pointModal.value.lat = pos.coords.latitude; pointModal.value.lng = pos.coords.longitude }
      else openPointModal(null, pos.coords.latitude, pos.coords.longitude)
    },
    () => { gpsBusy.value = false; error.value = 'หาตำแหน่งไม่สำเร็จ — กดบนแผนที่แทน' },
    { enableHighAccuracy: true, timeout: 10_000 },
  )
}

async function savePoint() {
  const m = pointModal.value
  if (!m || !surveyId.value) return
  if (!m.pointTypeId) { error.value = 'ต้องเลือกประเภทจุด'; return }
  pointSaving.value = true
  error.value = null
  try {
    const payload = { pointTypeId: Number(m.pointTypeId), severity: m.severity, lat: m.lat, lng: m.lng, note: m.note }
    if (m.id) {
      const p = await updatePoint(surveyId.value, m.id, payload)
      if (detail.value) detail.value.points = detail.value.points.map((x) => (x.id === p.id ? { ...x, ...p, lat: Number(p.lat), lng: Number(p.lng), pointTypeName: typeName(p.pointTypeId) } : x))
    } else {
      const p = await addPoint(surveyId.value, payload)
      detail.value?.points.push({ ...p, lat: Number(p.lat), lng: Number(p.lng), pointTypeName: typeName(p.pointTypeId) })
    }
    pointModal.value = null
    drawPoints()
  } catch (err) {
    error.value = errorMessage(err, 'บันทึกจุดไม่สำเร็จ')
  } finally {
    pointSaving.value = false
  }
}

async function removePoint(p: SurveyPoint) {
  if (!surveyId.value) return
  if (!window.confirm(`ลบจุดที่ ${p.seqNo}? รูปของจุดนี้จะย้ายไปเป็นรูปของงาน`)) return
  try {
    await deletePoint(surveyId.value, p.id)
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'ลบจุดไม่สำเร็จ')
  }
}

function typeName(id: number): string | null {
  return lookups.value?.pointTypes.find((t) => t.id === id)?.nameTh ?? null
}

// ═════════════════════════════════════════════════════════════════════════════
// รูป
// ═════════════════════════════════════════════════════════════════════════════

async function onFiles(ev: Event, pointId: string | null) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length || !surveyId.value) return
  uploading.value = { done: 0, total: files.length }
  error.value = null
  for (const f of files) {
    try {
      const r = await resizeImage(f)
      const photo = await uploadPhoto(surveyId.value, r.blob, {
        pointId, width: r.width, height: r.height, takenAt: f.lastModified ? new Date(f.lastModified).toISOString() : null,
      })
      detail.value?.photos.push(photo)
    } catch (err) {
      error.value = errorMessage(err, `อัปโหลด ${f.name} ไม่สำเร็จ`)
    }
    uploading.value.done++
  }
  uploading.value = null
}

async function removePhoto(p: SurveyPhoto) {
  if (!surveyId.value || !window.confirm('ลบรูปนี้?')) return
  try {
    await deletePhoto(surveyId.value, p.id)
    if (detail.value) detail.value.photos = detail.value.photos.filter((x) => x.id !== p.id)
  } catch (err) {
    error.value = errorMessage(err, 'ลบรูปไม่สำเร็จ')
  }
}

// ให้แผนที่รู้ขนาดจริงหลัง DOM วางเสร็จ (อยู่ใน card ที่ขยายทีหลัง)
watch(loading, async (v) => { if (!v) { await nextTick(); map.value?.invalidateSize(); fitAll() } })
</script>

<template>
  <AppLayout>
    <PageHeader
      :title="isNew ? 'สร้างงานสำรวจ' : (survey?.surveyNo ?? 'งานสำรวจ')"
      :description="isNew ? 'เลือกปลายทางแล้วบันทึกหัวงานก่อน จึงจะเพิ่มจุดและรูปได้' : 'จุดปัญหา รูป และผลสรุปของงานนี้'"
    >
      <template #actions>
        <RouterLink to="/surveys" class="btn btn-ghost btn-sm">← รายการ</RouterLink>
        <template v-if="survey">
          <span class="badge" :class="SURVEY_STATUS_BADGE[survey.status]">{{ SURVEY_STATUS_LABEL[survey.status] }}</span>
          <button v-if="survey.status === 'draft' && can.edit" type="button" class="btn btn-sm btn-primary" :disabled="saving" @click="changeStatus('submit')">ส่งงาน</button>
          <button v-if="survey.status === 'submitted' && can.close" type="button" class="btn btn-sm btn-success" :disabled="saving" @click="changeStatus('close')">ปิดงาน</button>
          <button v-if="survey.status === 'closed' && can.close" type="button" class="btn btn-sm" :disabled="saving" @click="changeStatus('reopen')">เปิดงานใหม่</button>
          <button v-if="can.delete" type="button" class="btn btn-sm btn-ghost text-error" @click="confirmDeleteOpen = true">ลบ</button>
        </template>
      </template>
    </PageHeader>

    <div v-if="notice" role="status" class="alert alert-success mb-4 text-sm"><span>{{ notice }}</span></div>
    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm"><span>{{ error }}</span></div>

    <div v-if="loading" class="mt-10 flex justify-center"><span class="loading loading-spinner loading-lg opacity-60" /></div>

    <div v-show="!loading" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <!-- ══ ซ้าย: หัวงาน ══ -->
      <div class="space-y-4">
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-3 p-4">
            <h2 class="text-sm font-semibold">ปลายทาง</h2>
            <div v-if="isNew" class="relative">
              <input v-model="q" type="search" placeholder="ค้นรหัส OLT / L1 / L2 / สถานี" class="input input-sm input-bordered w-full">
              <ul v-if="sugg.length" class="absolute inset-x-0 top-full z-[900] mt-1 max-h-60 overflow-auto rounded-box border border-base-300 bg-base-100 shadow-lg">
                <li v-for="h in sugg" :key="`${h.kind}-${h.code}`">
                  <button type="button" class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-base-200" @click="pick(h)">
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
            <p v-if="!target" class="text-xs opacity-60">ยังไม่ได้เลือกปลายทาง</p>
            <ul v-else class="space-y-0.5 text-xs">
              <li v-for="s in chain" :key="`${s.kind}-${s.code}`" class="flex items-center gap-2">
                <svg class="size-3.5 shrink-0" viewBox="-10 -10 20 20" aria-hidden="true">
                  <polygon v-if="glyphPoints(SHAPE[s.kind])" :points="glyphPoints(SHAPE[s.kind])" :fill="color(s.kind)" />
                  <circle v-else r="7" :fill="color(s.kind)" />
                </svg>
                <span class="w-8 opacity-60">{{ LABEL[s.kind] }}</span>
                <button type="button" class="font-mono" :class="{ 'font-semibold': target.kind === s.kind && target.code === s.code, 'link': s.lat !== null }" :disabled="s.lat === null" @click="s.lat !== null && s.lng !== null && flyTo(s.lat, s.lng)">{{ s.code }}</button>
                <span v-if="s.lat === null" class="ml-auto text-warning">ไม่มีพิกัด</span>
              </li>
              <li v-if="!chain.some((s) => s.kind === 'site')" class="text-warning">สายโซ่ไล่ไม่ถึงสถานี (OLT ยังไม่ผูกสถานี)</li>
            </ul>
            <p v-if="form.routeM !== null" class="text-xs opacity-60">
              เส้นทางที่วางไว้: {{ formatM(form.routeM) }}<template v-if="form.routeSec !== null"> · {{ formatDuration(form.routeSec) }}</template>
            </p>
          </div>
        </div>

        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-3 p-4">
            <h2 class="text-sm font-semibold">หัวงาน</h2>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="form-control">
                <span class="label-text text-xs opacity-70">ประเภทงาน *</span>
                <select v-model="form.jobTypeId" class="select select-sm select-bordered w-full" :disabled="!can.edit">
                  <option value="">— เลือก —</option>
                  <option v-for="t in lookups?.jobTypes" :key="t.id" :value="t.id">{{ t.nameTh }}</option>
                </select>
              </label>
              <label class="form-control">
                <span class="label-text text-xs opacity-70">วันที่สำรวจ *</span>
                <input v-model="form.surveyDate" type="date" class="input input-sm input-bordered w-full" :disabled="!can.edit">
              </label>
              <label class="form-control sm:col-span-2">
                <span class="label-text text-xs opacity-70">ผู้ร่วมงาน</span>
                <input v-model="form.companions" type="text" class="input input-sm input-bordered w-full" placeholder="ชื่อทีมหรือผู้ร่วมสำรวจ" :disabled="!can.edit">
              </label>
              <label class="form-control sm:col-span-2">
                <span class="label-text text-xs opacity-70">เกี่ยวกับ Event (ว่างได้)</span>
                <select v-model="form.eventId" class="select select-sm select-bordered w-full" :disabled="!can.edit">
                  <option value="">— ไม่ผูก —</option>
                  <option v-if="survey?.eventId && !events.some((e) => e.id === survey?.eventId)" :value="survey.eventId">(Event ที่ผูกไว้เดิม)</option>
                  <option v-for="e in events" :key="e.id" :value="e.id">{{ e.eventNo }} · {{ e.title }}</option>
                </select>
              </label>
              <label class="form-control">
                <span class="label-text text-xs opacity-70">ผลสรุป</span>
                <select v-model="form.result" class="select select-sm select-bordered w-full" :disabled="!can.edit">
                  <option value="">— ยังไม่สรุป —</option>
                  <option v-for="(label, r) in SURVEY_RESULT_LABEL" :key="r" :value="r">{{ label }}</option>
                </select>
              </label>
              <label class="form-control sm:col-span-2">
                <span class="label-text text-xs opacity-70">บันทึกสรุป</span>
                <textarea v-model="form.summary" rows="4" class="textarea textarea-bordered textarea-sm w-full" :disabled="!can.edit" />
              </label>
            </div>
            <div v-if="can.edit" class="flex items-center gap-2">
              <button type="button" class="btn btn-sm btn-primary" :disabled="saving" @click="saveHeader">
                <span v-if="saving" class="loading loading-spinner loading-xs" />
                {{ isNew ? 'สร้างงาน' : 'บันทึกหัวงาน' }}
              </button>
              <span v-if="isNew" class="text-xs opacity-60">สร้างแล้วจึงเพิ่มจุด/รูปได้</span>
            </div>
            <p v-if="survey" class="text-xs opacity-60">
              ผู้สำรวจ {{ survey.surveyorName }} · สร้าง {{ formatDateTime(survey.createdAt) }}
              <template v-if="survey.submittedAt"> · ส่ง {{ formatDateTime(survey.submittedAt) }}</template>
              <template v-if="survey.closedAt"> · ปิด {{ formatDateTime(survey.closedAt) }}</template>
            </p>
          </div>
        </div>
      </div>

      <!-- ══ ขวา: แผนที่ + จุด + รูป ══ -->
      <div class="space-y-4">
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2 p-4">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-sm font-semibold">แผนที่</h2>
              <span class="text-xs opacity-60">สายโซ่ · เคเบิล (เทา) · จุดปัญหา (สีตามความรุนแรง)</span>
              <template v-if="survey && can.edit">
                <button type="button" class="btn btn-sm ml-auto" :class="{ 'btn-primary': picking }" @click="picking = !picking">
                  {{ picking ? 'กดบนแผนที่…' : '+ เพิ่มจุดจากแผนที่' }}
                </button>
                <button type="button" class="btn btn-sm" :disabled="gpsBusy" @click="useGps">{{ gpsBusy ? 'กำลังหา…' : '+ จุดจาก GPS' }}</button>
              </template>
              <button type="button" class="btn btn-ghost btn-xs" @click="fitAll">ดูทั้งหมด</button>
            </div>
            <!-- 🪤 :class อยู่ที่กล่องหุ้ม ไม่ใช่ div ที่ Leaflet ยึด (ดู OnlineNetworkMap.vue) -->
            <div class="h-80 w-full overflow-hidden rounded-box border border-base-300" :class="{ 'cursor-crosshair-map': picking }">
              <div ref="el" class="h-full w-full" />
            </div>
            <p v-if="isNew" class="text-xs opacity-60">สร้างงานก่อน แล้วค่อยเพิ่มจุดปัญหาบนแผนที่</p>
          </div>
        </div>

        <div v-if="survey" class="card border border-base-300 bg-base-100">
          <div class="card-body gap-3 p-4">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold">จุดปัญหา ({{ points.length }})</h2>
              <span v-if="uploading" class="ml-auto text-xs opacity-70">กำลังอัปโหลด {{ uploading.done }}/{{ uploading.total }}…</span>
            </div>
            <p v-if="!points.length" class="text-xs opacity-60">ยังไม่มีจุด — กด "เพิ่มจุดจากแผนที่" หรือ "จุดจาก GPS"</p>
            <div v-for="p in points" :key="p.id" class="rounded-box border border-base-300 p-3">
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <span class="inline-flex size-6 items-center justify-center rounded-full text-xs font-bold text-white" :style="{ background: SEV_COLOR[p.severity] }">{{ p.seqNo }}</span>
                <span class="font-medium">{{ p.pointTypeName ?? '—' }}</span>
                <span class="badge badge-sm" :class="SEVERITY_BADGE[p.severity]">{{ SEVERITY_LABEL[p.severity] }}</span>
                <span v-if="p.resolvedAt" class="badge badge-sm badge-success">แก้แล้ว</span>
                <button type="button" class="link text-xs opacity-60" @click="flyTo(p.lat, p.lng)">{{ p.lat.toFixed(5) }}, {{ p.lng.toFixed(5) }}</button>
                <span class="ml-auto flex gap-1">
                  <button v-if="can.edit" type="button" class="btn btn-ghost btn-xs" @click="openPointModal(p)">แก้</button>
                  <button v-if="can.edit" type="button" class="btn btn-ghost btn-xs text-error" @click="removePoint(p)">ลบ</button>
                </span>
              </div>
              <p v-if="p.note" class="mt-1 whitespace-pre-wrap text-sm opacity-80">{{ p.note }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button v-for="ph in photosOf(p.id)" :key="ph.id" type="button" class="relative" @click="lightbox = ph">
                  <img v-if="ph.url" :src="ph.url" class="size-20 rounded object-cover" loading="lazy" alt="">
                  <span v-else class="flex size-20 items-center justify-center rounded bg-base-200 text-xs opacity-60">ไม่มีที่เก็บ</span>
                </button>
                <label v-if="can.edit && photosOf(p.id).length < 10" class="flex size-20 cursor-pointer items-center justify-center rounded border border-dashed border-base-300 text-xs opacity-70 hover:bg-base-200">
                  + รูป
                  <input type="file" accept="image/*" capture="environment" multiple class="hidden" @change="onFiles($event, p.id)">
                </label>
              </div>
            </div>
          </div>
        </div>

        <div v-if="survey" class="card border border-base-300 bg-base-100">
          <div class="card-body gap-3 p-4">
            <h2 class="text-sm font-semibold">รูปของงาน ({{ surveyPhotos.length }})</h2>
            <div class="flex flex-wrap gap-2">
              <button v-for="ph in surveyPhotos" :key="ph.id" type="button" @click="lightbox = ph">
                <img v-if="ph.url" :src="ph.url" class="size-20 rounded object-cover" loading="lazy" alt="">
                <span v-else class="flex size-20 items-center justify-center rounded bg-base-200 text-xs opacity-60">ไม่มีที่เก็บ</span>
              </button>
              <label v-if="can.edit" class="flex size-20 cursor-pointer items-center justify-center rounded border border-dashed border-base-300 text-xs opacity-70 hover:bg-base-200">
                + รูป
                <input type="file" accept="image/*" capture="environment" multiple class="hidden" @change="onFiles($event, null)">
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- กล่องเพิ่ม/แก้จุด -->
    <div v-if="pointModal" class="modal modal-open" @click.self="pointModal = null">
      <div class="modal-box">
        <h3 class="text-lg font-semibold">{{ pointModal.id ? 'แก้จุดปัญหา' : 'เพิ่มจุดปัญหา' }}</h3>
        <p class="mt-1 font-mono text-xs opacity-60">
          {{ pointModal.lat.toFixed(6) }}, {{ pointModal.lng.toFixed(6) }}
          <button type="button" class="link ml-2" :disabled="gpsBusy" @click="useGps">ใช้ GPS</button>
        </p>
        <div class="mt-3 grid gap-3">
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ประเภท *</span>
            <select v-model="pointModal.pointTypeId" class="select select-sm select-bordered w-full">
              <option value="">— เลือก —</option>
              <option v-for="t in lookups?.pointTypes" :key="t.id" :value="t.id">{{ t.nameTh }}</option>
            </select>
          </label>
          <div class="form-control">
            <span class="label-text text-xs opacity-70">ความรุนแรง</span>
            <div class="join">
              <button v-for="(label, s) in SEVERITY_LABEL" :key="s" type="button" class="btn btn-sm join-item" :class="{ 'btn-active': pointModal.severity === s }" @click="pointModal.severity = s">{{ label }}</button>
            </div>
          </div>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">บันทึก</span>
            <textarea v-model="pointModal.note" rows="3" class="textarea textarea-bordered textarea-sm w-full" placeholder="สิ่งที่เจอ สิ่งที่ต้องทำ" />
          </label>
        </div>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" :disabled="pointSaving" @click="pointModal = null">ยกเลิก</button>
          <button type="button" class="btn btn-primary" :disabled="pointSaving" @click="savePoint">
            <span v-if="pointSaving" class="loading loading-spinner loading-xs" />บันทึกจุด
          </button>
        </div>
      </div>
    </div>

    <!-- ดูรูปใหญ่ -->
    <div v-if="lightbox" class="modal modal-open" @click.self="lightbox = null">
      <div class="modal-box max-w-4xl p-2">
        <img v-if="lightbox.url" :src="lightbox.url" class="max-h-[80vh] w-full rounded object-contain" alt="">
        <div class="mt-2 flex items-center gap-2 px-2 pb-1 text-xs opacity-70">
          <span v-if="lightbox.takenAt">ถ่าย {{ formatDateTime(lightbox.takenAt) }}</span>
          <span>{{ (lightbox.sizeBytes / 1024).toFixed(0) }} KB<template v-if="lightbox.width"> · {{ lightbox.width }}×{{ lightbox.height }}</template></span>
          <button v-if="can.edit" type="button" class="btn btn-ghost btn-xs ml-auto text-error" @click="removePhoto(lightbox); lightbox = null">ลบรูป</button>
          <button type="button" class="btn btn-ghost btn-xs" @click="lightbox = null">ปิด</button>
        </div>
      </div>
    </div>

    <!-- ยืนยันลบงาน -->
    <div v-if="confirmDeleteOpen && survey" class="modal modal-open" @click.self="confirmDeleteOpen = false">
      <div class="modal-box">
        <h3 class="text-lg font-semibold">ลบ {{ survey.surveyNo }}?</h3>
        <p class="mt-2 text-sm opacity-70">{{ formatDate(survey.surveyDate) }} · {{ LABEL[survey.targetKind] }} {{ survey.targetCode }}</p>
        <div role="alert" class="alert alert-warning mt-4 text-sm">
          <span>ลบแล้วหายถาวร รวม {{ points.length }} จุด และ {{ photos.length }} รูป</span>
        </div>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" :disabled="deleting" @click="confirmDeleteOpen = false">ยกเลิก</button>
          <button type="button" class="btn btn-error" :disabled="deleting" @click="confirmDelete">
            <span v-if="deleting" class="loading loading-spinner loading-xs" />ลบถาวร
          </button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style>
/* ป้ายชื่อหมุดสายโซ่ — กฎเดียวกับ SurveyMap.vue (global เพราะเป็น tooltip ของ Leaflet) */
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
.survey-label::before { display: none; }

.survey-seq {
  background: transparent;
  border: 0;
  box-shadow: none;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 0;
}
.survey-seq::before { display: none; }
.cursor-crosshair-map .leaflet-container { cursor: crosshair; }
</style>

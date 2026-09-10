<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { errorMessage } from '../lib/api'
import { categorical } from '../lib/palette'
import { glyphPoints, shapeMarker, type MarkerShape } from '../lib/shape-marker'
import { getSiteGeo, type OnlineFocus, type SiteGeo } from '../services/online.api'
import { useThemeStore } from '../stores/theme'

/**
 * แผนที่โครงข่ายงาน online ของสถานีเดียว — สถานี → OLT → L1 → L2
 *
 * ทำไมเป็นรายสถานี ไม่ใช่ทั้งภาค: 95,906 โหนดในหน้าเดียว ต่อให้จับกลุ่มไหว
 * ซูมระดับภาคก็เห็นแค่ก้อนกลมทับกัน และมันซ้ำกับแผนที่สถานีใน /sites อยู่แล้ว
 * ของที่ยังไม่มีคือ "กดสถานีแล้วเห็นว่าสายวิ่งไปทางไหน" ซึ่งอ่านได้เฉพาะตอนซูมใกล้
 * โหนดเกาะกลุ่มรอบสถานีจริง — ตัวไกลสุดของแต่ละสถานีกลาง ๆ อยู่ที่ 3.3 กม.
 *
 * ไม่ใช้ markercluster ต่างจาก SiteMap.vue ตรงนี้ตั้งใจ: การจับกลุ่มจะกลืนเส้น
 * พ่อ-ลูกซึ่งเป็นสาระทั้งหมดของแผนที่นี้ และค่าเริ่มต้นก็วาดแค่ชั้นบน (กลาง ๆ
 * 4 จุด · p90 = 8) ซึ่งไม่มีอะไรให้จับกลุ่มอยู่แล้ว
 *
 * วาดเฉพาะโหนดที่ยังใช้งานอยู่ ตัวที่เลิกใช้แล้วไม่มีพิกัดมาตั้งแต่ไฟล์ต้นทาง
 * จึงวาดไม่ได้อยู่แล้ว — บอกเป็นจำนวนไว้ใต้แผนที่แทน ส่วนรายตัวไปดูในต้นไม้
 */
const props = defineProps<{
  siteId: string
  /** false = ถูกซ่อนอยู่ (คนละแท็บ) — Leaflet วัดขนาดตัวเองไม่ได้ตอนถูกซ่อน */
  active: boolean
  focus: OnlineFocus | null
}>()

const emit = defineEmits<{ focus: [OnlineFocus] }>()

type Kind = 'site' | 'olt' | 'l1' | 'l2'

/*
 * สีจ่ายตามชั้น และมีขนาดหมุดเป็นช่องทางที่สอง — ห้ามให้สีเป็นช่องทางเดียว
 * ที่บอกความหมาย (กฎในlib/palette.ts) จึงมี legend ใต้แผนที่กำกับเสมอ
 */
const SLOT: Record<Kind, number> = { site: 8, olt: 1, l1: 3, l2: 7 }
const RADIUS: Record<Kind, number> = { site: 9, olt: 7, l1: 5, l2: 3 }
/** รูปทรงชุดเดียวกับแผนที่รวมทั้งภาค — สองหน้าต้องอ่านด้วยสายตาชุดเดียวกัน */
const SHAPE: Record<Kind, MarkerShape> = {
  site: 'triangle', olt: 'square', l1: 'diamond', l2: 'circle',
}
const KIND_LABEL: Record<Kind, string> = { site: 'สถานี', olt: 'OLT', l1: 'L1', l2: 'L2' }

const theme = useThemeStore()

const el = ref<HTMLElement | null>(null)
const geo = ref<SiteGeo | null>(null)
const loading = ref(true)
const loadingL2 = ref(false)
const error = ref<string | null>(null)

// shallowRef เพราะออบเจกต์ของ Leaflet อ้างอิงวนกันเอง ทำ deep proxy แล้วช้าและพัง
const map = shallowRef<L.Map | null>(null)
const layer = shallowRef<L.LayerGroup | null>(null)

const markerById = new Map<string, L.CircleMarker>()
const kindById = new Map<string, Kind>()
let highlighted: string | null = null

/** กรอบภาคเหนือคร่าว ๆ — ชุดเดียวกับ SiteMap.vue ใช้ก่อนข้อมูลมาถึง */
const NORTH_BOUNDS = L.latLngBounds([15.0, 97.3], [20.5, 101.8])

function styleOf(kind: Kind, selected: boolean): L.CircleMarkerOptions {
  const dark = theme.resolved === 'dark'
  const color = categorical(SLOT[kind], dark)
  return {
    radius: RADIUS[kind] + (selected ? 3 : 0),
    color: selected ? (dark ? '#ffffff' : '#111827') : color,
    weight: selected ? 3 : 1,
    fillColor: color,
    fillOpacity: 0.9,
  }
}

async function load(withL2 = false) {
  const flag = withL2 ? loadingL2 : loading
  flag.value = true
  error.value = null
  try {
    geo.value = await getSiteGeo(props.siteId, withL2)
    draw()
  } catch (err) {
    error.value = errorMessage(err, 'โหลดแผนที่โครงข่ายไม่สำเร็จ')
  } finally {
    flag.value = false
  }
}

function draw() {
  const m = map.value
  const g = layer.value
  const data = geo.value
  if (!m || !g || !data) return

  g.clearLayers()
  markerById.clear()
  kindById.clear()
  highlighted = null

  const dark = theme.resolved === 'dark'
  const pos = new Map<string, L.LatLng>()

  const sitePt = data.site.lat !== null && data.site.lng !== null
    ? L.latLng(data.site.lat, data.site.lng)
    : null

  for (const o of data.olts) {
    if (o.lat !== null && o.lng !== null) pos.set(o.id, L.latLng(o.lat, o.lng))
  }
  for (const n of data.nodes) {
    if (n.lat !== null && n.lng !== null) pos.set(n.id, L.latLng(n.lat, n.lng))
  }

  /*
   * ลากเส้นก่อนแล้วค่อยปักหมุด — renderer แบบ canvas วาดตามลำดับที่เพิ่มเข้ามา
   * ถ้าปักหมุดก่อน เส้นจะพาดทับหมุดจนอ่านไม่ออกตรงจุดที่กิ่งแตกออกเยอะ ๆ
   */
  if (sitePt) {
    for (const o of data.olts) {
      const p = pos.get(o.id)
      if (p) {
        L.polyline([sitePt, p], {
          color: categorical(SLOT.olt, dark), weight: 2, opacity: 0.55,
        }).addTo(g)
      }
    }
  }

  for (const n of data.nodes) {
    const p = pos.get(n.id)
    if (!p) continue
    // ไม่มีพ่อ = ห้อยกับ OLT ตรง ๆ (L2 ที่ไฟล์ไม่ได้บอก L1 ID)
    const anchor = n.parentId === null ? pos.get(n.oltId) : pos.get(n.parentId)
    if (!anchor) continue
    const kind: Kind = n.level === 'l1' ? 'l1' : 'l2'
    L.polyline([anchor, p], {
      color: categorical(SLOT[kind], dark),
      weight: kind === 'l1' ? 1.5 : 1,
      opacity: kind === 'l1' ? 0.5 : 0.3,
    }).addTo(g)
  }

  function addMarker(id: string, kind: Kind, p: L.LatLng, label: string, focus?: OnlineFocus) {
    const mk = shapeMarker(p, { ...styleOf(kind, false), shape: SHAPE[kind] })
    mk.bindTooltip(label, { direction: 'top', offset: [0, -4] })
    if (focus) mk.on('click', () => emit('focus', focus))
    mk.addTo(g!)
    markerById.set(id, mk)
    kindById.set(id, kind)
  }

  // เรียงจากเล็กไปใหญ่ ตัวที่ใหญ่กว่าจึงอยู่ชั้นบนสุดและกดโดนก่อน
  for (const n of data.nodes) {
    if (n.level !== 'l2') continue
    const p = pos.get(n.id)
    if (p) {
      addMarker(n.id, 'l2', p, `${n.code} · L2`,
        { id: n.id, kind: 'node', oltId: n.oltId, parentId: n.parentId })
    }
  }
  for (const n of data.nodes) {
    if (n.level !== 'l1') continue
    const p = pos.get(n.id)
    if (p) {
      const kids = n.childCount ? ` · ลูก ${n.childCount.toLocaleString()}` : ''
      addMarker(n.id, 'l1', p, `${n.code} · L1${kids}`,
        { id: n.id, kind: 'node', oltId: n.oltId, parentId: n.parentId })
    }
  }
  for (const o of data.olts) {
    const p = pos.get(o.id)
    if (p) {
      addMarker(o.id, 'olt', p, `${o.code} · OLT`,
        { id: o.id, kind: 'olt', oltId: o.id, parentId: null })
    }
  }
  if (sitePt) addMarker(props.siteId, 'site', sitePt, 'สถานี')

  const pts = [...pos.values()]
  if (sitePt) pts.push(sitePt)

  if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.12), { maxZoom: 17 })
  else if (pts[0]) m.setView(pts[0], 16)

  applyFocus()
}

/** ไฮไลต์จุดที่กำลังถูกเลือก แล้วเลื่อนไปหา — ไม่วาดใหม่ทั้งแผนที่ */
function applyFocus() {
  const m = map.value
  const f = props.focus

  if (highlighted && highlighted !== f?.id) {
    const mk = markerById.get(highlighted)
    const kind = kindById.get(highlighted)
    if (mk && kind) mk.setStyle(styleOf(kind, false))
  }
  highlighted = null
  if (!m || !f) return

  const mk = markerById.get(f.id)
  const kind = kindById.get(f.id)
  if (!mk || !kind) return

  mk.setStyle(styleOf(kind, true))
  mk.bringToFront()
  mk.openTooltip()
  highlighted = f.id
  m.setView(mk.getLatLng(), Math.max(m.getZoom(), 16))
}

onMounted(async () => {
  if (!el.value) return

  const m = L.map(el.value, { zoomControl: true, preferCanvas: true })
  m.fitBounds(NORTH_BOUNDS)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(m)

  map.value = m
  layer.value = L.layerGroup().addTo(m)

  await load()
  await ensureFocusVisible()
})

onBeforeUnmount(() => {
  map.value?.remove()
  map.value = null
  layer.value = null
})

watch(() => theme.resolved, draw)

/*
 * ตอนถูกซ่อนอยู่ Leaflet อ่านขนาดกล่องได้ 0 แผนที่จึงเป็นสีเทาเปล่า ๆ
 * ต้องบอกให้วัดใหม่ทุกครั้งที่กลับมาแสดง
 */
watch(() => props.active, async (on) => {
  if (!on) return
  await nextTick()
  map.value?.invalidateSize()
  applyFocus()
})

/*
 * กดจากต้นไม้มาที่ L2 ของสถานีใหญ่ที่ยังไม่ได้โหลด L2 — โหลดให้เลย
 * ไม่งั้นจะกดแล้วเงียบ ทั้งที่ผู้ใช้เพิ่งชี้ตัวนั้นมาเอง
 *
 * ต้องเรียกตอนโหลดครั้งแรกด้วย ไม่ใช่แค่ตอน focus เปลี่ยน เพราะครั้งแรกสุด
 * แผนที่เพิ่งถูกสร้างจากการกดในต้นไม้ — ค่า focus มาถึงก่อน component เกิด
 */
async function ensureFocusVisible() {
  const f = props.focus
  if (f && !markerById.has(f.id) && geo.value && !geo.value.l2Included) {
    await load(true)
    return
  }
  applyFocus()
}

watch(() => props.focus, ensureFocusVisible)

const hasAnything = computed(() => (geo.value?.olts.length ?? 0) > 0)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="relative h-[26rem] overflow-hidden rounded-box border border-base-300 md:h-[32rem]">
      <div ref="el" class="h-full w-full" />

      <div
        v-if="loading || loadingL2"
        class="absolute inset-0 z-[500] grid place-items-center bg-base-100/70 text-sm"
      >
        กำลังโหลด…
      </div>

      <div
        v-else-if="!hasAnything"
        class="absolute inset-0 z-[500] grid place-items-center bg-base-100/85 p-6 text-center text-sm"
      >
        <div>
          <p class="font-medium">สถานีนี้ยังไม่มี OLT ในระบบ</p>
          <p class="mt-1 opacity-70">
            ถ้าหน้างานมี OLT อยู่จริง แปลว่าไฟล์ต้นทางผูกมันไว้กับรหัสสถานีอื่น
          </p>
        </div>
      </div>
    </div>

    <div v-if="error" class="alert alert-error text-sm">{{ error }}</div>

    <div v-if="hasAnything" class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <span
        v-for="k in (['site', 'olt', 'l1', 'l2'] as Kind[])"
        :key="k"
        class="inline-flex items-center gap-1.5"
      >
        <svg class="size-3.5 shrink-0" viewBox="-10 -10 20 20" aria-hidden="true">
          <polygon
            v-if="glyphPoints(SHAPE[k])" :points="glyphPoints(SHAPE[k])"
            :fill="categorical(SLOT[k], theme.resolved === 'dark')"
          />
          <circle v-else r="7" :fill="categorical(SLOT[k], theme.resolved === 'dark')" />
        </svg>
        {{ KIND_LABEL[k] }}
      </span>

    </div>

    <div v-if="geo && hasAnything" class="flex flex-wrap items-center gap-3 text-xs opacity-70">
      <button
        v-if="!geo.l2Included"
        type="button"
        class="btn btn-xs"
        :disabled="loadingL2"
        @click="load(true)"
      >
        แสดง L2 ทั้งหมด ({{ geo.l2Total.toLocaleString() }} จุด)
      </button>

      <span v-if="!geo.l2Included">
        สถานีนี้ใหญ่ผิดปกติ จึงเปิดมาเฉพาะ OLT กับ L1 ก่อน
      </span>

      <span v-if="geo.retired">
        ไม่ได้วาด {{ geo.retired.toLocaleString() }} จุดที่เลิกใช้งานแล้ว — ดูรายตัวได้ในแท็บต้นไม้
      </span>

      <span v-if="geo.noCoord">
        อีก {{ geo.noCoord.toLocaleString() }} จุดยังใช้งานอยู่แต่ไม่มีพิกัด จึงวาดไม่ได้
      </span>

      <span>กดที่หมุดเพื่อไปดูตำแหน่งของมันในต้นไม้</span>
    </div>
  </div>
</template>

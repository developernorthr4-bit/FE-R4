<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import {
  isChildRing, isClosedRing, ROLE_BADGE, ROLE_LABEL, roleColor, sourceRows,
  NODE_LEVEL, NODE_LEVELS, TOPO_BADGE, TOPO_LABEL, type NodeLevel,
} from '../lib/rings'
import { glyphPoints, shapeMarker } from '../lib/shape-marker'
import { SITE_GRADE_BADGE } from '../lib/sites'
import {
  getRing, type RingChild, type RingDetail, type RingMember, type RingTopNode, type RingUplink,
} from '../services/rings.api'

/**
 * รายละเอียดวงเดียว — สมาชิกทั้งวงเรียงตาม hop + ต้นทาง + แผนที่
 *
 * ⚠️ เส้นบนแผนที่คือ "เส้นตรงระหว่างสถานีตามลำดับ hop" ไม่ใช่แนวสายจริง
 *    ตาราง cables ไม่มีคอลัมน์ไหนผูกกับวงเลย (ไฟล์ KML ไม่ได้บอกว่าเส้นไหนของวงไหน)
 *    จึงวาดเป็นเส้นประและเขียนกำกับไว้ใต้แผนที่ ไม่ให้เข้าใจผิดว่าเป็นเส้นทางสายจริง
 *
 * และไม่ลากเส้นปิดวงจากปลายกลับไปหาหัวด้วย แม้จะเป็น ring ปิด — เพราะวงปิดผ่าน
 * โหนดสื่อสัญญาณสองตัว ไม่ใช่มีสายตรงระหว่างสถานีหัวกับสถานีปลาย
 *
 * หมุด uplink อยู่ที่พิกัดของสถานีที่แยกจากชื่อโหนด (ทะเบียนโหนดไม่มีพิกัด)
 * เส้นจาก uplink ไปสมาชิกก็เป็นเส้นตรงเช่นกัน ไม่ใช่แนวสายจริง
 */
const route = useRoute()

const ring = ref<RingDetail | null>(null)
const members = ref<RingMember[]>([])
const children = ref<RingChild[]>([])
const uplinks = ref<RingUplink[]>([])
const ringNodes = ref<RingTopNode[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await getRing(String(route.params.id))
    ring.value = res.ring
    members.value = res.members
    children.value = res.children
    uplinks.value = res.uplinks ?? []
    ringNodes.value = res.ringNodes ?? []
  } catch (err) {
    error.value = errorMessage(err, 'โหลดข้อมูลวงไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, load, { immediate: true })

const rows = computed(() => {
  const r = ring.value
  if (!r) return []
  return sourceRows(r.source, r.topoType, { siteCode: r.anchorSiteCode, siteId: r.anchorSiteId })
})

const withGeo = computed(() => members.value.filter((m) => m.lat !== null && m.lng !== null))
const noGeoCount = computed(() => members.value.length - withGeo.value.length)

const uplinksWithGeo = computed(() => uplinks.value.filter((u) => u.lat !== null && u.lng !== null))
const ringNodesWithGeo = computed(() => ringNodes.value.filter((n) => n.lat !== null && n.lng !== null))
const nodeLevels = computed(() => {
  const present = new Set<NodeLevel>([
    ...uplinks.value.map((u) => u.kind),
    ...ringNodes.value.map((n) => n.level),
  ])
  return NODE_LEVELS.filter((level) => present.has(level))
})

/**
 * หลายโหนดอยู่สถานีเดียวกันได้ (PN-…-1 กับ PN-…-2 หรือ RN กับ PN) — รวมเป็นหมุดเดียว
 * ไม่ให้ป้ายทับกัน และใช้ไอคอนของระดับสูงสุดในสถานีนั้น
 */
const nodeStations = computed(() => {
  type Entry = { level: NodeLevel; nodeCode: string; lat: number; lng: number }
  const bySite = new Map<string, Entry[]>()
  const add = (siteCode: string, entry: Entry) => {
    bySite.set(siteCode, [...(bySite.get(siteCode) ?? []), entry])
  }
  for (const u of uplinksWithGeo.value) {
    add(u.siteCode!, { level: u.kind, nodeCode: u.nodeCode, lat: u.lat!, lng: u.lng! })
  }
  for (const n of ringNodesWithGeo.value) {
    add(n.siteCode!, { level: n.level, nodeCode: `${NODE_LEVEL[n.level].short} ของวง`, lat: n.lat!, lng: n.lng! })
  }
  return [...bySite.entries()].map(([siteCode, entries]) => {
    const levels = NODE_LEVELS.filter((level) => entries.some((e) => e.level === level))
    const top = levels[0]!
    return {
      siteCode,
      lat: entries[0]!.lat,
      lng: entries[0]!.lng,
      level: top,
      label: levels.length === 1
        ? `${NODE_LEVEL[top].label} · ${siteCode}`
        : `${levels.map((level) => NODE_LEVEL[level].short).join(', ')} · ${siteCode}`,
      nodes: [...new Set(entries.map((e) => e.nodeCode))],
    }
  })
})

const nodeGlyph = (level: NodeLevel) => glyphPoints(NODE_LEVEL[level].shape)

/** แถว RN/PN ในการ์ด — BE ตัวเก่าไม่ส่ง ringNodes มา จึงถอยไปใช้ค่าในหัววง */
const topNodeRows = computed(() => (['rn', 'pn'] as const).map((level) => {
  const node = ringNodes.value.find((n) => n.level === level) ?? null
  return {
    level,
    node,
    code: node?.nodeCode ?? (level === 'rn' ? ring.value?.rnNode : ring.value?.pnNode) ?? null,
  }
}))

/** ชื่อโหนดมาจากไฟล์ต้นทาง — ใส่เป็นข้อความล้วน ไม่ส่งเป็น HTML ให้ tooltip */
function tooltipText(text: string): HTMLElement {
  const span = document.createElement('span')
  span.style.whiteSpace = 'pre-line'
  span.textContent = text
  return span
}

/* ---------- แผนที่ ---------- */
const wrap = ref<HTMLDivElement | null>(null)
const el = ref<HTMLDivElement | null>(null)
const isFullscreen = ref(false)
/** Safari บน iPhone ไม่มี requestFullscreen สำหรับ div — ไม่รองรับก็ไม่โชว์ปุ่ม */
const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true
const map = shallowRef<L.Map | null>(null)
const layer = shallowRef<L.LayerGroup | null>(null)
const renderer = shallowRef<L.Canvas | null>(null)

function initMap() {
  if (!el.value || map.value) return
  const m = L.map(el.value, { preferCanvas: true, minZoom: 5, maxZoom: 19, zoomAnimationThreshold: 2 })
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap',
  }).addTo(m)
  // ทุก path/marker ต้องใช้ renderer ตัวเดียวกัน ไม่งั้น canvas ใบบนกลืนคลิก
  renderer.value = L.canvas({ padding: 0.3 })
  layer.value = L.layerGroup().addTo(m)
  map.value = m
  drawMap()
}

function drawMap() {
  const m = map.value
  const g = layer.value
  if (!m || !g) return
  g.clearLayers()
  const rend = renderer.value ?? undefined

  const pts: [number, number][] = withGeo.value.map((x) => [x.lat!, x.lng!])

  if (pts.length >= 2) {
    L.polyline(pts, {
      color: '#64748b', weight: 2, dashArray: '5 5', interactive: false, renderer: rend,
    }).addTo(g)
  }

  // ลากเส้นก่อนหมุด และลากเฉพาะเมื่อ uplink อยู่คนละที่กับสมาชิกที่ต่ออยู่
  uplinksWithGeo.value.forEach((u) => {
    if (u.toLat === null || u.toLng === null) return
    if (u.toLat === u.lat && u.toLng === u.lng) return
    L.polyline([[u.lat!, u.lng!], [u.toLat, u.toLng]], {
      color: NODE_LEVEL[u.kind].color, weight: 2, dashArray: '2 6', interactive: false, renderer: rend,
    }).addTo(g)
  })

  // วาดก่อนหมุดสมาชิก: โหนดที่อยู่สถานีเดียวกับสมาชิกจะเห็นเป็นไอคอนใหญ่หุ้มหมุดนั้น
  nodeStations.value.forEach((s) => {
    const marker = shapeMarker([s.lat, s.lng], {
      shape: NODE_LEVEL[s.level].shape,
      radius: NODE_LEVEL[s.level].radius,
      color: '#ffffff',
      weight: 2,
      fillColor: NODE_LEVEL[s.level].color,
      fillOpacity: 0.95,
      renderer: rend,
    })
      .bindTooltip(tooltipText(s.label), {
        permanent: true, direction: 'right', offset: [14, 0],
      })
      .addTo(g)
    marker.on('mouseover', () => { marker.setTooltipContent(tooltipText(`${s.siteCode}\n${s.nodes.join('\n')}`)) })
    marker.on('mouseout', () => { marker.setTooltipContent(tooltipText(s.label)) })
  })

  withGeo.value.forEach((x) => {
    const isEnd = x.role === 'head' || x.role === 'tail' || x.role === 'anchor'
    L.circleMarker([x.lat!, x.lng!], {
      radius: isEnd ? 9 : 6,
      color: '#ffffff',
      weight: 2,
      fillColor: roleColor(x.role),
      fillOpacity: 0.95,
      renderer: rend,
    })
      .bindTooltip(
        `${x.hopNo ?? '–'} · ${x.siteCode}${x.role ? ` · ${ROLE_LABEL[x.role] ?? x.role}` : ''}`,
        { direction: 'top', offset: [0, -8] },
      )
      .addTo(g)
  })

  fitRing()
}

/**
 * จัดกรอบให้เห็นทั้งวงและ uplink
 *
 * RN/PN ของวงไม่นับเป็นค่าเริ่มต้น เพราะอาจอยู่ไกลข้ามจังหวัด ถ้านับด้วยวงจะเหลือจุดเล็กนิดเดียว
 * ปุ่ม "ดูถึง RN/PN" ส่ง includeTop = true เมื่ออยากเห็นครบทุกชั้น
 */
function fitRing(includeTop = false) {
  const m = map.value
  if (!m) return
  const pts: [number, number][] = [
    ...withGeo.value.map((x): [number, number] => [x.lat!, x.lng!]),
    ...uplinksWithGeo.value.map((u): [number, number] => [u.lat!, u.lng!]),
    ...(includeTop ? ringNodesWithGeo.value.map((n): [number, number] => [n.lat!, n.lng!]) : []),
  ]
  if (pts.length === 1) m.setView(pts[0]!, 13, { animate: false })
  else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.25), { animate: false })
  else m.setView([18.79, 99.0], 7, { animate: false })
}

function destroyMap() {
  map.value?.remove()
  map.value = null
  layer.value = null
  renderer.value = null
}

/*
 * 🪤 กดลิงก์วงแม่/วงลูก = หน้าเดิมต่อ แต่ระหว่างโหลด v-if ถอดกล่องแผนที่ออกแล้วสร้างใหม่
 * ถ้าไม่ทิ้งแผนที่เก่าตอนเริ่มโหลด initMap จะเห็นว่ามี map แล้วไม่สร้างให้กล่องใหม่ = แผนที่ว่าง
 */
watch(loading, async (v) => {
  if (v) { destroyMap(); return }
  await nextTick()
  initMap()
  map.value?.invalidateSize()
  drawMap()
})

/*
 * เต็มจอของเบราว์เซอร์ที่กล่องหุ้ม (ไม่ใช่ div ของ Leaflet) เพื่อให้ปุ่มกับคำอธิบายสีตามเข้าไปด้วย
 * คุมผ่าน fullscreenchange เพราะกด Esc ออกได้โดยไม่ผ่านปุ่ม
 */
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
  // ต้องบอก Leaflet ว่ากล่องเปลี่ยนขนาด แล้วจัดกรอบใหม่ ไม่งั้นวงเล็กอยู่กลางจอใหญ่
  setTimeout(() => {
    map.value?.invalidateSize()
    fitRing()
  }, 60)
}

document.addEventListener('fullscreenchange', onFullscreenChange)
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  destroyMap()
})

/** เปิดทั้งวงใน Google Maps ทีเดียว — ลิงก์รับได้ 10 จุด (เท่าที่ Google รองรับ) */
const gmapsUrl = computed(() => {
  const pts = withGeo.value.slice(0, 10).map((m) => `${m.lat},${m.lng}`)
  if (pts.length < 2) return null
  return `https://www.google.com/maps/dir/${pts.join('/')}`
})
</script>

<template>
  <AppLayout>
    <PageHeader
      :title="ring?.ringCode ?? 'วงสื่อสัญญาณ'"
      :description="ring
        ? `${TOPO_LABEL[ring.topoType ?? ''] ?? ring.topoType ?? 'ไม่ระบุชนิด'} · ${ring.provinceName ?? 'ไม่ระบุจังหวัด'} · ${ring.siteCount} สถานี · ${ring.memberCount} อุปกรณ์ CPE`
        : ''"
    >
      <template #actions>
        <RouterLink to="/rings" class="btn btn-ghost btn-sm">← รายการวง</RouterLink>
        <a v-if="gmapsUrl" :href="gmapsUrl" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">
          เปิดใน Google Maps
        </a>
        <span v-if="ring?.topoType" class="badge" :class="TOPO_BADGE[ring.topoType]">
          {{ TOPO_LABEL[ring.topoType] ?? ring.topoType }}
        </span>
      </template>
    </PageHeader>

    <div v-if="error" class="alert alert-error text-sm">{{ error }}</div>
    <div v-else-if="loading" class="mt-10 flex justify-center">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <div v-else-if="ring" class="grid gap-4 lg:grid-cols-5">
      <!-- ══ บน: แผนที่เต็มความกว้าง ══ -->
      <div class="card border border-base-300 bg-base-100 lg:col-span-5">
        <div class="card-body gap-2 p-4">
          <!-- :class อยู่ที่กล่องหุ้มเท่านั้น ห้ามผูกกับ div ที่ Leaflet ใช้เป็น container -->
          <div
            ref="wrap"
            class="relative h-[65vh] min-h-96 w-full overflow-hidden bg-base-100"
            :class="{ 'rounded-box': !isFullscreen }"
          >
            <div ref="el" class="h-full w-full" />

            <div class="absolute right-3 top-3 z-[800] flex gap-2">
              <button
                v-if="ringNodesWithGeo.length"
                type="button"
                class="btn btn-sm shadow-lg"
                title="ขยายกรอบให้เห็นโหนด RN และ PN ของวงนี้"
                @click="fitRing(true)"
              >
                ดูถึง RN/PN
              </button>
              <button
                v-if="canFullscreen"
                type="button"
                class="btn btn-sm shadow-lg"
                :title="isFullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ'"
                @click="toggleFullscreen"
              >
                {{ isFullscreen ? '⤡ ย่อ' : '⤢ เต็มจอ' }}
              </button>
            </div>

            <!-- อยู่ในกล่องหุ้ม เพื่อให้ยังเห็นตอนเต็มจอ · bottom เว้นไว้ไม่ทับ attribution ของ OSM -->
            <div class="absolute bottom-6 left-3 z-[800] max-w-[calc(100%-1.5rem)] rounded-box border border-base-300 bg-base-100/95 px-2.5 py-1.5 text-xs shadow-lg">
              <div class="flex flex-wrap gap-x-3 gap-y-1">
                <span v-for="r in (['head', 'tail', 'node', 'anchor'] as const)" :key="r" class="flex items-center gap-1">
                  <span class="inline-block size-3 rounded-full" :style="{ background: roleColor(r) }" />
                  {{ ROLE_LABEL[r] }}
                </span>
                <span v-for="level in nodeLevels" :key="level" class="flex items-center gap-1">
                  <svg viewBox="-10 -10 20 20" class="size-3.5" aria-hidden="true">
                    <polygon :points="nodeGlyph(level)" :fill="NODE_LEVEL[level].color" />
                  </svg>
                  {{ NODE_LEVEL[level].label }}
                </span>
              </div>
              <p class="mt-1 opacity-70">เส้นประ = เส้นตรงระหว่างจุด ไม่ใช่แนวสายจริง</p>
            </div>
          </div>
          <p class="text-xs opacity-60">
            เส้นประคือ<strong>เส้นตรงระหว่างสถานีตามลำดับ hop</strong> ไม่ใช่แนวสายจริง —
            ระบบยังไม่รู้ว่าเคเบิลเส้นไหนเป็นของวงไหน
            <template v-if="noGeoCount"> · {{ noGeoCount }} สถานีในวงนี้ไม่มีพิกัด จึงไม่มีหมุด</template>
            <template v-if="uplinks.length || ringNodes.length"> · หมุดโหนดอยู่ที่พิกัดของสถานีตามรหัส ไม่ใช่พิกัดของตัวโหนด</template>
          </p>
        </div>
      </div>

      <!-- ══ ซ้าย: ต้นทาง + โหนด + วงแม่/วงลูก ══ -->
      <div class="grid content-start gap-4 lg:col-span-2">
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2 p-4 text-sm">
            <h2 class="text-sm font-semibold">ต้นทางของวงนี้</h2>
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <template v-for="r in rows" :key="r.label">
                <dt class="opacity-60">{{ r.label }}</dt>
                <dd class="min-w-0">
                  <RouterLink v-if="r.value && r.siteId" :to="`/sites/${r.siteId}/edit`"
                    class="link link-hover break-all font-mono">{{ r.value }}</RouterLink>
                  <span v-else-if="r.value" class="break-all font-mono">{{ r.value }}</span>
                  <span v-else class="opacity-40">ไม่ระบุ</span>
                  <p v-if="r.hint" class="text-xs opacity-50">{{ r.hint }}</p>
                </dd>
              </template>
            </dl>

            <p v-if="ring.warnings.noHead" class="rounded bg-warning/15 px-2 py-1.5 text-xs">
              ไฟล์ CPE ring ไม่ได้บอก uplink ของวงนี้ จึงไม่รู้ว่าต้นทางคือที่ไหน —
              ระบบไม่เดาจาก hop 1 ให้ เพราะการเดาทำให้ทีมหน้างานไปผิดที่
            </p>
            <p v-if="ring.warnings.dupHop" class="rounded bg-warning/15 px-2 py-1.5 text-xs">
              วงนี้มีเลข hop ซ้ำกันในไฟล์ต้นทาง ลำดับที่เห็นจึงอาจไม่ใช่ลำดับสายจริง
            </p>
          </div>
        </div>

        <div v-if="uplinks.length" class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2 p-4 text-sm">
            <h2 class="text-sm font-semibold">Uplink ({{ uplinks.length }})</h2>
            <ul class="flex flex-col divide-y divide-base-300">
              <li v-for="u in uplinks" :key="`${u.nodeCode}|${u.toSiteId}`" class="py-2 first:pt-0 last:pb-0">
                <div class="flex items-start gap-2">
                  <svg viewBox="-10 -10 20 20" class="mt-0.5 size-3.5 shrink-0" aria-hidden="true">
                    <polygon :points="nodeGlyph(u.kind)" :fill="NODE_LEVEL[u.kind].color" />
                  </svg>
                  <div class="min-w-0">
                    <p class="break-all font-mono text-xs">{{ u.nodeCode }}</p>
                    <p class="text-xs">
                      <span class="opacity-60">{{ NODE_LEVEL[u.kind].label }} · สถานี </span>
                      <RouterLink v-if="u.siteId" :to="`/sites/${u.siteId}/edit`" class="link link-hover font-mono">
                        {{ u.siteCode }}
                      </RouterLink>
                      <span v-else-if="u.siteCode" class="font-mono">{{ u.siteCode }}</span>
                      <span v-else class="opacity-40">แยกรหัสไม่ได้</span>
                      <span v-if="u.siteCode && !u.siteId" class="ml-1 text-warning">ไม่พบในทะเบียน</span>
                      <span v-else-if="u.siteId && (u.lat === null || u.lng === null)" class="ml-1 text-warning">ไม่มีพิกัด</span>
                    </p>
                    <p class="text-xs opacity-60">
                      ต่อกับ
                      <RouterLink :to="`/sites/${u.toSiteId}/edit`" class="link link-hover font-mono">{{ u.toSiteCode }}</RouterLink>
                      (hop {{ u.toHopNo ?? '–' }}<template v-if="u.side === 'B'"> · ฝั่ง B</template>)
                    </p>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2 p-4 text-sm">
            <h2 class="text-sm font-semibold">โหนดสื่อสัญญาณชั้นบน</h2>
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <template v-for="row in topNodeRows" :key="row.level">
                <dt class="flex items-center gap-1 opacity-60">
                  <svg viewBox="-10 -10 20 20" class="size-3.5 shrink-0" aria-hidden="true">
                    <polygon :points="nodeGlyph(row.level)" :fill="NODE_LEVEL[row.level].color" />
                  </svg>
                  {{ NODE_LEVEL[row.level].label }}
                </dt>
                <dd>
                  <RouterLink v-if="row.node?.siteId" :to="`/sites/${row.node.siteId}/edit`" class="link link-hover font-mono">
                    {{ row.code }}
                  </RouterLink>
                  <span v-else class="font-mono">{{ row.code ?? '—' }}</span>
                  <span v-if="row.node && !row.node.siteCode" class="ml-1 text-xs text-warning">ไม่ใช่รหัสสถานีเต็ม</span>
                  <span v-else-if="row.node && !row.node.siteId" class="ml-1 text-xs text-warning">ไม่พบในทะเบียน</span>
                  <span v-else-if="row.node && (row.node.lat === null || row.node.lng === null)" class="ml-1 text-xs text-warning">ไม่มีพิกัด</span>
                </dd>
              </template>
              <dt class="opacity-60">hop ในไฟล์</dt>
              <dd>{{ ring.hopCount }}</dd>
            </dl>
            <p class="text-xs opacity-50">
              ไฟล์ไม่ได้บอกว่า RN/PN ของวงต่อกับสมาชิกตัวไหน จึงมีแค่หมุด ไม่ได้ลากเส้น
            </p>
          </div>
        </div>

        <div v-if="ring.parentRingId || children.length" class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2 p-4 text-sm">
            <h2 class="text-sm font-semibold">วงแม่ / วงลูก</h2>

            <p v-if="ring.parentRingId">
              <span class="opacity-60">วงนี้เป็นวงลูกของ </span>
              <RouterLink :to="`/rings/${ring.parentRingId}`" class="link link-hover font-mono">
                {{ ring.parentRingCode }}
              </RouterLink>
              <span v-if="ring.parentTopoType" class="ml-1 opacity-60">
                ({{ TOPO_LABEL[ring.parentTopoType] ?? ring.parentTopoType }})
              </span>
            </p>

            <ul v-if="children.length" class="flex flex-col gap-1">
              <li class="opacity-60">วงลูกที่เกาะวงนี้ {{ children.length }} วง</li>
              <li v-for="ch in children" :key="ch.id" class="flex flex-wrap items-center gap-2">
                <RouterLink :to="`/rings/${ch.id}`" class="link link-hover font-mono">{{ ch.ringCode }}</RouterLink>
                <span v-if="ch.topoType" class="badge badge-sm" :class="TOPO_BADGE[ch.topoType]">
                  {{ TOPO_LABEL[ch.topoType] ?? ch.topoType }}
                </span>
                <span class="text-xs opacity-60">
                  {{ ch.memberCount }} ตัว<template v-if="ch.anchorSiteCode"> · เกาะที่ {{ ch.anchorSiteCode }}</template>
                </span>
              </li>
            </ul>
          </div>
        </div>

        <p v-if="isChildRing(ring.topoType)" class="px-1 text-xs opacity-60">
          วงลูกนับ hop 0 เป็น "จุดเกาะ" ซึ่งเป็นอุปกรณ์ที่อยู่บนวงแม่ ไม่ใช่สมาชิกของวงลูกจริง ๆ
        </p>
        <p v-else-if="isClosedRing(ring.topoType)" class="px-1 text-xs opacity-60">
          วงปิด — ออกได้สองทาง สายขาดกลางวงลูกค้าอาจยังไม่ล่มเพราะวิ่งอ้อมอีกทางได้
        </p>
        <p v-else class="px-1 text-xs opacity-60">
          วงเปิด — ทางออกทางเดียว สายขาดที่ไหน สถานีถัดจากจุดนั้นไปดับทั้งหมด
        </p>
      </div>

      <!-- ══ ขวา: ตารางสมาชิก ══ -->
      <div class="grid content-start gap-4 lg:col-span-3">
        <div class="overflow-x-auto rounded-lg border border-base-300">
          <table class="table table-sm">
            <thead>
              <tr>
                <th class="text-right">hop</th>
                <th>สถานี</th>
                <th>เกรด</th>
                <th>บทบาท</th>
                <th>อุปกรณ์ CPE</th>
                <th>uplink</th>
                <th>พิกัด</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in members" :key="m.memberId" class="hover">
                <td class="text-right font-mono opacity-70">{{ m.hopNo ?? '–' }}</td>
                <td>
                  <RouterLink :to="`/sites/${m.siteId}/edit`" class="link link-hover font-mono">
                    {{ m.siteCode }}
                  </RouterLink>
                  <p class="text-xs opacity-60">{{ m.provinceName ?? '—' }}</p>
                </td>
                <td>
                  <span v-if="m.siteGrade" class="badge badge-sm" :class="SITE_GRADE_BADGE[m.siteGrade] ?? 'badge-neutral'">
                    {{ m.siteGrade }}
                  </span>
                  <span v-else class="opacity-40">—</span>
                </td>
                <td>
                  <span v-if="m.role" class="badge badge-sm" :class="ROLE_BADGE[m.role]">
                    {{ ROLE_LABEL[m.role] ?? m.role }}
                  </span>
                  <span v-else class="opacity-40">—</span>
                  <p v-if="m.roleSource === 'manual'" class="text-xs opacity-50">แก้ด้วยมือ</p>
                </td>
                <td class="text-xs">
                  <p class="font-mono">{{ m.cpeName }}</p>
                  <p class="opacity-60">{{ m.neType ?? '—' }}<template v-if="m.mgmtIp"> · {{ m.mgmtIp }}</template></p>
                </td>
                <td class="max-w-48 truncate font-mono text-xs" :title="[m.uplinkA, m.uplinkB].filter(Boolean).join(' / ')">
                  <template v-if="m.uplinkA || m.uplinkB">
                    <p v-if="m.uplinkA">{{ m.uplinkA }}</p>
                    <p v-if="m.uplinkB">{{ m.uplinkB }}</p>
                  </template>
                  <span v-else class="font-sans opacity-40">—</span>
                </td>
                <td class="font-mono text-xs opacity-70">
                  <span v-if="m.lat !== null && m.lng !== null">{{ m.lat.toFixed(5) }}, {{ m.lng.toFixed(5) }}</span>
                  <span v-else class="font-sans text-warning">ไม่มีพิกัด</span>
                </td>
              </tr>

              <tr v-if="!members.length">
                <td colspan="7" class="py-6 text-center text-sm opacity-70">
                  วงนี้ไม่มีสมาชิกที่ยังใช้งานอยู่
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

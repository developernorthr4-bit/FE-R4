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
  TOPO_BADGE, TOPO_LABEL,
} from '../lib/rings'
import { SITE_GRADE_BADGE } from '../lib/sites'
import { getRing, type RingChild, type RingDetail, type RingMember } from '../services/rings.api'

/**
 * รายละเอียดวงเดียว — สมาชิกทั้งวงเรียงตาม hop + ต้นทาง + แผนที่
 *
 * ⚠️ เส้นบนแผนที่คือ "เส้นตรงระหว่างสถานีตามลำดับ hop" ไม่ใช่แนวสายจริง
 *    ตาราง cables ไม่มีคอลัมน์ไหนผูกกับวงเลย (ไฟล์ KML ไม่ได้บอกว่าเส้นไหนของวงไหน)
 *    จึงวาดเป็นเส้นประและเขียนกำกับไว้ใต้แผนที่ ไม่ให้เข้าใจผิดว่าเป็นเส้นทางสายจริง
 *
 * และไม่ลากเส้นปิดวงจากปลายกลับไปหาหัวด้วย แม้จะเป็น ring ปิด — เพราะวงปิดผ่าน
 * โหนดสื่อสัญญาณสองตัว ไม่ใช่มีสายตรงระหว่างสถานีหัวกับสถานีปลาย
 */
const route = useRoute()

const ring = ref<RingDetail | null>(null)
const members = ref<RingMember[]>([])
const children = ref<RingChild[]>([])
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

/* ---------- แผนที่เล็ก ---------- */
const el = ref<HTMLDivElement | null>(null)
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

  if (pts.length === 1) m.setView(pts[0]!, 13, { animate: false })
  else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.25), { animate: false })
  else m.setView([18.79, 99.0], 7, { animate: false })
}

watch(loading, async (v) => {
  if (!v) { await nextTick(); initMap(); map.value?.invalidateSize(); drawMap() }
})
onBeforeUnmount(() => { map.value?.remove(); map.value = null })

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

        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2 p-4 text-sm">
            <h2 class="text-sm font-semibold">โหนดสื่อสัญญาณชั้นบน</h2>
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt class="opacity-60">RN</dt>
              <dd class="font-mono">{{ ring.rnNode ?? '—' }}</dd>
              <dt class="opacity-60">PN</dt>
              <dd class="font-mono">{{ ring.pnNode ?? '—' }}</dd>
              <dt class="opacity-60">hop ในไฟล์</dt>
              <dd>{{ ring.hopCount }}</dd>
            </dl>
            <p class="text-xs opacity-50">
              ทะเบียนโหนดไม่มีพิกัด จึงแสดงเป็นรหัสอย่างเดียว วาดบนแผนที่ไม่ได้
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

      <!-- ══ ขวา: แผนที่ + ตารางสมาชิก ══ -->
      <div class="grid content-start gap-4 lg:col-span-3">
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2 p-4">
            <div ref="el" class="h-72 w-full rounded-box" />
            <p class="text-xs opacity-60">
              เส้นประคือ<strong>เส้นตรงระหว่างสถานีตามลำดับ hop</strong> ไม่ใช่แนวสายจริง —
              ระบบยังไม่รู้ว่าเคเบิลเส้นไหนเป็นของวงไหน
              <template v-if="noGeoCount"> · {{ noGeoCount }} สถานีในวงนี้ไม่มีพิกัด จึงไม่มีหมุด</template>
            </p>
            <div class="flex flex-wrap gap-3 text-xs">
              <span v-for="r in (['head', 'tail', 'node', 'anchor'] as const)" :key="r" class="flex items-center gap-1">
                <span class="inline-block size-3 rounded-full" :style="{ background: roleColor(r) }" />
                {{ ROLE_LABEL[r] }}
              </span>
            </div>
          </div>
        </div>

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

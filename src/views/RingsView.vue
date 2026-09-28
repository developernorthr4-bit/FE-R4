<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import StatTile from '../components/charts/StatTile.vue'
import { errorMessage } from '../lib/api'
import { RING_TOPOS, TOPO_BADGE, TOPO_LABEL } from '../lib/rings'
import { loadProvinces, type Province } from '../services/provinces.api'
import { getRingSummary, listRings, type RingPage, type RingSummary } from '../services/rings.api'

/**
 * รายการวงสื่อสัญญาณทั้งภาค
 *
 * ช่องค้นหารับได้ทั้งรหัสวงและ "รหัสสถานี" โดยตั้งใจ — คนหน้างานเริ่มจากสถานี
 * ที่มีปัญหา ไม่ได้เริ่มจากรหัสวงซึ่งไม่มีใครจำ พิมพ์ CMI0072 แล้วได้วงที่สถานีนั้น
 * อยู่ คือทางเข้าที่ใช้จริงของหน้านี้
 *
 * แก้จากหน้านี้ไม่ได้เลย ข้อมูลวงมาจากไฟล์ CPE ring ทางเดียว
 */
const PAGE_SIZE = 25

const summary = ref<RingSummary | null>(null)
const page = ref<RingPage | null>(null)
const provinces = ref<Province[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const q = ref('')
const province = ref('')
const topo = ref('')
const noHead = ref(false)
const offset = ref(0)

async function load() {
  loading.value = true
  error.value = null
  try {
    page.value = await listRings({
      q: q.value.trim() || undefined,
      province: province.value ? Number(province.value) : undefined,
      topo: topo.value || undefined,
      noHead: noHead.value ? '1' : undefined,
      limit: PAGE_SIZE,
      offset: offset.value,
    })
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายการวงไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const [provs, sum] = await Promise.allSettled([loadProvinces(), getRingSummary()])
  if (provs.status === 'fulfilled') provinces.value = provs.value
  // ตัวเลขสรุปหายไม่ใช่เรื่องคอขาดบาดตาย ตารางข้างล่างยังใช้ได้ตามปกติ
  if (sum.status === 'fulfilled') summary.value = sum.value
  await load()
})

/* เปลี่ยนตัวกรองต้องกลับหน้าแรก — แต่ถ้า offset เป็น 0 อยู่แล้ว watch ไม่ยิง
   จึงต้องเรียก load() เอง (แพตเทิร์นเดียวกับ OnlineOrphansView) */
function reload() {
  if (offset.value !== 0) offset.value = 0
  else void load()
}

watch(offset, load)
watch([province, topo, noHead], reload)

let timer: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(reload, 300)
})

const from = computed(() => (page.value?.total ? offset.value + 1 : 0))
const to = computed(() => Math.min(offset.value + PAGE_SIZE, page.value?.total ?? 0))

const topoCount = computed(() => {
  const m = new Map<string, number>()
  for (const r of summary.value?.byTopo ?? []) if (r.topoType) m.set(r.topoType, r.n)
  return m
})
</script>

<template>
  <AppLayout>
    <PageHeader
      title="วงสื่อสัญญาณ"
      description="สถานีนี้อยู่วงไหน · ใครอยู่ในวงเดียวกัน · ต้นทางของวงคือที่ไหน — ค้นด้วยรหัสวงหรือรหัสสถานีก็ได้"
    />

    <div v-if="summary" class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile label="วงทั้งหมด" :value="summary.total.toLocaleString()" goodWhen="neutral"
        :hint="`วงลูกที่เกาะวงแม่ ${summary.children.toLocaleString()} วง`" />
      <StatTile label="สถานีที่อยู่ในวง" :value="summary.sitesWithRing.toLocaleString()" goodWhen="neutral"
        hint="นับจากอุปกรณ์ CPE ที่ยังอยู่ในวงตอนนี้" />
      <StatTile label="สถานีที่ยังไม่มีวง" :value="summary.sitesWithoutRing.toLocaleString()" goodWhen="neutral"
        hint="ไม่มี CPE ในไฟล์ ring เลย — ไม่ใช่ระบบหาไม่เจอ" />
      <StatTile label="วงที่ไม่รู้ต้นทาง" :value="summary.withoutHead.toLocaleString()" goodWhen="neutral"
        hint="ไฟล์ต้นทางไม่ได้ให้ uplink มา กดตัวกรองด้านล่างเพื่อดูรายการ" />
    </div>

    <div class="mb-4 flex flex-wrap items-end gap-3">
      <label class="form-control">
        <span class="label-text mb-1 block text-sm">ค้นหา</span>
        <input v-model="q" type="search" class="input input-bordered input-sm w-64"
          placeholder="รหัสวง หรือรหัสสถานีในวง">
      </label>

      <label class="form-control">
        <span class="label-text mb-1 block text-sm">จังหวัด</span>
        <select v-model="province" class="select select-bordered select-sm w-44">
          <option value="">ทุกจังหวัด</option>
          <option v-for="p in provinces" :key="p.id" :value="String(p.id)">{{ p.nameTh }}</option>
        </select>
      </label>

      <label class="form-control">
        <span class="label-text mb-1 block text-sm">ชนิดวง</span>
        <select v-model="topo" class="select select-bordered select-sm w-52">
          <option value="">ทุกชนิด</option>
          <option v-for="t in RING_TOPOS" :key="t" :value="t">
            {{ TOPO_LABEL[t] }}<template v-if="topoCount.get(t)"> ({{ topoCount.get(t) }})</template>
          </option>
        </select>
      </label>

      <label class="label cursor-pointer gap-2 text-sm">
        <input v-model="noHead" type="checkbox" class="checkbox checkbox-sm">
        <span>เฉพาะวงที่ไม่รู้ต้นทาง</span>
      </label>
    </div>

    <div v-if="error" class="alert alert-error text-sm">{{ error }}</div>

    <p v-else-if="loading" class="text-sm opacity-70">กำลังโหลด…</p>

    <template v-else-if="page">
      <div class="overflow-x-auto rounded-lg border border-base-300">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>รหัสวง</th>
              <th>ชนิด</th>
              <th>จังหวัด</th>
              <th class="text-right">สถานี</th>
              <th>โหนดต้นทาง</th>
              <th>สถานีหัววง</th>
              <th>วงแม่ / วงลูก</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in page.rings" :key="r.id" class="hover">
              <td>
                <RouterLink :to="`/rings/${r.id}`" class="link link-hover font-mono">{{ r.ringCode }}</RouterLink>
              </td>
              <td>
                <span v-if="r.topoType" class="badge badge-sm" :class="TOPO_BADGE[r.topoType]">
                  {{ TOPO_LABEL[r.topoType] ?? r.topoType }}
                </span>
                <span v-else class="opacity-40">—</span>
              </td>
              <td>{{ r.provinceName ?? '—' }}</td>
              <td class="text-right">{{ r.siteCount }}</td>
              <td class="max-w-56 truncate font-mono text-xs" :title="r.sourceNode ?? ''">
                <span v-if="r.sourceNode">{{ r.sourceNode }}</span>
                <span v-else class="font-sans opacity-40">ไม่ระบุ</span>
              </td>
              <td>
                <RouterLink v-if="r.headSiteId" :to="`/sites/${r.headSiteId}/edit`"
                  class="link link-hover font-mono text-xs">{{ r.headSiteCode }}</RouterLink>
                <span v-else class="opacity-40">—</span>
              </td>
              <td class="text-xs">
                <RouterLink v-if="r.parentRingId" :to="`/rings/${r.parentRingId}`" class="link link-hover font-mono">
                  ↑ {{ r.parentRingCode }}
                </RouterLink>
                <span v-else-if="r.childCount" class="opacity-70">มีวงลูก {{ r.childCount }} วง</span>
                <span v-else class="opacity-40">—</span>
              </td>
            </tr>

            <tr v-if="!page.rings.length">
              <td colspan="7" class="py-6 text-center text-sm opacity-70">ไม่พบวงตามเงื่อนไขนี้</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span class="opacity-70">แสดง {{ from }}–{{ to }} จาก {{ page.total.toLocaleString() }}</span>
        <div class="join">
          <button type="button" class="btn btn-sm join-item" :disabled="offset === 0"
            @click="offset = Math.max(offset - PAGE_SIZE, 0)">ก่อนหน้า</button>
          <button type="button" class="btn btn-sm join-item" :disabled="offset + PAGE_SIZE >= page.total"
            @click="offset = offset + PAGE_SIZE">ถัดไป</button>
        </div>
      </div>

      <p class="mt-6 text-sm opacity-70">
        ข้อมูลวงมาจากไฟล์ CPE ring ทางเดียว แก้ที่หน้าจอไม่ได้ — ถ้าลำดับหรือต้นทางไม่ตรงกับหน้างาน
        ต้องแก้ที่ไฟล์ต้นทางแล้ว import ใหม่
      </p>
    </template>
  </AppLayout>
</template>

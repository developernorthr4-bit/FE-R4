<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import SiteMap from '../components/SiteMap.vue'
import { errorMessage } from '../lib/api'
import { categorical } from '../lib/palette'
import { loadProvinces, type Province } from '../services/provinces.api'
import {
  getSiteDetail, getSiteSummary, loadMapSites,
  type MapSite, type SiteDetail, type SiteDevice, type SiteFrequency, type SiteSummary,
} from '../services/sites.api'
import { useThemeStore } from '../stores/theme'

/**
 * แผนที่ติดตามสถานีทั้งภาคเหนือ
 *
 * โหลดสถานีทั้ง 7,300 แห่งครั้งเดียวแล้วกรองในเครื่อง — การกรองทุกครั้งหลังจากนั้น
 * เป็น 0 ms ไม่ต้องยิงข้ามทวีป
 */
const theme = useThemeStore()

const all = ref<MapSite[]>([])
const summary = ref<SiteSummary | null>(null)
const provinces = ref<Province[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const term = ref('')
const provinceFilter = ref('')
const operatorFilter = ref('')
/** true = แสดงเฉพาะสถานีที่ยังไม่มีข้อมูลความถี่ (worklist ของทีมสำรวจ) */
const onlyMissingFreq = ref(false)

const selectedId = ref<string | null>(null)
const detail = ref<{ site: SiteDetail; frequencies: SiteFrequency[]; devices: SiteDevice[] } | null>(null)
const detailLoading = ref(false)

const provinceName = computed(() => new Map(provinces.value.map((p) => [p.id, p.nameTh])))
const operatorSlot = computed(
  () => new Map((summary.value?.operators ?? []).map((o) => [o.id, o.colorSlot])),
)
const filtered = computed(() => {
  const q = term.value.trim().toUpperCase()
  const pid = provinceFilter.value ? Number(provinceFilter.value) : null
  const oid = operatorFilter.value === '' ? null : Number(operatorFilter.value)

  return all.value.filter((s) => {
    if (pid !== null && s.p !== pid) return false
    // -1 = "ยังไม่ระบุค่าย" ใช้ค่าพิเศษเพราะ null เป็นค่าที่ต้องกรองได้จริง
    if (oid !== null && (oid === -1 ? s.o !== null : s.o !== oid)) return false
    if (onlyMissingFreq.value && s.b > 0) return false
    if (q && !s.c.includes(q)) return false
    return true
  })
})

/** ไม่มีพิกัด = ไม่โผล่บนแผนที่ ต้องเข้าถึงผ่านรายการด้านข้างเท่านั้น */
const noCoords = computed(() => filtered.value.filter((s) => s.lat === null).length)

/** แสดงในรายการแค่ 200 แถวแรก — เลื่อน 7,300 แถวไม่มีใครอ่าน ให้ใช้ช่องค้นหาแทน */
const LIST_CAP = 200
const listed = computed(() => filtered.value.slice(0, LIST_CAP))

onMounted(async () => {
  try {
    const [sites, sum, provs] = await Promise.all([
      loadMapSites(), getSiteSummary(), loadProvinces(),
    ])
    all.value = sites
    summary.value = sum
    provinces.value = provs
  } catch (err) {
    error.value = errorMessage(err, 'โหลดข้อมูลสถานีไม่สำเร็จ')
  } finally {
    loading.value = false
  }
})

watch(selectedId, async (id) => {
  if (!id) { detail.value = null; return }
  detailLoading.value = true
  try {
    detail.value = await getSiteDetail(id)
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายละเอียดสถานีไม่สำเร็จ')
    detail.value = null
  } finally {
    detailLoading.value = false
  }
})

function colorOf(operatorId: number | null): string {
  return categorical(
    operatorId === null ? null : operatorSlot.value.get(operatorId) ?? null,
    theme.resolved === 'dark',
  )
}

function clearFilters() {
  term.value = ''
  provinceFilter.value = ''
  operatorFilter.value = ''
  onlyMissingFreq.value = false
}
</script>

<template>
  <AppLayout>
    <PageHeader
      title="สถานีในภาคเหนือ"
      :description="summary
        ? `${summary.totals.total.toLocaleString()} สถานี · มีพิกัด ${summary.totals.withLatLng.toLocaleString()} · ยังไม่มีข้อมูลความถี่ ${summary.totals.withoutFrequency.toLocaleString()}`
        : 'กำลังโหลด…'"
    />

    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm">
      <span>{{ error }}</span>
    </div>

    <div v-if="loading" class="flex justify-center py-20">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <template v-else>
      <!-- ตัวกรองอยู่แถวเดียวเหนือแผนที่ -->
      <div class="card mb-4 border border-base-300 bg-base-100">
        <div class="card-body p-4">
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label class="form-control">
              <span class="label-text text-xs opacity-70">ค้นหารหัสสถานี</span>
              <input
                v-model="term" type="search" placeholder="เช่น CMI0003"
                class="input input-sm input-bordered w-full"
              />
            </label>

            <label class="form-control">
              <span class="label-text text-xs opacity-70">จังหวัด</span>
              <select v-model="provinceFilter" class="select select-sm select-bordered w-full">
                <option value="">ทุกจังหวัด</option>
                <option v-for="p in provinces" :key="p.id" :value="String(p.id)">{{ p.nameTh }}</option>
              </select>
            </label>

            <label class="form-control">
              <span class="label-text text-xs opacity-70">ค่าย</span>
              <select v-model="operatorFilter" class="select select-sm select-bordered w-full">
                <option value="">ทุกค่าย</option>
                <option v-for="o in summary?.operators" :key="o.id" :value="String(o.id)">
                  {{ o.name }} ({{ o.count.toLocaleString() }})
                </option>
                <option value="-1">
                  ยังไม่ระบุ ({{ summary?.totals.withoutOperator.toLocaleString() }})
                </option>
              </select>
            </label>

            <div class="flex items-end justify-between gap-2">
              <label class="label cursor-pointer justify-start gap-2">
                <input v-model="onlyMissingFreq" type="checkbox" class="checkbox checkbox-sm" />
                <span class="label-text text-xs">เฉพาะที่ยังไม่มีความถี่</span>
              </label>
              <button type="button" class="btn btn-sm btn-ghost" @click="clearFilters">ล้าง</button>
            </div>
          </div>

          <!--
            legend — สีต้องไม่ใช่ช่องทางสื่อความหมายช่องเดียว
            ตอนนี้ยังไม่มีข้อมูลค่ายเลย จึงมีแต่ "ยังไม่ระบุ" ที่มีจำนวนจริง
          -->
          <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <span
              v-for="o in summary?.operators" :key="o.id"
              class="inline-flex items-center gap-1.5"
            >
              <span class="size-2.5 rounded-full" :style="{ background: colorOf(o.id) }" />
              {{ o.name }} {{ o.count.toLocaleString() }}
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="size-2.5 rounded-full" :style="{ background: colorOf(null) }" />
              ยังไม่ระบุค่าย {{ summary?.totals.withoutOperator.toLocaleString() }}
            </span>
            <span class="inline-flex items-center gap-1.5 opacity-70">
              <span class="size-2.5 rounded-full opacity-40" :style="{ background: colorOf(null) }" />
              จุดจาง = ยังไม่มีข้อมูลความถี่
            </span>
          </div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <!-- แผนที่ -->
        <div class="card overflow-hidden border border-base-300 bg-base-100">
          <div class="h-[32rem] lg:h-[38rem]">
            <SiteMap
              :sites="filtered"
              :operator-slot="operatorSlot"
              :selected-id="selectedId"
              @select="selectedId = $event"
            />
          </div>
        </div>

        <!-- แผงข้าง: รายละเอียดถ้าเลือกอยู่ ไม่งั้นเป็นรายการให้เลือก -->
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-3 p-4">
            <template v-if="selectedId">
              <div class="flex items-start justify-between gap-2">
                <div v-if="detail">
                  <p class="text-lg font-semibold">{{ detail.site.siteCode }}</p>
                  <p class="text-sm opacity-70">
                    {{ detail.site.provinceName }}
                    <template v-if="detail.site.districtName"> · {{ detail.site.districtName }}</template>
                  </p>
                </div>
                <p v-else class="text-sm opacity-70">กำลังโหลด…</p>
                <button type="button" class="btn btn-xs btn-ghost" @click="selectedId = null">
                  ✕ ปิด
                </button>
              </div>

              <div v-if="detailLoading" class="flex justify-center py-8">
                <span class="loading loading-spinner opacity-60" />
              </div>

              <template v-else-if="detail">
                <div class="flex flex-wrap gap-1.5">
                  <span
                    class="badge badge-sm"
                    :style="{
                      background: colorOf(detail.site.operatorId),
                      color: '#fff',
                      borderColor: 'transparent',
                    }"
                  >
                    {{ detail.site.operatorName ?? 'ยังไม่ระบุค่าย' }}
                  </span>
                  <span class="badge badge-sm badge-ghost">{{ detail.site.status }}</span>
                  <span v-if="detail.site.isVerified" class="badge badge-sm badge-success">
                    ตรวจสอบแล้ว
                  </span>
                </div>

                <!-- ความถี่ — สิ่งที่ขอมาเป็นหลัก -->
                <div>
                  <p class="text-sm font-medium">
                    ความถี่ ({{ detail.frequencies.length }} ย่าน)
                  </p>
                  <div v-if="detail.frequencies.length" class="mt-2 overflow-x-auto">
                    <table class="table table-xs">
                      <thead>
                        <tr><th>ย่าน</th><th>เทคโนโลยี</th><th>Band</th><th class="text-right">MHz</th></tr>
                      </thead>
                      <tbody>
                        <tr v-for="f in detail.frequencies" :key="f.id">
                          <td class="font-medium">{{ f.code }}</td>
                          <td class="opacity-70">{{ f.tech ?? '—' }}</td>
                          <td class="opacity-70">{{ f.bandLabel ?? '—' }}</td>
                          <td class="text-right tabular-nums">{{ f.nominalMhz ?? '—' }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p v-else class="mt-1 text-sm opacity-60">ยังไม่มีข้อมูลความถี่ของสถานีนี้</p>
                </div>

                <!-- อุปกรณ์สื่อสัญญาณ + วงที่สังกัด -->
                <div>
                  <p class="text-sm font-medium">อุปกรณ์สื่อสัญญาณ ({{ detail.devices.length }})</p>
                  <ul v-if="detail.devices.length" class="mt-1.5 flex flex-col gap-1.5">
                    <li
                      v-for="d in detail.devices" :key="d.id"
                      class="rounded-field bg-base-200 px-2.5 py-1.5 text-xs"
                    >
                      <p class="font-medium">{{ d.cpeName }}</p>
                      <p class="opacity-70">
                        {{ d.neType ?? '—' }}
                        <template v-if="d.mgmtIp"> · {{ d.mgmtIp }}</template>
                      </p>
                      <p v-if="d.ringCode" class="opacity-70">
                        วง {{ d.ringCode }}
                        <template v-if="d.topoType"> ({{ d.topoType }})</template>
                        <template v-if="d.hopNo !== null"> · hop {{ d.hopNo }}</template>
                        <template v-if="d.role"> · {{ d.role }}</template>
                      </p>
                    </li>
                  </ul>
                  <p v-else class="mt-1 text-sm opacity-60">ไม่มีอุปกรณ์ผูกกับสถานีนี้</p>
                </div>

                <p v-if="detail.site.lat !== null" class="text-xs opacity-60">
                  พิกัด {{ detail.site.lat.toFixed(5) }}, {{ detail.site.lng!.toFixed(5) }}
                </p>
                <p v-else class="text-xs text-warning">สถานีนี้ไม่มีพิกัด จึงไม่ปรากฏบนแผนที่</p>
              </template>
            </template>

            <template v-else>
              <div class="flex items-baseline justify-between">
                <p class="text-sm font-medium">{{ filtered.length.toLocaleString() }} สถานี</p>
                <p v-if="noCoords" class="text-xs text-warning">ไม่มีพิกัด {{ noCoords }}</p>
              </div>
              <p class="text-xs opacity-60">คลิกหมุดบนแผนที่ หรือเลือกจากรายการด้านล่าง</p>

              <ul class="-mx-1 max-h-[30rem] overflow-y-auto">
                <li v-for="s in listed" :key="s.i">
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded-field px-2 py-1.5 text-left text-sm hover:bg-base-200"
                    @click="selectedId = s.i"
                  >
                    <span class="size-2.5 shrink-0 rounded-full" :style="{ background: colorOf(s.o) }" />
                    <span class="font-medium">{{ s.c }}</span>
                    <span class="truncate opacity-60">{{ provinceName.get(s.p) ?? 'นอกขอบเขต' }}</span>
                    <span class="ml-auto shrink-0 text-xs opacity-60">
                      {{ s.b ? `${s.b} ย่าน` : 'ไม่มีความถี่' }}
                    </span>
                    <span v-if="s.lat === null" class="shrink-0 text-xs text-warning">ไม่มีพิกัด</span>
                  </button>
                </li>
              </ul>

              <p v-if="filtered.length > LIST_CAP" class="text-xs opacity-60">
                แสดง {{ LIST_CAP }} จาก {{ filtered.length.toLocaleString() }} รายการ —
                ใช้ช่องค้นหาหรือตัวกรองเพื่อแคบผลลง
              </p>
              <p v-else-if="!filtered.length" class="text-sm opacity-60">
                ไม่พบสถานีตามเงื่อนไขนี้
              </p>
            </template>
          </div>
        </div>
      </div>
    </template>
  </AppLayout>
</template>

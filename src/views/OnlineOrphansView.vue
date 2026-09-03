<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import StatTile from '../components/charts/StatTile.vue'
import { errorMessage } from '../lib/api'
import {
  getOnlineSummary, listOrphanOlts,
  LINK_STATUS_HINT, LINK_STATUS_LABEL,
  type OnlineLinkStatus, type OnlineSummary, type OrphanPage,
} from '../services/online.api'

/**
 * OLT ที่ยังผูกกลับสถานีหลักไม่ได้
 *
 * ทำไมต้องมีหน้านี้: ตราบใดที่ OLT ยังลอย L1/L2 ที่ห้อยอยู่ใต้มันเป็นพัน ๆ ตัว
 * จะเปิดจากหน้าสถานีไม่เจอเลย ข้อมูลอยู่ใน DB ครบแต่ไม่มีทางเดินไปถึง
 * หน้านี้คือรายการงานที่ค้าง ไม่ใช่รายงานสถิติ
 *
 * แก้ไม่ได้จากหน้านี้โดยตั้งใจ — วิธีแก้ต่างกันตามสถานะ (แก้ไฟล์ต้นทาง / เพิ่ม
 * สถานีเข้าระบบ / ไปตามหาข้อมูล) และทุกทางจบที่การ import ใหม่ ไม่ใช่ปุ่มบนหน้าจอ
 */
const PAGE_SIZE = 50

const summary = ref<OnlineSummary | null>(null)
const page = ref<OrphanPage | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const status = ref<'' | OnlineLinkStatus>('')
const q = ref('')
const offset = ref(0)

const STATUS_OPTIONS: { value: '' | OnlineLinkStatus; label: string }[] = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'unknown_code', label: LINK_STATUS_LABEL.unknown_code },
  { value: 'site_missing', label: LINK_STATUS_LABEL.site_missing },
  { value: 'na', label: LINK_STATUS_LABEL.na },
]

const STATUS_BADGE: Record<OnlineLinkStatus, string> = {
  linked: 'badge-success',
  site_missing: 'badge-info',
  unknown_code: 'badge-error',
  na: 'badge-warning',
}

async function load() {
  loading.value = true
  error.value = null
  try {
    page.value = await listOrphanOlts({
      status: status.value || undefined,
      q: q.value.trim() || undefined,
      limit: PAGE_SIZE,
      offset: offset.value,
    })
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายการ OLT ที่ยังไม่ผูกสถานีไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    summary.value = await getOnlineSummary()
  } catch {
    // ตัวเลขสรุปหายไม่ใช่เรื่องคอขาดบาดตาย ตารางข้างล่างยังใช้งานได้ตามปกติ
  }
  await load()
})

/*
 * กติกาโหลดซ้ำ: เปลี่ยนตัวกรองแล้วต้องกลับหน้าแรกเสมอ ไม่งั้นจะได้หน้าว่าง
 * แต่ถ้า offset เป็น 0 อยู่แล้ว การ set ซ้ำจะไม่ trigger watch จึงต้องเรียก load() เอง
 * ถ้าเขียน watch รวม [status, offset] ตรง ๆ จะโหลดสองรอบทุกครั้งที่เปลี่ยนตัวกรองจากหน้าอื่น
 */
function reload() {
  if (offset.value !== 0) offset.value = 0
  else void load()
}

watch(offset, load)
watch(status, reload)

/** ค้นหาไม่ยิงตามตัวอักษร — รอให้หยุดพิมพ์ก่อน ไม่งั้นยิงทุก keystroke */
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(reload, 300)
})

const totalOrphans = computed(() => {
  const s = summary.value?.olts
  if (!s) return 0
  return (s.unknown_code ?? 0) + (s.site_missing ?? 0) + (s.na ?? 0)
})

const from = computed(() => (page.value?.total ? offset.value + 1 : 0))
const to = computed(() => Math.min(offset.value + PAGE_SIZE, page.value?.total ?? 0))

function coords(o: { lat: number | null; lng: number | null }): string {
  if (o.lat === null || o.lng === null) return '—'
  return `${o.lat.toFixed(5)}, ${o.lng.toFixed(5)}`
}
</script>

<template>
  <AppLayout>
    <PageHeader
      title="OLT ที่ยังไม่ผูกสถานี"
      description="รายการที่ค้างอยู่ — แก้ที่ไฟล์ต้นทางหรือเพิ่มสถานีเข้าระบบ แล้ว import ใหม่"
    />

    <div v-if="summary" class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile label="ยังไม่ผูกสถานี" :value="totalOrphans.toLocaleString()" goodWhen="neutral"
        hint="นับจาก OLT ทั้งหมดในระบบ" />
      <StatTile label="รหัสสถานีไม่ถูกต้อง" :value="(summary.olts.unknown_code ?? 0).toLocaleString()"
        goodWhen="neutral" hint="ไม่พบรหัสทั้งในระบบและไฟล์ Uplink" />
      <StatTile label="ยังไม่มีสถานีในระบบ" :value="(summary.olts.site_missing ?? 0).toLocaleString()"
        goodWhen="neutral" hint="รหัสถูก แต่ยังไม่ได้เพิ่มสถานี" />
      <StatTile label="ไฟล์ไม่ได้ระบุ" :value="(summary.olts.na ?? 0).toLocaleString()"
        goodWhen="neutral" hint="ช่องว่างหรือ #N/A ในไฟล์" />
    </div>

    <p v-if="summary" class="mb-4 text-sm opacity-70">
      ทั้งหมด {{ ((summary.olts.linked ?? 0) + totalOrphans).toLocaleString() }} OLT ·
      ผูกกับสถานีแล้ว {{ (summary.olts.linked ?? 0).toLocaleString() }} ใน
      {{ summary.sitesWithOlt.toLocaleString() }} สถานี ·
      L1 {{ summary.l1.toLocaleString() }} · L2 {{ summary.l2.toLocaleString() }}
    </p>

    <div class="mb-4 flex flex-wrap items-end gap-3">
      <label class="form-control">
        <span class="label-text mb-1 block text-sm">สถานะ</span>
        <select v-model="status" class="select select-bordered select-sm w-56">
          <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </label>

      <label class="form-control">
        <span class="label-text mb-1 block text-sm">ค้นหา</span>
        <input
          v-model="q"
          type="search"
          class="input input-bordered input-sm w-64"
          placeholder="รหัส OLT หรือรหัสสถานีในไฟล์"
        >
      </label>
    </div>

    <div v-if="error" class="alert alert-error text-sm">{{ error }}</div>

    <p v-else-if="loading" class="text-sm opacity-70">กำลังโหลด…</p>

    <template v-else-if="page">
      <div class="overflow-x-auto rounded-lg border border-base-300">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>OLT</th>
              <th>รหัสสถานีในไฟล์</th>
              <th>สถานะ</th>
              <th class="text-right">L1</th>
              <th class="text-right">L2</th>
              <th>พิกัดของ OLT</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in page.olts" :key="o.id">
              <td class="font-mono">{{ o.oltCode }}</td>
              <td class="font-mono">{{ o.parentSiteCode ?? '—' }}</td>
              <td>
                <span class="badge badge-sm" :class="STATUS_BADGE[o.linkStatus]">
                  {{ LINK_STATUS_LABEL[o.linkStatus] }}
                </span>
              </td>
              <td class="text-right">{{ o.l1Count.toLocaleString() }}</td>
              <td class="text-right">{{ o.l2Count.toLocaleString() }}</td>
              <td class="font-mono text-xs opacity-70">{{ coords(o) }}</td>
            </tr>

            <tr v-if="!page.olts.length">
              <td colspan="6" class="py-6 text-center text-sm opacity-70">
                ไม่พบรายการตามเงื่อนไขนี้
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span class="opacity-70">แสดง {{ from }}–{{ to }} จาก {{ page.total.toLocaleString() }}</span>
        <div class="join">
          <button
            type="button" class="btn btn-sm join-item"
            :disabled="offset === 0"
            @click="offset = Math.max(offset - PAGE_SIZE, 0)"
          >
            ก่อนหน้า
          </button>
          <button
            type="button" class="btn btn-sm join-item"
            :disabled="offset + PAGE_SIZE >= page.total"
            @click="offset = offset + PAGE_SIZE"
          >
            ถัดไป
          </button>
        </div>
      </div>

      <div class="mt-6 flex flex-col gap-2 text-sm opacity-70">
        <p v-for="s in (['unknown_code', 'site_missing', 'na'] as OnlineLinkStatus[])" :key="s">
          <span class="badge badge-sm mr-2" :class="STATUS_BADGE[s]">{{ LINK_STATUS_LABEL[s] }}</span>
          {{ LINK_STATUS_HINT[s] }}
        </p>
      </div>
    </template>
  </AppLayout>
</template>

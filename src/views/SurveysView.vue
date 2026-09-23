<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import { formatDate, relativeTime } from '../lib/events'
import { loadProvinces, type Province } from '../services/provinces.api'
import {
  exportSurveys, listSurveys, loadSurveyLookups, SURVEY_RESULT_LABEL, SURVEY_STATUS_BADGE, SURVEY_STATUS_LABEL,
  type SurveyFilters, type SurveyLookups, type SurveyRow,
} from '../services/surveys.api'
import { useFlashStore } from '../stores/flash'

/**
 * รายการงานสำรวจ — เหมือนหน้า Event แต่ไม่มีลบจากรายการ (ลบในหน้างานเอง
 * เพราะต้องเห็นก่อนว่ามีรูป/จุดกี่อันที่จะหายไปด้วย)
 */
const PAGE_SIZE = 25

const filters = reactive<SurveyFilters>({
  q: '', status: '', province: '', jobType: '', from: '', to: '', mine: false, offset: 0,
})
const lookups = ref<SurveyLookups | null>(null)
const provinces = ref<Province[]>([])
const rows = ref<SurveyRow[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const page = computed(() => Math.floor((filters.offset ?? 0) / PAGE_SIZE) + 1)
const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const LABEL_KIND: Record<string, string> = { site: 'สถานี', olt: 'OLT', l1: 'L1', l2: 'L2' }

onMounted(async () => {
  notice.value = useFlashStore().take()
  try {
    ;[lookups.value, provinces.value] = await Promise.all([loadSurveyLookups(), loadProvinces()])
  } catch {
    error.value = 'โหลดตัวเลือกไม่สำเร็จ'
  }
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const data = await listSurveys({ ...filters, limit: PAGE_SIZE })
    rows.value = data.surveys
    total.value = data.total
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายการงานสำรวจไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}
watch(filters, load, { deep: true, immediate: true })

const exporting = ref(false)
async function doExport() {
  if (exporting.value) return
  exporting.value = true
  error.value = null
  try {
    await exportSurveys(filters)
  } catch (err) {
    error.value = errorMessage(err, 'ส่งออกไม่สำเร็จ')
  } finally {
    exporting.value = false
  }
}

function resetPage() { filters.offset = 0 }
function clearFilters() {
  Object.assign(filters, { q: '', status: '', province: '', jobType: '', from: '', to: '', mine: false, offset: 0 })
}
</script>

<template>
  <AppLayout>
    <PageHeader title="งานสำรวจ" description="สิ่งที่เจอหน้างาน — จุดปัญหา รูป และผลสรุปของแต่ละปลายทาง">
      <template #actions>
        <RouterLink to="/survey" class="btn btn-ghost btn-sm">แผนที่สำรวจ</RouterLink>
        <button type="button" class="btn btn-sm" :disabled="exporting || !total" @click="doExport">
          <span v-if="exporting" class="loading loading-spinner loading-xs" />ส่งออก Excel
        </button>
        <RouterLink to="/surveys/new" class="btn btn-primary">สร้างงานสำรวจ</RouterLink>
      </template>
    </PageHeader>

    <div class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body p-4">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ค้นหา</span>
            <input
              v-model="filters.q" type="search" placeholder="เลขที่ · รหัสปลายทาง · รหัสสถานี"
              class="input input-sm input-bordered w-full" @input="resetPage"
            >
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">สถานะ</span>
            <select v-model="filters.status" class="select select-sm select-bordered w-full" @change="resetPage">
              <option value="">ทุกสถานะ</option>
              <option v-for="(label, s) in SURVEY_STATUS_LABEL" :key="s" :value="s">{{ label }}</option>
            </select>
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">จังหวัด</span>
            <select v-model="filters.province" class="select select-sm select-bordered w-full" @change="resetPage">
              <option value="">ทุกจังหวัด</option>
              <option v-for="p in provinces" :key="p.id" :value="p.id">{{ p.nameTh }}</option>
            </select>
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ประเภทงาน</span>
            <select v-model="filters.jobType" class="select select-sm select-bordered w-full" @change="resetPage">
              <option value="">ทุกประเภท</option>
              <option v-for="t in lookups?.jobTypes" :key="t.id" :value="t.id">{{ t.nameTh }}</option>
            </select>
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ตั้งแต่</span>
            <input v-model="filters.from" type="date" class="input input-sm input-bordered w-full" @change="resetPage">
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ถึง</span>
            <input v-model="filters.to" type="date" class="input input-sm input-bordered w-full" @change="resetPage">
          </label>
          <label class="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
            <input v-model="filters.mine" type="checkbox" class="checkbox checkbox-sm" @change="resetPage">
            เฉพาะงานของฉัน
          </label>
          <div class="self-end pb-1">
            <button type="button" class="btn btn-ghost btn-sm" @click="clearFilters">ล้างตัวกรอง</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="notice" role="status" class="alert alert-success mb-4 text-sm"><span>{{ notice }}</span></div>
    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm"><span>{{ error }}</span></div>

    <div v-if="loading" class="mt-10 flex justify-center">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <div v-else-if="!rows.length" class="card border border-base-300 bg-base-100">
      <div class="card-body text-sm opacity-70">
        ไม่พบงานสำรวจตามเงื่อนไขนี้ — เริ่มงานใหม่ได้จากปุ่มด้านบน หรือจากแผนที่สำรวจ
      </div>
    </div>

    <template v-else>
      <div class="card overflow-x-auto border border-base-300 bg-base-100">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>เลขที่</th>
              <th>วันที่</th>
              <th>ปลายทาง</th>
              <th>สถานี</th>
              <th>จังหวัด</th>
              <th>ประเภท</th>
              <th>ผู้สำรวจ</th>
              <th>สถานะ</th>
              <th>ผล</th>
              <th class="text-right">จุด</th>
              <th class="text-right">รูป</th>
              <th>แก้ล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in rows" :key="s.id" class="hover">
              <td>
                <RouterLink :to="`/surveys/${s.id}`" class="link link-primary font-medium">{{ s.surveyNo }}</RouterLink>
              </td>
              <td class="whitespace-nowrap">{{ formatDate(s.surveyDate) }}</td>
              <td class="whitespace-nowrap">
                <span class="text-xs opacity-60">{{ LABEL_KIND[s.targetKind] }}</span>
                <span class="ml-1 font-mono">{{ s.targetCode }}</span>
              </td>
              <td class="whitespace-nowrap">
                <span v-if="s.siteCode" class="font-mono">{{ s.siteCode }}</span>
                <span v-else class="opacity-40">—</span>
              </td>
              <td class="whitespace-nowrap">{{ s.provinceName ?? '—' }}</td>
              <td class="whitespace-nowrap opacity-70">{{ s.jobTypeName ?? '—' }}</td>
              <td class="whitespace-nowrap">{{ s.surveyorName }}</td>
              <td>
                <span class="badge badge-sm" :class="SURVEY_STATUS_BADGE[s.status]">{{ SURVEY_STATUS_LABEL[s.status] }}</span>
              </td>
              <td class="whitespace-nowrap">{{ s.result ? SURVEY_RESULT_LABEL[s.result] : '—' }}</td>
              <td class="text-right">{{ s.pointCount || '—' }}</td>
              <td class="text-right">{{ s.photoCount || '—' }}</td>
              <td class="whitespace-nowrap text-xs opacity-60">{{ relativeTime(s.updatedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span class="opacity-70">ทั้งหมด {{ total }} รายการ · หน้า {{ page }} จาก {{ pages }}</span>
        <div class="join">
          <button
            type="button" class="btn btn-sm join-item" :disabled="(filters.offset ?? 0) === 0"
            @click="filters.offset = Math.max((filters.offset ?? 0) - PAGE_SIZE, 0)"
          >
            ก่อนหน้า
          </button>
          <button
            type="button" class="btn btn-sm join-item" :disabled="(filters.offset ?? 0) + PAGE_SIZE >= total"
            @click="filters.offset = (filters.offset ?? 0) + PAGE_SIZE"
          >
            ถัดไป
          </button>
        </div>
      </div>
    </template>
  </AppLayout>
</template>

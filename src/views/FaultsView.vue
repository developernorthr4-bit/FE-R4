<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import { formatDateTime } from '../lib/events'
import {
  exportFaults, listFaults, loadFaultLookups, RESULT_BADGE, RESULT_LABEL,
  type FaultFilters, type FaultLookups, type FaultRow, type FaultSummary,
} from '../services/faults.api'
import { loadProvinces, type Province } from '../services/provinces.api'
import { useAuthStore } from '../stores/auth'
import { useFlashStore } from '../stores/flash'

/**
 * รายการจุดซ่อม CM — ตัวกรอง + สรุปนับ pass / not pass / ยังไม่ตรวจ
 * ส่งออก xlsx ตามตัวกรองปัจจุบัน (BE จำกัด 10,000 แถว)
 */
const PAGE_SIZE = 50

const auth = useAuthStore()
const filters = reactive<FaultFilters>({
  q: '', province: '', cause: '', severity: '', sheet: '', audit: '', claim: '', geo: '', from: '', to: '', offset: 0,
})
const lookups = ref<FaultLookups | null>(null)
const provinces = ref<Province[]>([])
const rows = ref<FaultRow[]>([])
const total = ref(0)
const summary = ref<FaultSummary | null>(null)
const loading = ref(true)
const exporting = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const page = computed(() => Math.floor((filters.offset ?? 0) / PAGE_SIZE) + 1)
const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const canEdit = computed(() => auth.can('editor'))

onMounted(async () => {
  notice.value = useFlashStore().take()
  try {
    ;[lookups.value, provinces.value] = await Promise.all([loadFaultLookups(true), loadProvinces()])
  } catch {
    error.value = 'โหลดตัวเลือกไม่สำเร็จ'
  }
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const data = await listFaults({ ...filters, limit: PAGE_SIZE })
    rows.value = data.faults
    total.value = data.total
    summary.value = data.summary
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายการจุดซ่อมไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}
watch(filters, load, { deep: true, immediate: true })

function resetPage() { filters.offset = 0 }
function clearFilters() {
  Object.assign(filters, { q: '', province: '', cause: '', severity: '', sheet: '', audit: '', claim: '', geo: '', from: '', to: '', offset: 0 })
}
/** กดตัวเลขสรุป = กรองตามผลนั้นทันที (กดซ้ำ = เอาออก) */
function quick(audit: FaultFilters['audit']) {
  filters.audit = filters.audit === audit ? '' : audit
  filters.offset = 0
}

async function doExport() {
  exporting.value = true
  error.value = null
  try {
    await exportFaults(filters)
  } catch (err) {
    // BE ตอบ 400 เป็น blob — errorMessage อ่านไม่ออก แปลงเอง
    const blob = (err as { response?: { data?: unknown } })?.response?.data
    if (blob instanceof Blob) {
      try { error.value = (JSON.parse(await blob.text()) as { message?: string }).message ?? 'ส่งออกไม่สำเร็จ' } catch { error.value = 'ส่งออกไม่สำเร็จ' }
    } else {
      error.value = errorMessage(err, 'ส่งออกไม่สำเร็จ')
    }
  } finally {
    exporting.value = false
  }
}

const pct = (n: number) => (summary.value?.total ? `${((n / summary.value.total) * 100).toFixed(1)}%` : '')
</script>

<template>
  <AppLayout>
    <PageHeader title="ตรวจจุดซ่อม (Audit CM)" description="จุดที่ช่างปิดงานแล้วจากไฟล์ NOC — ทีม Audit เข้าไปดูของจริง ให้ผล pass / not pass พร้อมวิธีซ่อมและระยะ">
      <template #actions>
        <RouterLink to="/faults/map" class="btn btn-ghost btn-sm">แผนที่</RouterLink>
        <RouterLink to="/faults/plan" class="btn btn-ghost btn-sm">แผนเดินทาง</RouterLink>
        <button type="button" class="btn btn-sm" :disabled="exporting || !total" @click="doExport">
          <span v-if="exporting" class="loading loading-spinner loading-xs" />ส่งออก Excel
        </button>
        <RouterLink v-if="canEdit" to="/faults/import" class="btn btn-primary btn-sm">นำเข้าไฟล์</RouterLink>
      </template>
    </PageHeader>

    <!-- สรุปตามตัวกรอง (ไม่รวมตัวกรองผลตรวจ) — กดเพื่อกรอง -->
    <div v-if="summary" class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
      <button type="button" class="stat rounded-box border border-base-300 bg-base-100 p-3 text-left" :class="{ 'ring-2 ring-primary': filters.audit === '' }" @click="filters.audit = ''; resetPage()">
        <div class="stat-title text-xs">ทั้งหมด</div>
        <div class="stat-value text-xl">{{ summary.total.toLocaleString() }}</div>
      </button>
      <button type="button" class="stat rounded-box border border-base-300 bg-base-100 p-3 text-left" :class="{ 'ring-2 ring-primary': filters.audit === 'none' }" @click="quick('none')">
        <div class="stat-title text-xs">ยังไม่ตรวจ</div>
        <div class="stat-value text-xl">{{ summary.none.toLocaleString() }}</div>
        <div class="stat-desc">{{ pct(summary.none) }}<template v-if="summary.claimed"> · จองแล้ว {{ summary.claimed.toLocaleString() }}</template></div>
      </button>
      <button type="button" class="stat rounded-box border border-base-300 bg-base-100 p-3 text-left" :class="{ 'ring-2 ring-primary': filters.audit === 'pass' }" @click="quick('pass')">
        <div class="stat-title text-xs">Pass</div>
        <div class="stat-value text-xl text-success">{{ summary.pass.toLocaleString() }}</div>
        <div class="stat-desc">{{ pct(summary.pass) }}</div>
      </button>
      <button type="button" class="stat rounded-box border border-base-300 bg-base-100 p-3 text-left" :class="{ 'ring-2 ring-primary': filters.audit === 'not_pass' }" @click="quick('not_pass')">
        <div class="stat-title text-xs">Not pass</div>
        <div class="stat-value text-xl text-error">{{ summary.not_pass.toLocaleString() }}</div>
        <div class="stat-desc">{{ pct(summary.not_pass) }}</div>
      </button>
      <button type="button" class="stat rounded-box border border-base-300 bg-base-100 p-3 text-left" :class="{ 'ring-2 ring-primary': filters.audit === 'no_access' }" @click="quick('no_access')">
        <div class="stat-title text-xs">เข้าไม่ถึง</div>
        <div class="stat-value text-xl text-warning">{{ summary.no_access.toLocaleString() }}</div>
        <div class="stat-desc">{{ pct(summary.no_access) }}</div>
      </button>
    </div>

    <div class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body p-4">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ค้นหา</span>
            <input v-model="filters.q" type="search" placeholder="เลข CM · รหัสสถานี · INC · TT" class="input input-sm input-bordered w-full" @input="resetPage">
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">จังหวัด</span>
            <select v-model="filters.province" class="select select-sm select-bordered w-full" @change="resetPage">
              <option value="">ทุกจังหวัด</option>
              <option v-for="p in provinces" :key="p.id" :value="p.id">{{ p.nameTh }}</option>
            </select>
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">Root cause</span>
            <select v-model="filters.cause" class="select select-sm select-bordered w-full" @change="resetPage">
              <option value="">ทุกสาเหตุ</option>
              <option v-for="c in lookups?.causes" :key="c.key" :value="c.key">{{ c.key }} ({{ c.n.toLocaleString() }})</option>
            </select>
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">Severity</span>
            <select v-model="filters.severity" class="select select-sm select-bordered w-full" @change="resetPage">
              <option value="">ทุกระดับ</option>
              <option v-for="s in lookups?.severities" :key="s.key" :value="s.key">{{ s.key }} ({{ s.n.toLocaleString() }})</option>
            </select>
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ชีต (เดือนในไฟล์)</span>
            <select v-model="filters.sheet" class="select select-sm select-bordered w-full" @change="resetPage">
              <option value="">ทุกชีต</option>
              <option v-for="s in lookups?.sheets" :key="s.key" :value="s.key">{{ s.key }} ({{ s.n.toLocaleString() }})</option>
            </select>
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ผลตรวจ</span>
            <select v-model="filters.audit" class="select select-sm select-bordered w-full" @change="resetPage">
              <option value="">ทั้งหมด</option>
              <option value="none">ยังไม่ตรวจ</option>
              <option value="any">ตรวจแล้ว (ทุกผล)</option>
              <option v-for="(label, r) in RESULT_LABEL" :key="r" :value="r">{{ label }}</option>
            </select>
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">การจอง</span>
            <select v-model="filters.claim" class="select select-sm select-bordered w-full" @change="resetPage">
              <option value="">ทั้งหมด</option>
              <option value="none">ยังไม่มีคนจอง</option>
              <option value="mine">ฉันจอง</option>
              <option value="others">คนอื่นจอง</option>
              <option value="any">จองแล้ว (ทุกคน)</option>
            </select>
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">พิกัด</span>
            <select v-model="filters.geo" class="select select-sm select-bordered w-full" @change="resetPage">
              <option value="">ทั้งหมด</option>
              <option value="1">มีพิกัด</option>
              <option value="0">ไม่มีพิกัด</option>
            </select>
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="form-control">
              <span class="label-text text-xs opacity-70">ปิดงานตั้งแต่</span>
              <input v-model="filters.from" type="date" class="input input-sm input-bordered w-full" @change="resetPage">
            </label>
            <label class="form-control">
              <span class="label-text text-xs opacity-70">ถึง</span>
              <input v-model="filters.to" type="date" class="input input-sm input-bordered w-full" @change="resetPage">
            </label>
          </div>
        </div>
        <div class="mt-2 text-right">
          <button type="button" class="btn btn-ghost btn-xs" @click="clearFilters">ล้างตัวกรอง</button>
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
        ไม่พบจุดซ่อมตามเงื่อนไขนี้<template v-if="canEdit"> — ถ้ายังไม่เคยนำเข้า ใช้ปุ่ม "นำเข้าไฟล์" ด้านบน</template>
      </div>
    </div>

    <template v-else>
      <div class="card overflow-x-auto border border-base-300 bg-base-100">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>CM</th>
              <th>ปิดงาน</th>
              <th>สถานี</th>
              <th>จังหวัด</th>
              <th>Sev</th>
              <th>สาเหตุ</th>
              <th>ช่างทำอะไร</th>
              <th>พิกัด</th>
              <th>ผลตรวจ</th>
              <th>จอง</th>
              <th>วิธีซ่อม</th>
              <th class="text-right">ระยะ (ม.)</th>
              <th>ผู้ตรวจ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" class="hover">
              <td class="whitespace-nowrap">
                <RouterLink :to="`/faults/${r.id}`" class="link link-primary font-mono text-xs font-medium">{{ r.cmNo }}</RouterLink>
                <div class="text-[10px] opacity-50">{{ r.sourceSheet }}</div>
              </td>
              <td class="whitespace-nowrap text-xs">{{ formatDateTime(r.completeAt) }}</td>
              <td class="whitespace-nowrap">
                <span class="font-mono">{{ r.siteCode ?? '—' }}</span>
                <div v-if="r.siteName" class="max-w-40 truncate text-[10px] opacity-60" :title="r.siteName">{{ r.siteName }}</div>
              </td>
              <td class="whitespace-nowrap">{{ r.provinceName ?? '—' }}</td>
              <td class="whitespace-nowrap text-xs">{{ r.severity ?? '—' }}</td>
              <td class="max-w-56 text-xs">
                <div class="truncate" :title="r.rootCause ?? ''">{{ r.rootCauseKey ?? '—' }}</div>
                <div v-if="r.subRootCause" class="truncate opacity-60" :title="r.subRootCause">{{ r.subRootCause }}</div>
              </td>
              <td class="max-w-40 truncate text-xs" :title="r.completeSolution ?? ''">{{ r.completeSolution ?? '—' }}</td>
              <td class="text-xs">
                <span v-if="r.lat !== null" class="badge badge-ghost badge-xs">มี</span>
                <span v-else class="opacity-40">—</span>
              </td>
              <td>
                <span v-if="r.auditResult" class="badge badge-sm" :class="RESULT_BADGE[r.auditResult]">{{ RESULT_LABEL[r.auditResult] }}</span>
                <span v-else class="badge badge-sm badge-ghost opacity-60">ยังไม่ตรวจ</span>
                <span v-if="r.photoCount" class="ml-1 text-[10px] opacity-60">📷{{ r.photoCount }}</span>
              </td>
              <td class="whitespace-nowrap text-xs">
                <template v-if="r.claimUserName"><span :class="r.claimUserId === auth.user?.id ? 'text-primary font-medium' : ''">{{ r.claimUserName }}</span><div class="text-[10px] opacity-60">{{ r.claimPlannedDate }}</div></template>
                <span v-else class="opacity-40">—</span>
              </td>
              <td class="whitespace-nowrap text-xs">{{ r.solutionName ?? '—' }}</td>
              <td class="text-right text-xs">{{ r.repairLengthM !== null ? r.repairLengthM.toLocaleString() : '—' }}</td>
              <td class="whitespace-nowrap text-xs">{{ r.auditorName ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span class="opacity-70">ทั้งหมด {{ total.toLocaleString() }} รายการ · หน้า {{ page }} จาก {{ pages }}</span>
        <div class="join">
          <button type="button" class="btn btn-sm join-item" :disabled="(filters.offset ?? 0) === 0" @click="filters.offset = Math.max((filters.offset ?? 0) - PAGE_SIZE, 0)">ก่อนหน้า</button>
          <button type="button" class="btn btn-sm join-item" :disabled="(filters.offset ?? 0) + PAGE_SIZE >= total" @click="filters.offset = (filters.offset ?? 0) + PAGE_SIZE">ถัดไป</button>
        </div>
      </div>
    </template>
  </AppLayout>
</template>

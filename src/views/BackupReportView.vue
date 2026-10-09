<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import {
  BACKUP_FORMULA, BACKUP_FORMULA_NOTES, BACKUP_STATUS_BADGE, BACKUP_STATUS_LABEL, BACKUP_STATUSES, fmtHours,
  type BackupStatus,
} from '../lib/backup'
import { SITE_GRADE_BADGE } from '../lib/sites'
import {
  exportBackup, getBackupSummary, listBackupSites, type BackupRow, type BackupRules,
} from '../services/backup.api'
import { loadProvinces, type Province } from '../services/provinces.api'
import { useAuthStore } from '../stores/auth'

/**
 * รายงานชั่วโมงสำรองไฟตามเกรด — สรุปเกรด × ผล + รายการสถานีเรียงจากสำรองน้อยสุด
 * สูตรอยู่ที่ BE src/backup/calc.ts (หน้านี้ไม่คำนวณเอง) · เกณฑ์แก้ที่ /settings/backup (dev)
 */
const auth = useAuthStore()
const PAGE_SIZE = 50

const provinces = ref<Province[]>([])
const rules = ref<BackupRules | null>(null)
const cells = ref<{ grade: string | null; status: BackupStatus; n: number }[]>([])
const rows = ref<BackupRow[]>([])
const total = ref(0)
const loading = ref(true)
const listLoading = ref(false)
const exporting = ref(false)
const error = ref<string | null>(null)
const showFormula = ref(false)

const filters = reactive({ province: '' as number | '', grade: '', status: 'fail', q: '', offset: 0 })

/** เกรดเรียงตามค่าตั้ง (A+ ก่อน) แล้วตามด้วยเกรดที่มีในข้อมูลแต่ไม่มีเป้า และ "ไม่มีเกรด" */
const grades = computed(() => {
  const fromRules = Object.keys(rules.value?.targets ?? {})
  const extra = [...new Set(cells.value.map((c) => c.grade))].filter((g) => g !== null && !fromRules.includes(g)) as string[]
  const hasNone = cells.value.some((c) => c.grade === null)
  return [...fromRules, ...extra, ...(hasNone ? [null] : [])]
})

function count(grade: string | null, status: BackupStatus | 'all'): number {
  return cells.value
    .filter((c) => c.grade === grade && (status === 'all' || c.status === status))
    .reduce((s, c) => s + c.n, 0)
}
const columnTotal = (status: BackupStatus) => cells.value.filter((c) => c.status === status).reduce((s, c) => s + c.n, 0)
const grandTotal = computed(() => cells.value.reduce((s, c) => s + c.n, 0))

/** % ไม่ผ่าน ในกลุ่มที่ตัดสินได้ — ตัวเลขที่ผู้บริหารถามบ่อยสุด */
function failRate(grade: string | null): string {
  const p = count(grade, 'pass')
  const f = count(grade, 'fail')
  return p + f ? `${Math.round((f / (p + f)) * 100)}%` : '—'
}

async function loadSummary() {
  const d = await getBackupSummary(filters.province)
  rules.value = d.rules
  cells.value = d.cells
}

async function loadList() {
  listLoading.value = true
  try {
    const d = await listBackupSites({ ...filters, limit: PAGE_SIZE })
    rows.value = d.sites
    total.value = d.total
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายการไม่สำเร็จ')
  } finally {
    listLoading.value = false
  }
}

onMounted(async () => {
  try {
    const [p] = await Promise.all([loadProvinces(), loadSummary()])
    provinces.value = p
    await loadList()
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายงานไม่สำเร็จ')
  } finally {
    loading.value = false
  }
})

/** กลับหน้า 1 แล้วโหลด — ถ้าอยู่หน้าอื่น watch ของ offset โหลดให้เอง (กันยิงซ้ำสองรอบ) */
function resetAndLoad() {
  if (filters.offset !== 0) filters.offset = 0
  else loadList()
}

watch(() => filters.province, () => {
  loadSummary().catch((err) => { error.value = errorMessage(err, 'โหลดสรุปไม่สำเร็จ') })
  resetAndLoad()
})
watch(() => [filters.grade, filters.status], resetAndLoad)
watch(() => filters.offset, loadList)

let qTimer: ReturnType<typeof setTimeout> | undefined
watch(() => filters.q, () => {
  clearTimeout(qTimer)
  qTimer = setTimeout(resetAndLoad, 300)
})

/** กดตัวเลขในตารางสรุป = กรองรายการด้านล่าง */
function pick(grade: string | null, status: BackupStatus | '') {
  filters.grade = grade === null ? 'none' : grade
  filters.status = status
}

async function doExport() {
  exporting.value = true
  try {
    await exportBackup(filters)
  } catch (err) {
    error.value = errorMessage(err, 'ส่งออกไม่สำเร็จ')
  } finally {
    exporting.value = false
  }
}

const page = computed(() => Math.floor(filters.offset / PAGE_SIZE) + 1)
const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
</script>

<template>
  <AppLayout>
    <PageHeader
      title="ชั่วโมงสำรองไฟตามเกรด"
      description="แบตตู้ 1 ของแต่ละสถานีจ่ายไฟได้กี่ชั่วโมงเมื่อไฟดับ เทียบกับเป้าตามเกรดสถานี"
    >
      <template #actions>
        <button type="button" class="btn btn-ghost btn-sm" @click="showFormula = !showFormula">
          {{ showFormula ? 'ซ่อนสูตร' : 'สูตรคำนวณ' }}
        </button>
        <RouterLink v-if="auth.user?.role === 'dev'" to="/settings/backup" class="btn btn-ghost btn-sm">ตั้งเกณฑ์</RouterLink>
        <button type="button" class="btn btn-sm" :disabled="exporting" @click="doExport">
          <span v-if="exporting" class="loading loading-spinner loading-xs" /> ส่งออก Excel
        </button>
      </template>
    </PageHeader>

    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm">{{ error }}</div>

    <div v-if="showFormula" class="mb-4 rounded-box border border-base-300 bg-base-100 p-4 text-sm">
      <p class="font-mono">{{ BACKUP_FORMULA }}</p>
      <ul class="mt-2 list-disc pl-5 text-xs text-base-content/70">
        <li v-for="n in BACKUP_FORMULA_NOTES" :key="n">{{ n }}</li>
      </ul>
      <p v-if="rules" class="mt-2 text-xs text-base-content/70">
        เกณฑ์ตอนนี้: <template v-for="(h, g, i) in rules.targets" :key="g">{{ i ? ' · ' : '' }}{{ g }} {{ h }} ชม.</template>
        · DoD ลิเทียม {{ Math.round(rules.dod.LITHIUM * 100) }}% / VRLA {{ Math.round(rules.dod.VRLA * 100) }}%
        / ไม่ระบุ {{ Math.round(rules.dod.other * 100) }}% · เพดาน load {{ rules.maxLoadA }} A
      </p>
    </div>

    <div v-if="loading" class="mt-10 flex justify-center"><span class="loading loading-spinner loading-lg opacity-60" /></div>

    <template v-else>
      <div class="mb-3 flex flex-wrap items-end gap-2">
        <label class="form-control">
          <span class="label-text text-xs opacity-70">จังหวัด</span>
          <select v-model="filters.province" class="select select-bordered select-sm">
            <option value="">ทุกจังหวัด</option>
            <option v-for="p in provinces" :key="p.id" :value="p.id">{{ p.nameTh }}</option>
          </select>
        </label>
      </div>

      <!-- สรุปเกรด × ผล -->
      <div class="mb-6 overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>เกรด</th>
              <th class="text-right">เป้า</th>
              <th v-for="s in BACKUP_STATUSES" :key="s" class="text-right">
                <span class="badge badge-sm" :class="BACKUP_STATUS_BADGE[s]">{{ BACKUP_STATUS_LABEL[s] }}</span>
              </th>
              <th class="text-right">% ไม่ผ่าน</th>
              <th class="text-right">รวม</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in grades" :key="g ?? 'none'">
              <td>
                <span v-if="g" class="badge badge-sm" :class="SITE_GRADE_BADGE[g] ?? 'badge-neutral'">{{ g }}</span>
                <span v-else class="opacity-60">ไม่มีเกรด</span>
              </td>
              <td class="text-right tabular-nums">{{ g && rules?.targets[g] !== undefined ? `${rules.targets[g]} ชม.` : '—' }}</td>
              <td v-for="s in BACKUP_STATUSES" :key="s" class="text-right tabular-nums">
                <button
                  v-if="count(g, s)" type="button" class="link link-hover"
                  :class="{ 'font-semibold text-error': s === 'fail' }"
                  @click="pick(g, s)"
                >{{ count(g, s).toLocaleString() }}</button>
                <span v-else class="opacity-30">0</span>
              </td>
              <td class="text-right tabular-nums">{{ failRate(g) }}</td>
              <td class="text-right tabular-nums">
                <button type="button" class="link link-hover" @click="pick(g, '')">{{ count(g, 'all').toLocaleString() }}</button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>รวม</td><td />
              <td v-for="s in BACKUP_STATUSES" :key="s" class="text-right tabular-nums">{{ columnTotal(s).toLocaleString() }}</td>
              <td /><td class="text-right tabular-nums">{{ grandTotal.toLocaleString() }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- รายการ -->
      <div class="mb-3 flex flex-wrap items-end gap-2">
        <input v-model="filters.q" type="search" placeholder="รหัสสถานี" class="input input-bordered input-sm w-40">
        <select v-model="filters.grade" class="select select-bordered select-sm">
          <option value="">ทุกเกรด</option>
          <option v-for="g in grades.filter((x) => x !== null)" :key="g!" :value="g">{{ g }}</option>
          <option value="none">ไม่มีเกรด</option>
        </select>
        <select v-model="filters.status" class="select select-bordered select-sm">
          <option value="">ทุกผล</option>
          <option value="fail">ไม่ผ่าน</option>
          <option value="pass">ผ่าน</option>
          <option value="unknown">ตัดสินไม่ได้ (ทุกแบบ)</option>
          <option v-for="s in BACKUP_STATUSES.slice(2)" :key="s" :value="s">— {{ BACKUP_STATUS_LABEL[s] }}</option>
        </select>
        <span class="text-xs text-base-content/60">{{ total.toLocaleString() }} สถานี · เรียงจากสำรองน้อยสุด</span>
        <span v-if="listLoading" class="loading loading-spinner loading-xs" />
      </div>

      <div class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>รหัส</th><th>จังหวัด</th><th>เกรด</th><th class="text-right">สำรอง</th><th class="text-right">เป้า</th>
              <th>ผล</th><th class="text-right">Load</th><th class="text-right">แบต</th><th class="text-right">Ah ใช้ได้</th>
              <th>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!rows.length"><td colspan="10" class="py-6 text-center opacity-60">ไม่มีสถานีตามตัวกรองนี้</td></tr>
            <tr v-for="r in rows" :key="r.site_id">
              <td><RouterLink :to="`/sites/${r.site_id}/edit`" class="link link-hover font-mono">{{ r.site_code }}</RouterLink></td>
              <td class="whitespace-nowrap">{{ r.province_name }}</td>
              <td>
                <span v-if="r.grade" class="badge badge-sm" :class="SITE_GRADE_BADGE[r.grade] ?? 'badge-neutral'">{{ r.grade }}</span>
                <span v-else class="opacity-40">—</span>
              </td>
              <td class="text-right tabular-nums" :class="{ 'font-semibold text-error': r.status === 'fail' }">{{ fmtHours(r.hours) }}</td>
              <td class="text-right tabular-nums opacity-70">{{ r.target === null ? '—' : `${r.target} ชม.` }}</td>
              <td><span class="badge badge-sm whitespace-nowrap" :class="BACKUP_STATUS_BADGE[r.status]">{{ BACKUP_STATUS_LABEL[r.status] }}</span></td>
              <td class="text-right tabular-nums">{{ r.load_a === null ? '—' : `${r.load_a} A` }}</td>
              <td class="text-right tabular-nums">{{ r.battery_count || '—' }}</td>
              <td class="text-right tabular-nums">{{ r.usable_ah === null ? '—' : r.usable_ah.toFixed(0) }}</td>
              <td class="text-xs">
                <span v-if="r.soh_zero" class="text-error">SOH 0% ×{{ r.soh_zero }} </span>
                <span v-if="r.faulty_count" class="text-error">ชำรุด ×{{ r.faulty_count }} </span>
                <span v-if="r.soh_missing" class="text-warning">ไม่มี SOH ×{{ r.soh_missing }} (ประมาณ)</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="pages > 1" class="mt-3 flex items-center justify-end gap-2 text-sm">
        <button type="button" class="btn btn-sm" :disabled="filters.offset === 0" @click="filters.offset = Math.max(filters.offset - PAGE_SIZE, 0)">ก่อนหน้า</button>
        <span>หน้า {{ page }} / {{ pages }}</span>
        <button type="button" class="btn btn-sm" :disabled="page >= pages" @click="filters.offset += PAGE_SIZE">ถัดไป</button>
      </div>
    </template>
  </AppLayout>
</template>

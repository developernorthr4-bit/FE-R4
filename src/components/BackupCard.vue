<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { errorMessage } from '../lib/api'
import {
  BACKUP_FORMULA, BACKUP_FORMULA_NOTES, BACKUP_STATUS_BADGE, BACKUP_STATUS_HINT, BACKUP_STATUS_LABEL, fmtHours,
} from '../lib/backup'
import { formatDate } from '../lib/events'
import { getSiteBackup, type BackupBattery, type BackupRow, type BackupRules } from '../services/backup.api'

/**
 * ชั่วโมงสำรองไฟของสถานี (ตู้ 1) เทียบเป้าตามเกรด — ทุก role เห็น
 * ตัวเลขทั้งหมดมาจาก BE (src/backup/calc.ts) การ์ดนี้แค่แสดง + อธิบายที่มา
 */
const props = defineProps<{ siteId: string }>()

const rules = ref<BackupRules | null>(null)
const row = ref<BackupRow | null>(null)
const batteries = ref<BackupBattery[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showFormula = ref(false)

async function reload() {
  error.value = null
  try {
    const d = await getSiteBackup(props.siteId)
    rules.value = d.rules
    row.value = d.backup
    batteries.value = d.batteries
  } catch (err) {
    error.value = errorMessage(err, 'โหลดชั่วโมงสำรองไฟไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

onMounted(reload)
defineExpose({ reload })

/** แถบเทียบกับเป้า — เต็มแถบที่ 1.5 เท่าของเป้า เพื่อให้เห็นว่าเกินเป้ามากน้อยแค่ไหน */
const barPct = computed(() => {
  const r = row.value
  if (!r?.hours || !r.target) return 0
  return Math.min(100, (r.hours / (r.target * 1.5)) * 100)
})
const targetPct = computed(() => (100 / 1.5))

const dodLabel = (d: number) => `${Math.round(d * 100)}%`
</script>

<template>
  <section class="card border border-base-300 bg-base-100">
    <div class="card-body gap-3 p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-base font-semibold">ชั่วโมงสำรองไฟ (ตู้ 1)</h2>
        <button type="button" class="btn btn-ghost btn-xs" @click="showFormula = !showFormula">
          {{ showFormula ? 'ซ่อนสูตร' : 'ดูสูตรคำนวณ' }}
        </button>
      </div>

      <div v-if="loading" class="flex justify-center py-4"><span class="loading loading-spinner" /></div>
      <div v-else-if="error" role="alert" class="alert alert-error text-sm">{{ error }}</div>

      <template v-else-if="row && rules">
        <!-- ผลหลัก -->
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <p class="text-3xl font-semibold tabular-nums">{{ fmtHours(row.hours) }}</p>
            <p class="text-xs text-base-content/60">
              เป้า{{ row.grade ? ` เกรด ${row.grade}` : '' }}: {{ row.target === null ? 'ไม่มี' : `${row.target} ชม.` }}
            </p>
          </div>
          <div>
            <span class="badge" :class="BACKUP_STATUS_BADGE[row.status]">{{ BACKUP_STATUS_LABEL[row.status] }}</span>
            <p class="mt-1 text-xs text-base-content/60">{{ BACKUP_STATUS_HINT[row.status] }}</p>
          </div>
        </div>

        <div v-if="row.hours !== null && row.target !== null" class="relative h-2 rounded-full bg-base-200" aria-hidden="true">
          <div
            class="h-2 rounded-full"
            :class="row.status === 'pass' ? 'bg-success' : row.status === 'fail' ? 'bg-error' : 'bg-base-content/30'"
            :style="{ width: `${barPct}%` }"
          />
          <div class="absolute -top-1 h-4 w-0.5 bg-base-content/60" :style="{ left: `${targetPct}%` }" title="เป้า" />
        </div>

        <!-- ที่มาของตัวเลข -->
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="text-base-content/60">Load Current</dt>
          <dd>
            {{ row.load_a === null ? '—' : `${row.load_a} A` }}
            <span v-if="row.pm_year" class="text-xs text-base-content/60">
              · PM {{ row.pm_year }}{{ row.pm_date ? ` (${formatDate(row.pm_date)})` : '' }}
            </span>
          </dd>
          <dt class="text-base-content/60">แบตที่นับ</dt>
          <dd>{{ row.battery_count }} ก้อน · ตามป้าย {{ row.nominal_ah ?? 0 }} Ah</dd>
          <dt class="text-base-content/60">Ah ที่ใช้ได้จริง</dt>
          <dd>{{ row.usable_ah === null ? '—' : `${row.usable_ah.toFixed(1)} Ah` }} <span class="text-xs text-base-content/60">(หลังคูณ SOH × DoD)</span></dd>
        </dl>

        <!-- ธงเตือน -->
        <ul v-if="row.soh_missing || row.soh_zero || row.faulty_count || row.cap_missing" class="flex flex-col gap-1 text-xs">
          <li v-if="row.soh_missing" class="text-warning">⚠ {{ row.soh_missing }} ก้อนไม่มีค่า SOH — นับเต็ม 100% ผลนี้จึงเป็นค่าประมาณการ</li>
          <li v-if="row.soh_zero" class="text-error">⚠ {{ row.soh_zero }} ก้อน SOH 0% — นับเป็น 0 ควรตรวจซ้ำว่าเสียจริงหรืออ่านค่าไม่ได้</li>
          <li v-if="row.faulty_count" class="text-error">✕ แบตชำรุด {{ row.faulty_count }} ก้อน — ไม่ถูกนับในสูตร</li>
          <li v-if="row.cap_missing" class="text-warning">⚠ {{ row.cap_missing }} ก้อนไม่รู้ความจุ (Ah) — ไม่ถูกนับในสูตร</li>
        </ul>

        <!-- รายก้อน: แต่ละก้อนให้ Ah เท่าไรในสูตร -->
        <div v-if="batteries.length" class="overflow-x-auto">
          <table class="table table-xs">
            <thead>
              <tr>
                <th>ช่อง</th><th>ชนิด</th><th class="text-right">Ah</th><th class="text-right">SOH</th>
                <th class="text-right">DoD</th><th class="text-right">Ah ที่ใช้ได้</th><th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in batteries" :key="b.id" :class="{ 'opacity-50': !b.counted }">
                <td>{{ b.bankCode ?? '—' }}</td>
                <td>{{ b.typeCode ?? 'ไม่ระบุ' }}</td>
                <td class="text-right tabular-nums">{{ b.capacityAh ?? '—' }}<template v-if="b.qty > 1"> ×{{ b.qty }}</template></td>
                <td class="text-right tabular-nums">{{ b.healthPct === null ? '100%*' : `${Math.min(b.healthPct, 100)}%` }}</td>
                <td class="text-right tabular-nums">{{ dodLabel(b.dod) }}</td>
                <td class="text-right tabular-nums">{{ b.counted ? b.usableAh.toFixed(1) : '—' }}</td>
                <td>{{ b.counted ? 'นับ' : b.status === 'active' ? 'ไม่รู้ความจุ' : `ไม่นับ (${b.status})` }}</td>
              </tr>
            </tbody>
          </table>
          <p class="mt-1 text-xs text-base-content/50">* ไม่มีค่า SOH — นับเต็ม 100%</p>
        </div>

        <!-- สูตร -->
        <div v-if="showFormula" class="rounded-lg border border-base-300 bg-base-200/50 p-3 text-sm">
          <p class="font-mono text-xs sm:text-sm">{{ BACKUP_FORMULA }}</p>
          <p v-if="row.hours !== null && row.load_a" class="mt-2 font-mono text-xs">
            = {{ row.usable_ah?.toFixed(1) }} Ah ÷ {{ row.load_a }} A = {{ row.hours.toFixed(2) }} ชม.
          </p>
          <ul class="mt-2 list-disc pl-5 text-xs text-base-content/70">
            <li v-for="n in BACKUP_FORMULA_NOTES" :key="n">{{ n }}</li>
          </ul>
          <p class="mt-2 text-xs text-base-content/70">
            DoD ที่ใช้ตอนนี้: ลิเทียม {{ dodLabel(rules.dod.LITHIUM) }} · VRLA {{ dodLabel(rules.dod.VRLA) }} ·
            ไม่ระบุชนิด {{ dodLabel(rules.dod.other) }} · เพดาน load {{ rules.maxLoadA }} A
          </p>
          <p class="mt-1 text-xs text-base-content/70">
            เป้าตามเกรด: <template v-for="(h, g, i) in rules.targets" :key="g">{{ i ? ' · ' : '' }}{{ g }} {{ h }} ชม.</template>
          </p>
        </div>
      </template>
    </div>
  </section>
</template>

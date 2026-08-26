<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import {
  formatBytes, loadSettings, setAuditEnabled, setAuditRetention, SETTING_KEY,
  type AuditStats, type StorageStats,
} from '../services/settings.api'

/**
 * ค่าตั้งของระบบ — เห็นเฉพาะ dev (กันซ้ำที่ router และที่ BE อีกชั้น)
 *
 * สามการ์ด: สวิตช์ audit · นโยบายเก็บตามอายุ · พื้นที่ที่ใช้ไปรายตาราง
 * ส่วนการดู/ลบ audit ทีละแถวอยู่ที่ /settings/audit เพราะเป็นคนละงาน
 * และต้องการทั้งตัวกรองและตารางยาว
 */
const TOP_N = 12

const auditOn = ref(false)
const retentionDays = ref('0')
const retentionSaved = ref('0')
const stats = ref<AuditStats | null>(null)
const storage = ref<StorageStats | null>(null)
const loading = ref(true)
const busy = ref(false)
const savingRetention = ref(false)
const showAllTables = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const usedPct = computed(() => {
  const s = storage.value
  if (!s) return 0
  return Math.min(100, Math.round((s.dbBytes / s.quotaBytes) * 1000) / 10)
})

/** สัดส่วนของ audit_log ในฐานข้อมูลทั้งก้อน — ตัวเลขที่ใช้ตัดสินใจว่าควรเปิดไหม */
const auditPct = computed(() => {
  const s = stats.value
  const st = storage.value
  if (!s || !st || st.dbBytes === 0) return 0
  return Math.round((s.bytes / st.dbBytes) * 1000) / 10
})

/** แถวที่มาจากคนจริง ๆ — ที่เหลือคือร่องรอยจาก importer */
const humanRows = computed(() => {
  const s = stats.value
  return s ? s.rows - s.importRows : 0
})

/**
 * ตารางที่จะแสดง + แถวสรุปของที่ไม่ใช่ตารางใน public
 *
 * แถว "อื่น ๆ" จำเป็นเพราะผลรวมของตารางน้อยกว่าขนาดฐานข้อมูลอยู่ราว 11 MB
 * (catalog ของ postgres เอง) ถ้าไม่แสดง ผู้ใช้จะบวกเลขแล้วไม่ตรงกับที่ระบบบอก
 * แล้วไม่มีทางรู้ว่าส่วนต่างนั้นคืออะไร
 */
const visibleTables = computed(() => {
  const s = storage.value
  if (!s) return []
  const rows = showAllTables.value ? s.tables : s.tables.slice(0, TOP_N)
  return rows.map((t) => ({ ...t, pct: pctOf(t.totalBytes) }))
})

const hiddenCount = computed(() => {
  const s = storage.value
  if (!s || showAllTables.value) return Math.max(0, (s?.tables.length ?? 0) - TOP_N)
  return 0
})

const hiddenBytes = computed(() => {
  const s = storage.value
  if (!s || showAllTables.value) return 0
  return s.tables.slice(TOP_N).reduce((a, t) => a + t.totalBytes, 0)
})

function pctOf(bytes: number): number {
  const s = storage.value
  if (!s || s.dbBytes === 0) return 0
  return Math.round((bytes / s.dbBytes) * 1000) / 10
}

/** นโยบายที่บันทึกไว้แล้ว ต่างจากเลขที่กำลังพิมพ์อยู่ในช่อง */
const retentionDirty = computed(() => retentionDays.value.trim() !== retentionSaved.value)
const retentionValid = computed(() => {
  const n = Number(retentionDays.value)
  return Number.isInteger(n) && n >= 0 && n <= 3650
})
const retentionLastRun = ref<string | null>(null)

async function refresh() {
  error.value = null
  try {
    const res = await loadSettings()
    stats.value = res.audit
    storage.value = res.storage
    auditOn.value = res.settings.find((s) => s.key === SETTING_KEY.auditEnabled)?.value === 'true'
    const days = res.settings.find((s) => s.key === SETTING_KEY.auditRetentionDays)?.value ?? '0'
    retentionDays.value = days
    retentionSaved.value = days
    retentionLastRun.value =
      res.settings.find((s) => s.key === SETTING_KEY.auditRetentionLastRun)?.value ?? null
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function toggle(next: boolean) {
  if (busy.value) return
  busy.value = true
  error.value = null
  notice.value = null
  // มองเห็นผลทันที แล้วค่อยย้อนกลับถ้า BE ปฏิเสธ — สวิตช์ที่ค้างรอ 300 ms รู้สึกเสีย
  const prev = auditOn.value
  auditOn.value = next
  try {
    await setAuditEnabled(next)
    notice.value = next
      ? 'เปิดการบันทึกแล้ว — การแก้ไขทุกครั้งหลังจากนี้จะถูกบันทึกลง audit_log'
      : 'ปิดการบันทึกแล้ว — trigger ยังอยู่ครบทุกตาราง เปิดกลับได้ทุกเมื่อ'
    await refresh()
  } catch (e) {
    auditOn.value = prev
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

async function saveRetention() {
  if (!retentionValid.value || savingRetention.value) return
  savingRetention.value = true
  error.value = null
  notice.value = null
  const days = Number(retentionDays.value)
  try {
    const res = await setAuditRetention(days)
    retentionLastRun.value = res.lastRun
    notice.value = days === 0
      ? 'ปิดนโยบายตามอายุแล้ว — เก็บ audit ไว้ตลอด ไม่มีอะไรถูกลบเอง'
      : `ตั้งไว้ ${days} วัน — ระบบจะกวาดของที่เกินอายุเองวันละครั้ง (ยกเว้นแถว DELETE)`
    await refresh()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    savingRetention.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <AppLayout>
    <PageHeader
      title="ตั้งค่าระบบ"
      description="สวิตช์ที่มีผลทั้งระบบ เปลี่ยนได้ทันทีโดยไม่ต้อง deploy ใหม่"
    >
      <template #actions>
        <RouterLink to="/settings/audit" class="btn btn-sm">จัดการ audit_log</RouterLink>
      </template>
    </PageHeader>

    <div v-if="error" role="alert" class="alert alert-error mb-4">
      <span>{{ error }}</span>
    </div>
    <div v-if="notice" role="status" class="alert alert-success mb-4">
      <span>{{ notice }}</span>
    </div>

    <div v-if="loading" class="flex justify-center py-16">
      <span class="loading loading-spinner loading-lg" />
    </div>

    <div v-else class="space-y-4">
      <!-- ── สวิตช์ audit ─────────────────────────────────────────── -->
      <div class="card border border-base-300 bg-base-100">
        <div class="card-body gap-4">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="flex-1">
              <h2 class="font-semibold">บันทึกประวัติการแก้ไข (audit_log)</h2>
              <p class="mt-1 text-sm opacity-70">
                เก็บว่าใครแก้อะไรตอนไหน ทั้งค่าก่อนและหลัง
                ปิดไว้เพื่อประหยัดพื้นที่ได้ โดย trigger ยังผูกอยู่ครบทุกตาราง
                เปิดกลับมาเมื่อไรก็ทำงานต่อทันที
              </p>
            </div>
            <label class="flex cursor-pointer items-center gap-3">
              <span class="text-sm font-medium" :class="auditOn ? '' : 'opacity-60'">
                {{ auditOn ? 'เปิดอยู่' : 'ปิดอยู่' }}
              </span>
              <input
                type="checkbox"
                class="toggle toggle-primary"
                :checked="auditOn"
                :disabled="busy"
                @change="toggle(($event.target as HTMLInputElement).checked)"
              >
            </label>
          </div>

          <div v-if="!auditOn" role="alert" class="alert alert-warning py-2 text-sm">
            <span>
              ระหว่างที่ปิด การแก้ไขจะไม่ถูกบันทึก และย้อนกลับไปดูภายหลังไม่ได้
            </span>
          </div>
        </div>
      </div>

      <!-- ── นโยบายเก็บตามอายุ ────────────────────────────────────── -->
      <div class="card border border-base-300 bg-base-100">
        <div class="card-body gap-3">
          <div>
            <h2 class="font-semibold">เก็บ audit ไว้กี่วัน</h2>
            <p class="mt-1 text-sm opacity-70">
              ระบบกวาดของที่เกินอายุเองวันละครั้ง ทั้งของ importer และของคน
              ยกเว้นแถว DELETE ที่กันไว้เสมอ — 0 คือไม่จำกัด เก็บไว้ตลอด
            </p>
          </div>

          <div class="flex flex-wrap items-end gap-3">
            <label class="form-control">
              <span class="label-text text-xs opacity-70">จำนวนวัน (0 = ไม่จำกัด)</span>
              <input
                v-model="retentionDays" type="number" min="0" max="3650"
                class="input input-sm input-bordered w-32"
                :class="!retentionValid && 'input-error'"
              />
            </label>
            <button
              type="button" class="btn btn-sm btn-primary"
              :disabled="!retentionDirty || !retentionValid || savingRetention"
              @click="saveRetention"
            >
              <span v-if="savingRetention" class="loading loading-spinner loading-xs" />
              บันทึก
            </button>
            <span v-if="!retentionValid" class="text-sm text-error">ต้องเป็นจำนวนเต็ม 0 ถึง 3650</span>
            <span v-else-if="retentionSaved === '0'" class="text-sm opacity-60">
              ตอนนี้ไม่จำกัด — ไม่มีอะไรถูกลบเอง
            </span>
            <span v-else class="text-sm opacity-60">
              ตั้งไว้ {{ retentionSaved }} วัน
              <template v-if="retentionLastRun">
                · กวาดล่าสุด {{ new Date(retentionLastRun).toLocaleString('th-TH') }}
              </template>
              <template v-else> · ยังไม่เคยกวาด</template>
            </span>
          </div>
        </div>
      </div>

      <!-- ── พื้นที่ + ขนาดรายตาราง ───────────────────────────────── -->
      <div v-if="stats && storage" class="card border border-base-300 bg-base-100">
        <div class="card-body gap-4">
          <h2 class="font-semibold">พื้นที่ฐานข้อมูล</h2>

          <div>
            <div class="mb-1 flex justify-between text-sm">
              <span>ใช้ไป {{ formatBytes(storage.dbBytes) }}</span>
              <span class="opacity-70">
                จาก {{ formatBytes(storage.quotaBytes) }} · {{ usedPct }}%
              </span>
            </div>
            <progress
              class="progress w-full"
              :class="usedPct >= 80 ? 'progress-error' : usedPct >= 50 ? 'progress-warning' : 'progress-success'"
              :value="usedPct"
              max="100"
            />
          </div>

          <div class="stats stats-vertical border border-base-300 sm:stats-horizontal">
            <div class="stat">
              <div class="stat-title">ขนาด audit_log</div>
              <div class="stat-value text-2xl">{{ formatBytes(stats.bytes) }}</div>
              <div class="stat-desc">{{ auditPct }}% ของทั้งฐานข้อมูล</div>
            </div>
            <div class="stat">
              <div class="stat-title">แถวจากการกระทำของคน</div>
              <div class="stat-value text-2xl">{{ humanRows.toLocaleString() }}</div>
              <div class="stat-desc">ส่วนที่ย้อนกลับไปดูแล้วมีความหมาย</div>
            </div>
            <div class="stat">
              <div class="stat-title">แถวจาก importer</div>
              <div class="stat-value text-2xl">{{ stats.importRows.toLocaleString() }}</div>
              <div class="stat-desc">
                <template v-if="stats.importRows">ของเก่าก่อนใส่ตัวกรอง import</template>
                <template v-else>ไม่มีแล้ว</template>
              </div>
            </div>
          </div>

          <p class="text-sm opacity-70">
            งาน import จะไม่เขียนลง audit_log อีกต่อไปแม้สวิตช์จะเปิดอยู่
            เพราะคำตอบของ "ใคร insert แถวนี้" คือ importer เสมอ
            ที่เหลือคือการแก้ด้วยมือซึ่งโตช้ามาก — เปิดทิ้งไว้ได้โดยไม่ต้องห่วงพื้นที่
          </p>

          <!-- ขนาดรายตาราง -->
          <div class="overflow-x-auto border-t border-base-300 pt-3">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>ตาราง</th>
                  <th class="text-right">แถว</th>
                  <th class="text-right">ข้อมูล</th>
                  <th class="text-right">index</th>
                  <th class="text-right">รวม</th>
                  <th class="w-32">สัดส่วน</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in visibleTables" :key="t.name" class="hover">
                  <td class="font-medium">{{ t.name }}</td>
                  <td class="text-right tabular-nums">{{ t.rows.toLocaleString() }}</td>
                  <td class="text-right tabular-nums opacity-70">{{ formatBytes(t.dataBytes) }}</td>
                  <td class="text-right tabular-nums opacity-70">{{ formatBytes(t.indexBytes) }}</td>
                  <td class="text-right tabular-nums font-medium">{{ formatBytes(t.totalBytes) }}</td>
                  <td>
                    <div class="flex items-center gap-2">
                      <progress class="progress progress-primary w-16" :value="t.pct" max="100" />
                      <span class="text-xs tabular-nums opacity-60">{{ t.pct }}%</span>
                    </div>
                  </td>
                </tr>

                <tr v-if="hiddenCount" class="opacity-60">
                  <td colspan="4">อีก {{ hiddenCount }} ตาราง</td>
                  <td class="text-right tabular-nums">{{ formatBytes(hiddenBytes) }}</td>
                  <td>
                    <button type="button" class="btn btn-ghost btn-xs" @click="showAllTables = true">
                      แสดงทั้งหมด
                    </button>
                  </td>
                </tr>

                <!--
                  แถวปิดท้ายให้ตัวเลขบวกกันครบ ไม่งั้นผลรวมจะน้อยกว่าที่แถบด้านบนบอก
                  โดยไม่มีคำอธิบาย
                -->
                <tr class="border-t border-base-300 opacity-60">
                  <td colspan="4">อื่น ๆ (catalog ของ postgres เอง)</td>
                  <td class="text-right tabular-nums">{{ formatBytes(storage.otherBytes) }}</td>
                  <td class="text-xs">{{ pctOf(storage.otherBytes) }}%</td>
                </tr>
              </tbody>
            </table>

            <button
              v-if="showAllTables" type="button" class="btn btn-ghost btn-xs mt-2"
              @click="showAllTables = false"
            >
              แสดงเฉพาะ {{ TOP_N }} ตารางที่ใหญ่ที่สุด
            </button>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

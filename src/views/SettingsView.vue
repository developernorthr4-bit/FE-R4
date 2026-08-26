<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import {
  formatBytes, loadSettings, setAuditEnabled, type AuditStats,
} from '../services/settings.api'

/**
 * ค่าตั้งของระบบ — เห็นเฉพาะ dev (กันซ้ำที่ router และที่ BE อีกชั้น)
 *
 * ตอนนี้มีสวิตช์เดียวคือ audit_log แต่ตั้งใจให้เป็นบ้านของสวิตช์อื่นในอนาคต
 */
const auditOn = ref(false)
const stats = ref<AuditStats | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const usedPct = computed(() => {
  const s = stats.value
  if (!s) return 0
  return Math.min(100, Math.round((s.dbBytes / s.quotaBytes) * 1000) / 10)
})

/** สัดส่วนของ audit_log ในฐานข้อมูลทั้งก้อน — ตัวเลขที่ใช้ตัดสินใจว่าควรเปิดไหม */
const auditPct = computed(() => {
  const s = stats.value
  if (!s || s.dbBytes === 0) return 0
  return Math.round((s.bytes / s.dbBytes) * 1000) / 10
})

/** แถวที่มาจากคนจริง ๆ — ที่เหลือคือร่องรอยจาก importer */
const humanRows = computed(() => {
  const s = stats.value
  return s ? s.rows - s.importRows : 0
})

async function refresh() {
  error.value = null
  try {
    const res = await loadSettings()
    stats.value = res.audit
    auditOn.value = res.settings.find((s) => s.key === 'audit_enabled')?.value === 'true'
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

onMounted(refresh)
</script>

<template>
  <AppLayout>
    <PageHeader
      title="ตั้งค่าระบบ"
      description="สวิตช์ที่มีผลทั้งระบบ เปลี่ยนได้ทันทีโดยไม่ต้อง deploy ใหม่"
    />

    <div v-if="error" class="alert alert-error mb-4">
      <span>{{ error }}</span>
    </div>
    <div v-if="notice" class="alert alert-success mb-4">
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

          <div v-if="!auditOn" class="alert alert-warning py-2 text-sm">
            <span>
              ระหว่างที่ปิด การแก้ไขจะไม่ถูกบันทึก และย้อนกลับไปดูภายหลังไม่ได้
            </span>
          </div>
        </div>
      </div>

      <!-- ── สถิติพื้นที่ ─────────────────────────────────────────── -->
      <div v-if="stats" class="card border border-base-300 bg-base-100">
        <div class="card-body gap-4">
          <h2 class="font-semibold">พื้นที่ฐานข้อมูล</h2>

          <div>
            <div class="mb-1 flex justify-between text-sm">
              <span>ใช้ไป {{ formatBytes(stats.dbBytes) }}</span>
              <span class="opacity-70">จาก {{ formatBytes(stats.quotaBytes) }} · {{ usedPct }}%</span>
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
        </div>
      </div>
    </div>
  </AppLayout>
</template>

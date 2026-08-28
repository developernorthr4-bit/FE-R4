<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseField from '../components/ui/BaseField.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import { errorMessage } from '../lib/api'
import {
  dash, elapsedSeconds, etaSeconds, formatDuration, isLive, JOB_STATUS_BADGE,
  JOB_STATUS_LABEL, splitVals, tally, VERDICT_BADGE,
  type OltJob, type OltJobDetail, type OltVerdict,
} from '../lib/olt'
import { cancelJob, createJob, downloadExcel, getJob, listJobs } from '../services/olt.api'

/**
 * OLT Bot — สั่งตรวจค่าแสง 1490Rx ทีละหลายร้อยรายการ
 *
 * แทนสคริปต์ Python ที่เดิมต้องติดตั้งเองทีละเครื่อง ข้อดีที่ได้จากการย้ายมาไว้
 * ตรงกลางคือทุกคนใช้ตัวเดียวกัน เห็นประวัติร่วมกัน และที่สำคัญที่สุด —
 * จำนวนคำขอที่ยิงออกไปหาระบบปลายทางถูกคุมไว้ที่ 3 คำขอสำหรับทั้งระบบ
 * ถ้าต่างคนต่างรันสคริปต์บนเครื่องตัวเอง จะไม่มีใครคุมตัวเลขนี้ได้เลย
 *
 * งานหนึ่งรอบใช้เวลาราว 5 นาที จึงไม่รอคำตอบใน request เดียว — ส่งงานแล้ว
 * ถามความคืบหน้าเป็นระยะ ปิดแท็บแล้วกลับมาดูทีหลังงานก็ยังวิ่งอยู่
 *
 * ⚠️ รหัสผ่าน spantree ส่งออกไปครั้งเดียวตอนกดเริ่ม แล้วล้างออกจากหน้าจอทันที
 *    ไม่เก็บลง localStorage ไม่ใส่ store — ดูหมายเหตุใน services/olt.api.ts
 */

const USERNAME_KEY = 'r4.olt.username'

const username = ref('')
const password = ref('')
const valsText = ref('')
const threshold = ref('-25')

const submitting = ref(false)
const formError = ref<string | null>(null)

const current = ref<OltJobDetail | null>(null)
const jobs = ref<OltJob[]>([])
const listError = ref<string | null>(null)
const busyAction = ref(false)

const verdictFilter = ref<OltVerdict | 'all'>('all')

/** ตัวจับเวลาถามความคืบหน้า — ใช้ setTimeout ต่อกันเอง ไม่ใช่ setInterval
 *  เพราะถ้าเซิร์ฟเวอร์ตอบช้ากว่ารอบถาม คำขอจะซ้อนกันจนกลายเป็นยิงรัว */
let pollTimer: ReturnType<typeof setTimeout> | null = null

const parsed = computed(() => splitVals(valsText.value))
const canSubmit = computed(() =>
  !submitting.value && username.value.trim() !== '' && password.value !== ''
  && parsed.value.vals.length > 0 && parsed.value.bad.length === 0,
)

const results = computed(() => current.value?.results ?? [])
const counts = computed(() => tally(results.value))
const shownRows = computed(() =>
  verdictFilter.value === 'all'
    ? results.value
    : results.value.filter((r) => r.verdict === verdictFilter.value),
)

const eta = computed(() => (current.value ? etaSeconds(current.value) : null))
const took = computed(() => (current.value ? elapsedSeconds(current.value) : null))
const progressPct = computed(() => {
  const j = current.value
  if (!j || j.total === 0) return 0
  return Math.round((j.done / j.total) * 100)
})

function stopPolling() {
  if (pollTimer !== null) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

/** ถามสถานะซ้ำจนกว่างานจะจบ แล้วรีเฟรชรายการหนึ่งครั้ง */
function schedulePoll(id: string) {
  stopPolling()
  pollTimer = setTimeout(async () => {
    try {
      const job = await getJob(id)
      current.value = job
      if (isLive(job.status)) schedulePoll(id)
      else void refreshList()
    } catch {
      // เน็ตสะดุดชั่วคราวไม่ควรทำให้เลิกตามงาน ลองใหม่รอบหน้า
      schedulePoll(id)
    }
  }, 2_000)
}

async function refreshList() {
  try {
    jobs.value = await listJobs()
    listError.value = null
  } catch (err) {
    listError.value = errorMessage(err, 'โหลดรายการงานไม่สำเร็จ')
  }
}

async function openJob(id: string) {
  stopPolling()
  verdictFilter.value = 'all'
  try {
    const job = await getJob(id)
    current.value = job
    if (isLive(job.status)) schedulePoll(id)
  } catch (err) {
    listError.value = errorMessage(err, 'เปิดงานไม่สำเร็จ')
  }
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  formError.value = null

  try {
    const created = await createJob({
      username: username.value.trim(),
      password: password.value,
      vals: parsed.value.vals,
      threshold: Number(threshold.value),
    })

    // ล้างรหัสผ่านทันทีที่ส่งเสร็จ ไม่ต้องรอให้ผู้ใช้ปิดหน้า
    password.value = ''
    localStorage.setItem(USERNAME_KEY, username.value.trim())

    await openJob(created.id)
    await refreshList()
  } catch (err) {
    formError.value = errorMessage(err, 'ส่งงานไม่สำเร็จ')
  } finally {
    submitting.value = false
  }
}

async function stopJob() {
  const j = current.value
  if (!j) return
  busyAction.value = true
  try {
    await cancelJob(j.id)
    await openJob(j.id)
  } catch (err) {
    listError.value = errorMessage(err, 'ยกเลิกไม่สำเร็จ')
    await openJob(j.id)
  } finally {
    busyAction.value = false
  }
}

async function download() {
  const j = current.value
  if (!j) return
  busyAction.value = true
  try {
    await downloadExcel(j.id)
  } catch (err) {
    listError.value = errorMessage(err, 'โหลดไฟล์ไม่สำเร็จ')
  } finally {
    busyAction.value = false
  }
}

function startOver() {
  stopPolling()
  current.value = null
  verdictFilter.value = 'all'
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

onMounted(() => {
  username.value = localStorage.getItem(USERNAME_KEY) ?? ''
  void refreshList()
})

onUnmounted(stopPolling)
</script>

<template>
  <AppLayout>
    <PageHeader
      title="OLT Bot"
      description="ตรวจค่าแสง 1490Rx ทีละหลายรายการ แล้วได้ผลกลับมาเป็นไฟล์ Excel"
    >
      <template #actions>
        <BaseButton v-if="current" variant="ghost" size="sm" @click="startOver">
          สั่งงานใหม่
        </BaseButton>
      </template>
    </PageHeader>

    <div v-if="listError" class="alert alert-error mb-4">
      <span>{{ listError }}</span>
    </div>

    <!-- ── ฟอร์มส่งงาน ─────────────────────────────────────────────────── -->
    <form
      v-if="!current"
      class="card border border-base-300 bg-base-100"
      @submit.prevent="submit"
    >
      <div class="card-body gap-5">
        <div class="grid gap-4 sm:grid-cols-2">
          <BaseField
            v-model="username"
            label="ชื่อผู้ใช้ spantree"
            autocomplete="username"
            :disabled="submitting"
            hint="บัญชีของระบบ True ไม่ใช่บัญชี R4"
          />
          <BaseField
            v-model="password"
            label="รหัสผ่าน spantree"
            type="password"
            autocomplete="current-password"
            :disabled="submitting"
            hint="ใช้ล็อกอินครั้งเดียวแล้วทิ้ง ระบบไม่เก็บรหัสนี้ไว้ที่ไหน"
          />
        </div>

        <BaseTextarea
          v-model="valsText"
          label="รายการที่จะตรวจ"
          :rows="8"
          :disabled="submitting"
          hint="วางจาก Excel หรือ val_list.txt ได้เลย คั่นด้วยขึ้นบรรทัด เว้นวรรค หรือจุลภาคก็ได้"
        />

        <div class="flex flex-wrap items-center gap-3 text-sm">
          <span v-if="parsed.vals.length" class="badge badge-neutral">
            อ่านได้ {{ parsed.vals.length }} รายการ
          </span>
          <span v-if="parsed.bad.length" class="text-error">
            รูปแบบไม่ถูกต้อง {{ parsed.bad.length }} ตัว:
            {{ parsed.bad.slice(0, 5).join(', ') }}{{ parsed.bad.length > 5 ? ' …' : '' }}
            <span class="opacity-70">(ต้องเป็น A–Z หรือ 0–9 จำนวน 11 ตัว)</span>
          </span>
        </div>

        <div class="max-w-xs">
          <BaseField
            v-model="threshold"
            label="เส้นแบ่งผ่าน/ไม่ผ่าน (1490Rx)"
            type="number"
            :disabled="submitting"
            hint="ยิ่งน้อยยิ่งแย่ — ที่ -25 หมายถึง -24 ผ่าน ส่วน -25 และ -26 ไม่ผ่าน"
          />
        </div>

        <div v-if="formError" class="alert alert-error">
          <span>{{ formError }}</span>
        </div>

        <div class="card-actions items-center gap-4">
          <BaseButton type="submit" :disabled="!canSubmit" :loading="submitting">
            เริ่มตรวจ
          </BaseButton>
          <p v-if="parsed.vals.length" class="text-sm opacity-70">
            ประมาณ {{ formatDuration(Math.round(parsed.vals.length * 1.8)) }}
          </p>
        </div>
      </div>
    </form>

    <!-- ── งานที่กำลังดูอยู่ ────────────────────────────────────────────── -->
    <div v-else class="space-y-6">
      <div class="card border border-base-300 bg-base-100">
        <div class="card-body gap-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class="badge" :class="JOB_STATUS_BADGE[current.status]">
                {{ JOB_STATUS_LABEL[current.status] }}
              </span>
              <span class="text-sm opacity-70">
                {{ current.total }} รายการ · เส้นแบ่ง {{ current.threshold }} ·
                บัญชี {{ current.spantreeUsername }}
              </span>
            </div>

            <div class="flex flex-wrap gap-2">
              <BaseButton
                v-if="isLive(current.status)"
                variant="ghost"
                size="sm"
                :loading="busyAction"
                @click="stopJob"
              >
                ยกเลิกงาน
              </BaseButton>
              <BaseButton
                v-if="results.length"
                size="sm"
                :loading="busyAction"
                @click="download"
              >
                โหลด Excel
              </BaseButton>
            </div>
          </div>

          <div v-if="isLive(current.status)">
            <progress class="progress progress-primary w-full" :value="current.done" :max="current.total" />
            <p class="mt-2 text-sm opacity-70">
              <template v-if="current.status === 'queued'">
                รอคิวอยู่<template v-if="current.queuePosition"> ลำดับที่ {{ current.queuePosition }}</template>
                — มีงานอื่นทำอยู่ก่อน
              </template>
              <template v-else>
                {{ current.done }}/{{ current.total }} ({{ progressPct }}%)
                <template v-if="eta !== null"> · เหลืออีกประมาณ {{ formatDuration(eta) }}</template>
              </template>
            </p>
            <p class="mt-1 text-xs opacity-60">ปิดแท็บได้ งานทำงานอยู่ที่เซิร์ฟเวอร์ กลับมาเปิดดูทีหลังได้</p>
          </div>

          <div v-else-if="current.error" class="alert alert-error">
            <span>{{ current.error }}</span>
          </div>

          <p v-else-if="took !== null" class="text-sm opacity-70">
            ใช้เวลา {{ formatDuration(took) }} · เสร็จเมื่อ {{ when(current.finishedAt) }}
          </p>
        </div>
      </div>

      <!-- สรุปผล กดที่การ์ดเพื่อกรองตาราง -->
      <div v-if="results.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <button
          type="button"
          class="rounded-lg border p-3 text-left transition"
          :class="verdictFilter === 'all' ? 'border-primary bg-base-200' : 'border-base-300 hover:border-primary'"
          @click="verdictFilter = 'all'"
        >
          <div class="text-xs opacity-70">ทั้งหมด</div>
          <div class="text-xl font-semibold">{{ results.length }}</div>
        </button>
        <button
          v-for="(n, verdict) in counts"
          :key="verdict"
          type="button"
          class="rounded-lg border p-3 text-left transition"
          :class="verdictFilter === verdict ? 'border-primary bg-base-200' : 'border-base-300 hover:border-primary'"
          @click="verdictFilter = verdict as OltVerdict"
        >
          <div class="text-xs opacity-70">{{ verdict }}</div>
          <div class="text-xl font-semibold">{{ n }}</div>
        </button>
      </div>

      <div v-if="results.length" class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>val</th>
              <th class="text-right">1490Rx max</th>
              <th class="text-right">1490Rx min</th>
              <th>ผล</th>
              <th class="text-right">online</th>
              <th class="text-right">occupied</th>
              <th>รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in shownRows" :key="r.val">
              <td class="font-mono">{{ r.val }}</td>
              <td class="text-right font-mono">{{ dash(r.rxMax) }}</td>
              <td class="text-right font-mono">{{ dash(r.rxMin) }}</td>
              <td><span class="badge badge-sm" :class="VERDICT_BADGE[r.verdict]">{{ r.verdict }}</span></td>
              <td class="text-right">{{ r.online }}</td>
              <td class="text-right">{{ r.occupied }}</td>
              <td class="max-w-md truncate text-xs opacity-70">{{ r.status }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── ประวัติงาน ───────────────────────────────────────────────────── -->
    <section class="mt-10">
      <h2 class="mb-3 text-sm font-medium uppercase tracking-wide opacity-60">งานล่าสุด</h2>

      <p v-if="jobs.length === 0" class="text-sm opacity-60">ยังไม่มีใครสั่งงาน</p>

      <div v-else class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>เมื่อ</th>
              <th>ผู้สั่ง</th>
              <th>สถานะ</th>
              <th class="text-right">ความคืบหน้า</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in jobs" :key="j.id" class="hover">
              <td class="whitespace-nowrap">{{ when(j.createdAt) }}</td>
              <td>{{ j.createdByName ?? j.createdByUsername ?? '—' }}</td>
              <td>
                <span class="badge badge-sm" :class="JOB_STATUS_BADGE[j.status]">
                  {{ JOB_STATUS_LABEL[j.status] }}
                </span>
              </td>
              <td class="text-right font-mono">{{ j.done }}/{{ j.total }}</td>
              <td class="text-right">
                <BaseButton variant="ghost" size="sm" @click="openJob(j.id)">เปิดดู</BaseButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </AppLayout>
</template>

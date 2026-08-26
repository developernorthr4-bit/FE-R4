<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import WeekPicker from '../components/WeekPicker.vue'
import BarList from '../components/charts/BarList.vue'
import ProgressList from '../components/charts/ProgressList.vue'
import StatTile from '../components/charts/StatTile.vue'
import TrendLine from '../components/charts/TrendLine.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import { errorMessage } from '../lib/api'
import {
  fiscalLabel, formatThaiDate, getPmSummary, measurementBreakdown, type PmSummary,
} from '../services/maintenance.api'
import {
  delta, formatMinutes, formatWeekRange, getTrend, getWeekly, publishWeek, saveNarrative,
  type TrendPoint, type WeeklyResponse,
} from '../services/reports.api'
import { useAuthStore } from '../stores/auth'

/**
 * แดชบอร์ดผู้บริหาร — สรุปรายสัปดาห์
 *
 * ทุกคนที่ล็อกอินดูได้ (ผู้บริหารเป็น viewer) เขียนสรุปและเผยแพร่ได้เฉพาะ admin ขึ้นไป
 */
const auth = useAuthStore()
const canPublish = computed(() => auth.can('admin'))

/** สัปดาห์ ISO ของวันนี้ ตามเขตเวลาไทย — เพดานของตัวเลือกสัปดาห์ */
function isoWeekNow(): { year: number; week: number } {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return {
    year: t.getUTCFullYear(),
    week: Math.ceil(((t.getTime() - start.getTime()) / 86400000 + 1) / 7),
  }
}

const latest = isoWeekNow()
const year = ref(latest.year)
const week = ref(latest.week)

const data = ref<WeeklyResponse | null>(null)
const trend = ref<TrendPoint[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const narrative = ref('')
const saving = ref(false)
const publishing = ref(false)
/** true = ดูตัวเลขที่แช่แข็งไว้ตอนเผยแพร่ แทนตัวเลขสด */
const showSnapshot = ref(false)

const live = computed(() => data.value?.current ?? null)
const snapshot = computed(() => data.value?.report?.snapshot ?? null)
const shown = computed(() => (showSnapshot.value && snapshot.value ? snapshot.value : live.value))
const totals = computed(() => shown.value?.totals ?? null)
const prev = computed(() => data.value?.previous ?? null)

/**
 * ตัวเลขสดต่างจากตอนเผยแพร่หรือยัง
 *
 * ถ้าไม่มีป้ายนี้ ผู้ใช้จะไม่มีทางรู้เลยว่ารายงานที่ส่งผู้บริหารไปแล้วล้าสมัย
 * เพราะมีคนกลับมาแก้เหตุการณ์ย้อนหลัง
 */
const snapshotStale = computed(() => {
  const s = snapshot.value?.totals
  const l = live.value?.totals
  if (!s || !l) return false
  return (Object.keys(l) as (keyof typeof l)[]).some((k) => l[k] !== s[k])
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const [weekly, points] = await Promise.all([
      getWeekly(year.value, week.value),
      getTrend(year.value, week.value, 8),
    ])
    data.value = weekly
    trend.value = points
    narrative.value = weekly.report?.narrative ?? ''
    showSnapshot.value = false
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายงานไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

/*
 * ─── งานบำรุงรักษาเชิงป้องกัน (PM) ────────────────────────────────────────
 *
 * แกนเวลาคนละอันกับรายงานสัปดาห์ — PM ผูกกับปีงบประมาณ (1 ก.ค. – 30 มิ.ย.)
 * จึงโหลดแยกและไม่รีโหลดตอนเปลี่ยนสัปดาห์ ถ้าผูกรวมกัน การเลื่อนดูสัปดาห์
 * ที่แล้วจะยิงคิวรีหนักที่ให้ผลเหมือนเดิมทุกครั้งโดยไม่ได้อะไรกลับมา
 */
const pm = ref<PmSummary | null>(null)
const pmLoading = ref(true)
const pmError = ref<string | null>(null)

/** เรียงช่วง SOH เอง — BE group by ไม่รับประกันลำดับ และ 90-100 ต้องมาก่อนเสมอ */
const SOH_ORDER = ['90-100', '80-89', '70-79', '50-69', '1-49']

const pmPct = computed(() => {
  const p = pm.value?.progress
  if (!p || p.cabinetsTotal === 0) return 0
  return Math.round((p.done / p.cabinetsTotal) * 100)
})

const sohBuckets = computed(() => {
  const b = pm.value?.batteries
  if (!b) return []
  return SOH_ORDER
    .map((bucket) => ({ bucket, n: b.buckets.find((x) => x.bucket === bucket)?.n ?? 0 }))
    .filter((x) => x.n > 0)
})

/** ห้าหมวดของการวัด ต้องบวกกันได้เท่าจำนวนก้อนทั้งหมด — ดู measurementBreakdown */
const measurement = computed(() => (pm.value ? measurementBreakdown(pm.value.batteries) : []))

async function loadPm(fy?: string) {
  pmLoading.value = true
  pmError.value = null
  try {
    pm.value = await getPmSummary(fy)
  } catch (err) {
    pmError.value = errorMessage(err, 'โหลดสรุปงาน PM ไม่สำเร็จ')
  } finally {
    pmLoading.value = false
  }
}

onMounted(() => {
  void load()
  void loadPm()
})
watch([year, week], load)

function onWeekChange(y: number, w: number) {
  year.value = y
  week.value = w
}

async function onSaveDraft() {
  saving.value = true
  error.value = null
  notice.value = null
  try {
    await saveNarrative(year.value, week.value, narrative.value)
    notice.value = 'บันทึกฉบับร่างแล้ว'
  } catch (err) {
    error.value = errorMessage(err, 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

async function onPublish() {
  publishing.value = true
  error.value = null
  notice.value = null
  try {
    const res = await publishWeek(year.value, week.value, narrative.value)
    notice.value = data.value?.report?.status === 'published'
      ? 'อัปเดตตัวเลขที่เผยแพร่แล้ว'
      : 'เผยแพร่รายงานแล้ว'
    await load()
    void res
  } catch (err) {
    error.value = errorMessage(err, 'เผยแพร่ไม่สำเร็จ')
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <AppLayout>
    <PageHeader
      title="สรุปรายสัปดาห์"
      :description="shown ? `${formatWeekRange(shown.weekStart)} · สัปดาห์ที่ ${shown.week}` : 'ระบบติดตาม Network Event ภาคเหนือ'"
    >
      <template #actions>
        <WeekPicker
          :year="year" :week="week" :max-year="latest.year" :max-week="latest.week"
          @change="onWeekChange"
        />
      </template>
    </PageHeader>

    <div v-if="notice" role="status" class="alert alert-success mb-4 text-sm">
      <span>{{ notice }}</span>
    </div>
    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm">
      <span>{{ error }}</span>
    </div>

    <div v-if="loading" class="flex justify-center py-20">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <template v-else-if="totals && shown">
      <!-- สถานะการเผยแพร่ -->
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <span
          v-if="data?.report?.status === 'published'"
          class="badge badge-success gap-1"
        >✓ เผยแพร่แล้ว</span>
        <span v-else class="badge badge-ghost">ยังไม่เผยแพร่</span>

        <span v-if="data?.isCurrentWeek" class="text-xs opacity-60">
          สัปดาห์นี้ยังไม่จบ ตัวเลขจะเปลี่ยนได้อีก
        </span>

        <template v-if="snapshot">
          <div class="join">
            <button
              type="button" class="btn btn-xs join-item"
              :class="!showSnapshot && 'btn-active'"
              @click="showSnapshot = false"
            >
              ตัวเลขสด
            </button>
            <button
              type="button" class="btn btn-xs join-item"
              :class="showSnapshot && 'btn-active'"
              @click="showSnapshot = true"
            >
              ตัวเลขที่เผยแพร่
            </button>
          </div>
          <span v-if="snapshotStale" class="badge badge-warning badge-sm gap-1">
            ⚠ ตัวเลขสดต่างจากตอนเผยแพร่
          </span>
        </template>
      </div>

      <!-- แถวตัวเลขหลัก -->
      <p class="mb-2 text-xs opacity-60">
        นับเฉพาะเหตุการณ์จริง — รายการที่บันทึกว่า &quot;ไม่มีเหตุการณ์ (ปกติ)&quot;
        และรายการที่ยกเลิก ไม่ถูกนับ
      </p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="เหตุการณ์ทั้งหมด" :value="totals.eventCount"
          v-bind="prev && !showSnapshot ? delta(totals.eventCount, prev.eventCount) : {}"
          good-when="down"
        />
        <StatTile
          label="ยังไม่ปิด" :value="totals.openCount"
          v-bind="prev && !showSnapshot ? delta(totals.openCount, prev.openCount) : {}"
          good-when="down"
        />
        <StatTile
          label="แก้ไขแล้ว" :value="totals.resolvedCount"
          v-bind="prev && !showSnapshot ? delta(totals.resolvedCount, prev.resolvedCount) : {}"
          good-when="up"
        />
        <StatTile
          label="เวลาขัดข้องรวม" :value="formatMinutes(totals.totalDurationMin)"
          hint="รวมเฉพาะเหตุการณ์ที่ระบุเวลากู้คืนแล้ว"
        />
        <StatTile
          label="สถานีที่ได้รับผลกระทบ" :value="totals.affectedSiteCount"
          v-bind="prev && !showSnapshot ? delta(totals.affectedSiteCount, prev.affectedSiteCount) : {}"
          good-when="down"
        />
      </div>

      <!--
        ความครบถ้วนของการรายงาน — คนละคำถามกับ "เกิดเหตุกี่ครั้ง"
        ตอบว่า "ตรวจครบทุกจังหวัดหรือยัง" ซึ่งเป็นสิ่งที่หัวหน้าทีมต้องตามงานได้ทันที
      -->
      <div class="card mt-4 border border-base-300 bg-base-100">
        <div class="card-body gap-2">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="card-title text-base">การรายงานประจำวัน</h2>
            <span class="text-sm opacity-70">
              นับวันทำการที่ผ่านมาแล้ว {{ shown.coverage.workingDays }} วัน (จันทร์–ศุกร์)
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <span class="text-3xl font-semibold tabular-nums">
              {{ shown.coverage.complete }}<span class="text-base opacity-50">/{{ shown.coverage.provinceCount }}</span>
            </span>
            <span class="text-sm opacity-70">จังหวัดรายงานครบทุกวันทำการ</span>
            <progress
              class="progress w-40"
              :class="shown.coverage.missing.length ? 'progress-warning' : 'progress-success'"
              :value="shown.coverage.complete" :max="shown.coverage.provinceCount"
            />
          </div>

          <div v-if="shown.coverage.missing.length" class="mt-1">
            <p class="text-xs opacity-70">ยังขาด — ตัวเลขคือจำนวนวันที่บันทึกแล้ว</p>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <span
                v-for="m in shown.coverage.missing" :key="m.id"
                class="badge badge-warning badge-sm gap-1"
              >
                {{ m.name }} {{ m.reported }}/{{ shown.coverage.workingDays }}
              </span>
            </div>
          </div>
          <p v-else class="text-sm text-success">ครบทุกจังหวัด</p>
        </div>
      </div>

      <!-- แนวโน้ม -->
      <div class="card mt-4 border border-base-300 bg-base-100">
        <div class="card-body">
          <h2 class="card-title text-base">จำนวนเหตุการณ์ 8 สัปดาห์ล่าสุด</h2>
          <TrendLine :points="trend" :current-week="week" />
        </div>
      </div>

      <!-- แยกตามมิติ -->
      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body">
            <h2 class="card-title text-base">แยกตามจังหวัด</h2>
            <p class="text-xs opacity-60">
              {{ shown.bySubRegion.map((r) => `${r.name} ${r.count}`).join(' · ') || '—' }}
            </p>
            <BarList :items="shown.byProvince" :limit="10" class="mt-2" />
          </div>
        </div>

        <div class="card border border-base-300 bg-base-100">
          <div class="card-body">
            <h2 class="card-title text-base">แยกตามสาเหตุ</h2>
            <p class="text-xs opacity-60">ช่วยตอบว่าควรลงทุนแก้ที่จุดไหนก่อน</p>
            <BarList :items="shown.byRootCause" :limit="8" class="mt-2" />
          </div>
        </div>
      </div>

      <!-- ตารางประกอบ: ข้อมูลเดียวกันในรูปแบบที่คัดลอกและอ่านด้วยโปรแกรมอ่านหน้าจอได้ -->
      <div class="card mt-4 border border-base-300 bg-base-100">
        <div class="card-body">
          <h2 class="card-title text-base">แยกตามประเภทเหตุการณ์</h2>
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>ประเภท</th>
                  <th class="text-right">จำนวน</th>
                  <th class="text-right">สัดส่วน</th>
                  <th class="text-right">เวลาขัดข้องรวม</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in shown.byEventType" :key="`${t.id}-${t.name}`">
                  <td>{{ t.name }}</td>
                  <td class="text-right tabular-nums">{{ t.count }}</td>
                  <td class="text-right tabular-nums opacity-70">
                    {{ Math.round((t.count / Math.max(totals.eventCount, 1)) * 100) }}%
                  </td>
                  <td class="text-right tabular-nums">{{ formatMinutes(t.durationMin) }}</td>
                </tr>
                <tr v-if="!shown.byEventType.length">
                  <td colspan="4" class="text-center opacity-60">ไม่มีข้อมูลในสัปดาห์นี้</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- สรุปเชิงบรรยาย -->
      <div class="card mt-4 border border-base-300 bg-base-100">
        <div class="card-body gap-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="card-title text-base">สรุปสำหรับผู้บริหาร</h2>
            <span v-if="data?.report?.publishedAt" class="text-xs opacity-60">
              เผยแพร่ล่าสุด
              {{ new Date(data.report.publishedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) }}
            </span>
          </div>

          <template v-if="canPublish">
            <textarea
              v-model="narrative"
              rows="5"
              class="textarea textarea-bordered w-full"
              placeholder="สรุปภาพรวมของสัปดาห์ สาเหตุหลัก และแผนที่จะทำต่อ"
              :disabled="saving || publishing"
            />
            <div class="flex flex-wrap justify-end gap-2">
              <BaseButton variant="ghost" :loading="saving" @click="onSaveDraft">
                บันทึกฉบับร่าง
              </BaseButton>
              <BaseButton
                :loading="publishing"
                :disabled="totals.eventCount === 0"
                @click="onPublish"
              >
                {{ data?.report?.status === 'published' ? 'เผยแพร่ใหม่ (อัปเดตตัวเลข)' : 'เผยแพร่' }}
              </BaseButton>
            </div>
            <p v-if="data?.report?.status === 'published'" class="text-xs opacity-60">
              การเผยแพร่ใหม่จะเขียนทับตัวเลขที่แช่แข็งไว้ด้วยค่าปัจจุบัน
            </p>
          </template>

          <p v-else-if="narrative" class="whitespace-pre-wrap text-sm">{{ narrative }}</p>
          <p v-else class="text-sm opacity-60">ยังไม่มีสรุปสำหรับสัปดาห์นี้</p>
        </div>
      </div>
    </template>

    <!--
      ── งานบำรุงรักษาเชิงป้องกัน (PM) ─────────────────────────────────────
      อยู่นอกบล็อกรายงานสัปดาห์โดยตั้งใจ สัปดาห์ที่ไม่มีเหตุการณ์เลยก็ยังต้องเห็น
      ส่วนนี้ และตัวเลขที่นี่ไม่เกี่ยวกับสัปดาห์ที่เลือกด้านบนเลย
    -->
    <div class="divider mb-4 mt-10" />

    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">
          งานบำรุงรักษาเชิงป้องกัน (PM) — ตู้และแบตเตอรี่
        </h2>
        <p v-if="pm" class="mt-1 text-sm opacity-70">
          ปีงบ {{ fiscalLabel(pm.fiscalYear) }} ·
          {{ formatThaiDate(pm.window.start) }} – {{ formatThaiDate(pm.window.end) }} ·
          <span class="opacity-80">ไม่ขึ้นกับสัปดาห์ที่เลือกด้านบน</span>
        </p>
      </div>
      <label v-if="pm" class="form-control">
        <span class="label-text text-xs opacity-70">ปีงบประมาณ</span>
        <select
          class="select select-sm select-bordered" :value="pm.fiscalYear" :disabled="pmLoading"
          @change="loadPm(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="f in pm.fiscalYears" :key="f" :value="f">{{ fiscalLabel(f) }}</option>
        </select>
      </label>
    </div>

    <div v-if="pmError" role="alert" class="alert alert-error mb-4 text-sm">
      <span>{{ pmError }}</span>
    </div>

    <div v-if="pmLoading" class="flex justify-center py-12">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <template v-else-if="pm">
      <!-- ความคืบหน้าการตรวจ -->
      <div class="card border border-base-300 bg-base-100">
        <div class="card-body gap-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="card-title text-base">ความคืบหน้าการตรวจ</h3>
            <span class="text-sm opacity-70">
              นับเฉพาะตู้ที่ยังใช้งานอยู่ในสถานีที่ยังไม่ถูกลบ
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <span class="text-3xl font-semibold tabular-nums">
              {{ pm.progress.done.toLocaleString() }}<span
                class="text-base opacity-50"
              >/{{ pm.progress.cabinetsTotal.toLocaleString() }}</span>
            </span>
            <span class="text-sm opacity-70">ตู้ที่ตรวจแล้วในปีงบนี้</span>
            <progress
              class="progress w-40"
              :class="pmPct >= 80 ? 'progress-success' : pmPct >= 40 ? 'progress-warning' : 'progress-error'"
              :value="pm.progress.done" :max="Math.max(pm.progress.cabinetsTotal, 1)"
            />
            <span class="text-sm tabular-nums opacity-70">{{ pmPct }}%</span>
          </div>

          <p class="text-xs opacity-60">ตัวเลขคือ ตรวจแล้ว/ทั้งหมด · เรียงจากจังหวัดที่ค้างมากที่สุด</p>
          <ProgressList :items="pm.progress.provinces" empty-text="ยังไม่มีตู้ในระบบ" />
        </div>
      </div>

      <!-- ตัวเลขที่ต้องลงมือ -->
      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="SOH เฉลี่ย" :value="pm.batteries.avgSoh === null ? '—' : `${pm.batteries.avgSoh}%`"
          good-when="neutral"
          :hint="`จาก ${pm.batteries.readable.toLocaleString()} ก้อนที่วัดได้ค่าจริง`"
        />
        <StatTile
          label="SOH ต่ำกว่า 70%" :value="pm.batteries.lowSoh" good-when="neutral"
          hint="ก้อนที่วัดได้ค่าและค่าต่ำจริง ไม่รวมก้อนที่วัดได้ 0"
        />
        <StatTile
          label="ตำหนิทางกายภาพ" :value="pm.batteries.defectBanks" good-when="neutral"
          :hint="pm.batteries.defects.map((d) => `${d.name} ${d.n}`).join(' · ') || 'ไม่พบตำหนิ'"
        />
      </div>

      <!--
        เตือนเรื่องที่ตัวเลข SOH ตอบไม่ได้
        แบตบวมรายงาน SOH 99% ได้สบาย ๆ ถ้าดูแต่ค่า SOH จะพลาดของที่อันตรายที่สุด
      -->
      <div
        v-if="pm.batteries.defectBanks" role="note"
        class="alert alert-warning mt-3 py-2 text-sm"
      >
        <span>
          ตำหนิทางกายภาพเป็นคนละเรื่องกับ SOH — แบตที่บวมหรือมีขี้เกลือยังรายงาน SOH สูงได้ตามปกติ
          ค่า SOH จึงมองไม่เห็นความเสี่ยงกลุ่มนี้
        </span>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <!-- การกระจาย SOH -->
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body">
            <h3 class="card-title text-base">การกระจายค่า SOH</h3>
            <p class="text-xs opacity-60">
              เฉพาะ {{ pm.batteries.readable.toLocaleString() }} ก้อนที่วัดได้ค่าจริง
            </p>
            <div class="mt-2 overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr><th>ช่วง SOH</th><th class="text-right">ก้อน</th><th class="text-right">สัดส่วน</th></tr>
                </thead>
                <tbody>
                  <tr v-for="s in sohBuckets" :key="s.bucket">
                    <td>{{ s.bucket }}%</td>
                    <td class="text-right tabular-nums">{{ s.n.toLocaleString() }}</td>
                    <td class="text-right tabular-nums opacity-70">
                      {{ (s.n / Math.max(pm.batteries.readable, 1) * 100).toFixed(1) }}%
                    </td>
                  </tr>
                  <tr v-if="!sohBuckets.length">
                    <td colspan="3" class="text-center opacity-60">ยังไม่มีค่าที่วัดได้</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- แยกตามชนิดแบต -->
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body">
            <h3 class="card-title text-base">แยกตามชนิดแบตเตอรี่</h3>
            <p class="text-xs opacity-60">ค่าเฉลี่ยคิดเฉพาะก้อนที่วัดได้ค่าจริง</p>
            <div class="mt-2 overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>ชนิด</th>
                    <th class="text-right">ก้อน</th>
                    <th class="text-right">SOH เฉลี่ย</th>
                    <th class="text-right">ต่ำกว่า 70%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in pm.batteries.byType" :key="t.code">
                    <td>{{ t.name }}</td>
                    <td class="text-right tabular-nums">{{ t.banks.toLocaleString() }}</td>
                    <td class="text-right tabular-nums">{{ t.avgSoh === null ? '—' : `${t.avgSoh}%` }}</td>
                    <td class="text-right tabular-nums" :class="t.lowSoh > 0 ? 'text-warning' : ''">
                      {{ t.lowSoh }}
                    </td>
                  </tr>
                  <tr v-if="!pm.batteries.byType.length">
                    <td colspan="4" class="text-center opacity-60">ยังไม่มีข้อมูล</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!--
        คุณภาพของข้อมูลที่วัดมา
        แถบนี้เรนเดอร์จากรายการเดียวที่บวกกันได้เท่ายอดทั้งหมดเสมอ ไม่ใช่จาก
        ตัวเลขที่หยิบมาทีละตัว — ตอนทำครั้งแรกลืมหมวด "ไม่ได้วัด" ไป 1,954 ก้อน
        แล้วไม่มีอะไรบนหน้าจอบอกว่าข้อมูลหายไป 10%
      -->
      <div class="card mt-4 border border-base-300 bg-base-100">
        <div class="card-body gap-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="card-title text-base">คุณภาพของข้อมูลที่วัดมา</h3>
            <span class="text-sm opacity-70">
              แบต {{ pm.batteries.banks.toLocaleString() }} ก้อนในผลตรวจล่าสุด
            </span>
          </div>

          <div class="flex h-4 w-full overflow-hidden rounded-sm bg-base-200">
            <span
              v-for="m in measurement" :key="m.key" :class="m.tone"
              :style="{ width: `${(m.n / Math.max(pm.batteries.banks, 1)) * 100}%` }"
              :title="`${m.label} ${m.n.toLocaleString()}`"
            />
          </div>

          <ul class="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <li v-for="m in measurement" :key="m.key" class="flex items-center gap-2">
              <span class="size-2.5 rounded-sm" :class="m.tone" />
              <span>{{ m.label }}</span>
              <span class="tabular-nums opacity-70">
                {{ m.n.toLocaleString() }}
                ({{ (m.n / Math.max(pm.batteries.banks, 1) * 100).toFixed(1) }}%)
              </span>
            </li>
          </ul>

          <p class="text-xs opacity-60">
            <b>ไม่ได้วัด</b> คือไม่มีค่า SOH และไม่มีหมายเหตุ ต่างจาก <b>วัดได้ 0</b>
            ซึ่งมีเลข 0 อยู่จริงแต่ไม่มีหมายเหตุกำกับ — ข้อมูลที่มีแยกไม่ออกว่าแบตตาย
            หรือช่างข้ามช่องไป จึงไม่ถูกนับรวมเป็น "SOH ต่ำ" และไม่ถูกเอาไปหารค่าเฉลี่ย
          </p>

          <p v-if="pm.cabinets.withoutBattery" class="text-xs opacity-60">
            อีก {{ pm.cabinets.withoutBattery.toLocaleString() }} ตู้ที่ตรวจแล้วไม่มีแบตสักก้อน
            — ระบุเหตุผลไว้ {{ pm.cabinets.withoutBatteryReasonGiven.toLocaleString() }} ตู้
            (ส่วนใหญ่เป็นตู้ 8U ที่ใช้แบตร่วมกับตู้หลัก) ที่เหลือไม่ระบุ
            จึงแยกไม่ออกว่าไม่มีจริงหรือไม่ได้กรอก
          </p>
        </div>
      </div>

      <!-- จังหวัดที่ต้องตามงาน -->
      <div class="card mt-4 border border-base-300 bg-base-100">
        <div class="card-body">
          <h3 class="card-title text-base">จังหวัดที่มีของน่าห่วง</h3>
          <p class="text-xs opacity-60">
            เรียงตามจำนวนก้อนที่มีตำหนิ เพราะเป็นความเสี่ยงที่ค่า SOH มองไม่เห็น
          </p>
          <div class="mt-2 overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>จังหวัด</th>
                  <th class="text-right">ก้อนที่ตรวจ</th>
                  <th class="text-right">SOH เฉลี่ย</th>
                  <th class="text-right">ต่ำกว่า 70%</th>
                  <th class="text-right">ตำหนิ</th>
                  <th class="text-right">อ่านค่าไม่ได้</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in pm.provinceConcerns" :key="p.id" class="hover">
                  <td>{{ p.name }}</td>
                  <td class="text-right tabular-nums opacity-70">{{ p.banks.toLocaleString() }}</td>
                  <td class="text-right tabular-nums">{{ p.avgSoh === null ? '—' : `${p.avgSoh}%` }}</td>
                  <td class="text-right tabular-nums" :class="p.lowSoh ? 'text-warning' : 'opacity-40'">
                    {{ p.lowSoh || '—' }}
                  </td>
                  <td class="text-right tabular-nums" :class="p.defects ? 'text-error font-medium' : 'opacity-40'">
                    {{ p.defects || '—' }}
                  </td>
                  <td class="text-right tabular-nums opacity-70">{{ p.unreadable || '—' }}</td>
                </tr>
                <tr v-if="!pm.provinceConcerns.length">
                  <td colspan="6" class="text-center opacity-60">ยังไม่มีผลตรวจในปีงบนี้</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="mt-1 text-xs opacity-60">
            ตัวเลขตำหนิกระจุกอยู่ที่ไม่กี่จังหวัด ข้อมูลที่มีแยกไม่ออกว่าแบตที่นั่นแย่กว่าจริง
            หรือทีมช่างที่นั่นเป็นทีมที่กรอกช่องตำหนิครบกว่าทีมอื่น
          </p>
        </div>
      </div>
    </template>
  </AppLayout>
</template>

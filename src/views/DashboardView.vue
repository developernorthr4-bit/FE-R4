<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import WeekPicker from '../components/WeekPicker.vue'
import BarList from '../components/charts/BarList.vue'
import StatTile from '../components/charts/StatTile.vue'
import TrendLine from '../components/charts/TrendLine.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import { errorMessage } from '../lib/api'
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

onMounted(load)
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
  </AppLayout>
</template>

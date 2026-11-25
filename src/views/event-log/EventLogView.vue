<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WeekPicker from '@/components/common/WeekPicker.vue'
import EventDashboard from '@/components/event-log/EventDashboard.vue'
import EventRecord from '@/components/event-log/EventRecord.vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { todayLocal } from '@/lib/format'
import { isDate, mondayOf } from '@/lib/iso-week'

/**
 * บันทึก Event รายวัน + Dashboard รายสัปดาห์ (จันทร์–อาทิตย์)
 * แท็บและสัปดาห์อยู่ใน URL (?tab=dashboard&week=2026-11-16) — รีเฟรช/ส่งลิงก์แล้วได้หน้าเดิม
 */
const route = useRoute()
const router = useRouter()

const thisWeek = mondayOf(todayLocal())
const tab = computed(() => (route.query.tab === 'dashboard' ? 'dashboard' : 'record'))
const weekStart = computed(() => {
  const w = route.query.week
  const start = isDate(w) ? mondayOf(w) : thisWeek
  return start > thisWeek ? thisWeek : start
})

function go(next: { tab?: string; week?: string }) {
  const t = next.tab ?? tab.value
  const w = next.week ?? weekStart.value
  void router.replace({ query: { ...(t === 'dashboard' ? { tab: t } : {}), ...(w === thisWeek ? {} : { week: w }) } })
}
</script>

<template>
  <AppLayout>
    <PageHeader title="บันทึก Event" description="บันทึกเหตุการณ์รายวัน 15 จังหวัด และสรุปเป็นรายสัปดาห์ จันทร์ – อาทิตย์" />

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" class="tabs tabs-box w-fit">
        <button type="button" role="tab" class="tab" :class="tab === 'record' ? 'tab-active' : ''" :aria-selected="tab === 'record'" @click="go({ tab: 'record' })">
          บันทึกรายวัน
        </button>
        <button type="button" role="tab" class="tab" :class="tab === 'dashboard' ? 'tab-active' : ''" :aria-selected="tab === 'dashboard'" @click="go({ tab: 'dashboard' })">
          Dashboard สัปดาห์
        </button>
      </div>
      <WeekPicker :week-start="weekStart" :max-week-start="thisWeek" @change="(w) => go({ week: w })" />
    </div>

    <EventDashboard v-if="tab === 'dashboard'" :week-start="weekStart" />
    <EventRecord v-else :week-start="weekStart" />
  </AppLayout>
</template>

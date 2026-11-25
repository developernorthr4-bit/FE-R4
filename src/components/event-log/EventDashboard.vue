<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BarList from '@/components/charts/BarList.vue'
import StatTile from '@/components/charts/StatTile.vue'
import EventHeatGrid from '@/components/event-log/EventHeatGrid.vue'
import EventItemLine from '@/components/event-log/EventItemLine.vue'
import { errorMessage } from '@/lib/api'
import { cellText } from '@/lib/event-log'
import { formatDateTime } from '@/lib/format'
import { addDays, daysOf, formatDowDay, formatWeekRange } from '@/lib/iso-week'
import { getEventDashboard, type EventDashboard, type EventItem } from '@/services/event-log.api'
import { fmtDowntimeTotal } from '@/services/tickets.api'

/**
 * แท็บ "Dashboard สัปดาห์" — สรุปคำนวณสดจากบันทึก ไม่มีการเก็บผล
 * กติกานับอยู่ที่ BE-R4/src/event-log/summary.ts
 */
const props = defineProps<{ weekStart: string }>()

const TOP_REGION = 8
const TOP_PROVINCE = 3

const data = ref<EventDashboard | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const category = ref<number | null>(null)
const regionAll = ref(false)
const openProvinces = ref<Set<number>>(new Set())
const detail = ref<{ provinceId: number; date: string } | null>(null)

let seq = 0
async function load() {
  const my = ++seq
  loading.value = true
  error.value = null
  try {
    const res = await getEventDashboard(props.weekStart)
    if (my !== seq) return
    data.value = res
    // หมวดที่กรองอยู่ไม่มีในสัปดาห์ใหม่ = ปลดออก ไม่งั้นจอว่างโดยไม่มีปุ่มให้กดกลับ
    if (category.value !== null && !res.categories.some((c) => c.id === category.value)) category.value = null
  } catch (err) {
    if (my === seq) error.value = errorMessage(err, 'โหลดสรุปไม่สำเร็จ')
  } finally {
    if (my === seq) loading.value = false
  }
}
watch(() => props.weekStart, () => {
  regionAll.value = false
  openProvinces.value = new Set()
  detail.value = null
  void load()
}, { immediate: true })

const days = computed(() => daysOf(props.weekStart))
const known = computed(() => new Set(data.value?.tickets?.knownTicketNos ?? []))
const codeOf = computed(() => new Map(data.value?.provinces.map((p) => [p.id, p.code]) ?? []))
const categoryLabel = computed(() => data.value?.categories.find((c) => c.id === category.value)?.label ?? null)

const bars = computed(() => (data.value?.categories ?? []).map((c) => ({ id: c.id, name: c.label, count: c.count, durationMin: 0 })))
function toggleCategory(id: number) { category.value = category.value === id ? null : id }

const items = computed(() =>
  (data.value?.items ?? []).filter((i) => category.value === null || i.categories.includes(category.value)))
const regionItems = computed(() => (regionAll.value ? items.value : items.value.slice(0, TOP_REGION)))

/** ช่องที่นับเป็นเหตุ (ตามตัวกรองหมวด) — ฐานเดียวของตัวเลขทุกตัวบนหน้า */
const eventCells = computed(() => (data.value?.cells ?? []).filter((c) =>
  !c.isNormal && (category.value === null || c.categories.includes(category.value))))

/** สัปดาห์ยังไม่จบ = ไม่เทียบสัปดาห์ก่อน (3 วันเทียบ 7 วันจะดูเหมือนดีขึ้นทั้งที่ไม่ใช่) */
const running = computed(() => !!data.value && data.value.today < addDays(props.weekStart, 6))
const canCompare = computed(() => !!data.value && !running.value && category.value === null && data.value.prev.recorded > 0)
const pct = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null)

const eventHint = computed(() => {
  if (!data.value) return ''
  if (categoryLabel.value) return `เฉพาะ ${categoryLabel.value}`
  if (running.value) return `ยังไม่จบสัปดาห์ · สัปดาห์ก่อน ${data.value.prev.events}`
  return 'สัปดาห์ก่อนไม่มีบันทึก'
})
const missing = computed(() => (data.value ? data.value.totals.due - data.value.totals.recorded : 0))

/** Ticket ในระบบเก่ากว่าสัปดาห์ที่ดู = ตัวเลขยังไม่ครบ */
const ticketStale = computed(() => {
  const t = data.value?.tickets
  if (!t) return false
  const end = data.value!.today < addDays(props.weekStart, 6) ? data.value!.today : addDays(props.weekStart, 6)
  return !t.lastOpenedAt || new Date(t.lastOpenedAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }) < end
})

type ProvinceCard = {
  id: number; code: string; nameTh: string; items: EventItem[]; eventDays: number; recorded: number; due: number
  ticket: { sa1: number; sa2: number; downMin: number } | null
}
const cards = computed<ProvinceCard[]>(() => {
  const d = data.value
  if (!d) return []
  const due = days.value.filter((x) => x <= d.today).length
  return d.provinces.map((p) => ({
    ...p,
    items: items.value.filter((i) => i.provinceId === p.id),
    eventDays: eventCells.value.filter((c) => c.provinceId === p.id).length,
    recorded: d.cells.filter((c) => c.provinceId === p.id).length,
    due,
    ticket: d.tickets?.byProvince[p.id] ?? null,
  }))
})
const busyCards = computed(() => cards.value.filter((c) => c.items.length))
const quietCards = computed(() => cards.value.filter((c) => !c.items.length))

/** มีของที่ยังไม่ได้แสดง: เกิน 3 เรื่อง หรือข้อความยาวจนน่าจะถูกตัดที่ 3 บรรทัด */
const hasMore = (c: ProvinceCard): boolean =>
  c.items.length > TOP_PROVINCE || c.items.some((i) => i.note.length > 100 || i.note.split('\n').length > 3)

function toggleProvince(id: number) {
  const next = new Set(openProvinces.value)
  if (!next.delete(id)) next.add(id)
  openProvinces.value = next
}

const detailCell = computed(() => {
  const x = detail.value
  if (!x || !data.value) return null
  const province = data.value.provinces.find((p) => p.id === x.provinceId)
  const cell = data.value.cells.find((c) => c.provinceId === x.provinceId && c.date === x.date) ?? null
  const labels = data.value.categories.filter((c) => cell?.categories.includes(c.id)).map((c) => c.label)
  return province ? { province, date: x.date, cell, labels } : null
})

function ticketText(t: { sa1: number; sa2: number; downMin: number }): string {
  return [t.sa1 ? `SA1 ${t.sa1}` : '', t.sa2 ? `SA2 ${t.sa2}` : '', t.downMin ? `ดาวน์ ${fmtDowntimeTotal(t.downMin)}` : '']
    .filter(Boolean).join(' · ')
}
</script>

<template>
  <div v-if="error" role="alert" class="alert alert-error mb-3 text-sm">
    {{ error }}
    <button type="button" class="btn btn-ghost btn-xs" @click="load">ลองใหม่</button>
  </div>
  <p v-if="loading && !data" class="text-sm opacity-70">กำลังโหลด…</p>

  <div v-if="data" :class="loading ? 'opacity-60' : ''">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-base font-semibold">สัปดาห์ W{{ String(data.week).padStart(2, '0') }} · {{ formatWeekRange(weekStart) }}</h2>
      <button
        v-if="categoryLabel" type="button" class="btn btn-primary btn-xs" title="กดเพื่อเลิกกรอง" @click="category = null"
      >
        กรอง: {{ categoryLabel }} ✕
      </button>
    </div>

    <div v-if="data.weekNote" class="mb-3 rounded-lg border border-base-300 bg-base-100 p-3 text-sm">
      <span class="font-medium">หมายเหตุทั้งภาค</span>
      <p class="mt-1 whitespace-pre-line">{{ data.weekNote }}</p>
    </div>

    <div class="grid grid-cols-2 gap-3 md:grid-cols-3" :class="data.tickets ? 'xl:grid-cols-6' : ''">
      <StatTile
        label="วันที่มีเหตุ (จังหวัด × วัน)" :value="eventCells.length" :hint="eventHint"
        :diff="canCompare ? data.totals.events - data.prev.events : undefined"
        :pct="canCompare ? pct(data.totals.events, data.prev.events) : null"
      />
      <StatTile
        label="จังหวัดที่มีเหตุ" :value="`${new Set(eventCells.map((c) => c.provinceId)).size}/${data.provinces.length}`"
        :hint="categoryLabel ? eventHint : running ? `ยังไม่จบสัปดาห์ · สัปดาห์ก่อน ${data.prev.provincesWithEvent}` : 'สัปดาห์ก่อนไม่มีบันทึก'"
        :diff="canCompare ? data.totals.provincesWithEvent - data.prev.provincesWithEvent : undefined"
        :pct="canCompare ? pct(data.totals.provincesWithEvent, data.prev.provincesWithEvent) : null"
      />
      <StatTile
        label="บันทึกแล้ว" :value="`${data.totals.recorded}/${data.totals.due}`"
        :hint="missing ? `ยังขาด ${missing} ช่อง${running ? ' (นับถึงวันนี้)' : ''}` : 'ครบทุกช่อง'"
      />
      <template v-if="data.tickets">
        <StatTile label="Ticket SA1" :value="data.tickets.sa1.toLocaleString()" hint="เปิดในสัปดาห์นี้ 15 จังหวัด" />
        <StatTile label="Ticket SA2" :value="data.tickets.sa2.toLocaleString()" hint="เปิดในสัปดาห์นี้ 15 จังหวัด" />
        <StatTile label="เวลาดาวน์ SA1+SA2" :value="fmtDowntimeTotal(data.tickets.downMin)" hint="รวมทุกใบที่เปิดในสัปดาห์" />
      </template>
    </div>
    <p v-if="data.tickets && ticketStale" class="mt-2 text-xs text-base-content/70">
      ⚠ Ticket ในระบบมีถึง {{ formatDateTime(data.tickets.lastOpenedAt) }} ยังไม่ครบสัปดาห์นี้ — ตัวเลข SA1/SA2/เวลาดาวน์ต่ำกว่าจริงจนกว่าจะนำเข้าไฟล์ล่าสุด
    </p>
    <p v-if="data.tickets && categoryLabel" class="mt-2 text-xs text-base-content/70">ตัวเลข Ticket ไม่ถูกกรองตามหมวด</p>

    <div class="mt-4 grid gap-4 lg:grid-cols-5">
      <section class="rounded-lg border border-base-300 bg-base-100 p-4 min-w-0 lg:col-span-3">
        <h3 class="mb-2 text-sm font-semibold">ภาพรวมรายวัน</h3>
        <EventHeatGrid
          :provinces="data.provinces" :days="days" :today="data.today" :cells="data.cells" :category="category"
          @open="(provinceId, date) => { detail = { provinceId, date } }"
        />
      </section>
      <section class="rounded-lg border border-base-300 bg-base-100 p-4 min-w-0 lg:col-span-2">
        <h3 class="text-sm font-semibold">เหตุแยกตามหมวด</h3>
        <p class="mb-3 text-xs opacity-60">จัดหมวดจากคำในข้อความ · 1 เหตุเข้าได้หลายหมวด · กดแท่งเพื่อกรองทั้งหน้า</p>
        <BarList :items="bars" clickable :active-id="category" empty-text="ยังไม่มีเหตุในสัปดาห์นี้" @select="toggleCategory" />
      </section>
    </div>

    <section class="mt-4 rounded-lg border border-base-300 bg-base-100 p-4">
      <h3 class="text-sm font-semibold">เหตุเด่นของภาค</h3>
      <p class="mb-3 text-xs opacity-60">เรียง ★ → SA1 → SA2 → SA → NSA → อื่น ๆ</p>
      <p v-if="!items.length" class="py-4 text-center text-sm opacity-60">{{ categoryLabel ? 'ไม่มีเหตุในหมวดนี้' : 'ไม่มีเหตุที่บันทึกไว้' }}</p>
      <ul v-else class="flex flex-col gap-2.5">
        <li v-for="(i, n) in regionItems" :key="`${i.provinceId}-${i.dates[0]}-${n}`">
          <EventItemLine :item="i" :code="codeOf.get(i.provinceId)" :known-tickets="known" />
        </li>
      </ul>
      <button v-if="items.length > TOP_REGION" type="button" class="btn btn-ghost btn-sm mt-3" @click="regionAll = !regionAll">
        {{ regionAll ? 'ย่อ' : `ดูทั้งหมด ${items.length} รายการ` }}
      </button>
    </section>

    <h3 class="mt-6 mb-2 text-sm font-semibold">สรุปรายจังหวัด</h3>
    <div class="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
      <section v-for="c in busyCards" :key="c.id" class="rounded-lg border border-base-300 bg-base-100 p-4">
        <div class="flex items-baseline justify-between gap-2">
          <h4 class="font-semibold">{{ c.code }} <span class="text-sm font-normal opacity-70">{{ c.nameTh }}</span></h4>
          <span class="text-xs whitespace-nowrap tabular-nums opacity-70" :title="`บันทึกแล้ว ${c.recorded} จาก ${c.due} วัน`">
            มีเหตุ {{ c.eventDays }}/{{ c.due }} วัน
          </span>
        </div>
        <p v-if="c.ticket && ticketText(c.ticket)" class="mt-0.5 text-xs text-base-content/70">Ticket: {{ ticketText(c.ticket) }}</p>
        <p v-if="c.recorded < c.due" class="mt-0.5 text-xs text-base-content/70">ยังไม่บันทึก {{ c.due - c.recorded }} วัน</p>
        <ul class="mt-2 flex flex-col gap-2">
          <li v-for="(i, n) in openProvinces.has(c.id) ? c.items : c.items.slice(0, TOP_PROVINCE)" :key="`${i.dates[0]}-${n}`">
            <EventItemLine :item="i" :known-tickets="known" :clamp="!openProvinces.has(c.id)" />
          </li>
        </ul>
        <button v-if="hasMore(c)" type="button" class="btn btn-ghost btn-xs mt-2 -ml-2" @click="toggleProvince(c.id)">
          {{ openProvinces.has(c.id) ? 'ย่อ' : c.items.length > TOP_PROVINCE ? `และอีก ${c.items.length - TOP_PROVINCE} เหตุ` : 'ดูข้อความเต็ม' }}
        </button>
      </section>
    </div>

    <section v-if="quietCards.length" class="mt-3 rounded-lg border border-base-300 bg-base-100 p-4 text-sm">
      <h4 class="font-semibold">{{ categoryLabel ? 'ไม่มีเหตุในหมวดนี้' : 'ไม่มีเหตุ' }}</h4>
      <ul class="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
        <li v-for="c in quietCards" :key="c.id">
          <span class="font-medium">{{ c.code }}</span> {{ c.nameTh }}
          <span class="text-xs text-base-content/70">
            · {{ c.recorded < c.due ? `บันทึก ${c.recorded}/${c.due} วัน` : 'บันทึกครบ' }}
            <template v-if="c.ticket && ticketText(c.ticket)"> · Ticket: {{ ticketText(c.ticket) }}</template>
          </span>
        </li>
      </ul>
    </section>

    <div v-if="detailCell" class="modal modal-open" role="dialog" aria-modal="true" @click.self="detail = null">
      <div class="modal-box max-w-lg">
        <h3 class="text-lg font-semibold">{{ detailCell.province.code }} {{ detailCell.province.nameTh }} · {{ formatDowDay(detailCell.date) }}</h3>
        <p class="mt-3 text-sm whitespace-pre-line">{{ detailCell.cell ? cellText(detailCell.cell) : 'ยังไม่บันทึก' }}</p>
        <div v-if="detailCell.labels.length" class="mt-3 flex flex-wrap gap-1">
          <span v-for="l in detailCell.labels" :key="l" class="badge badge-ghost badge-sm whitespace-nowrap">{{ l }}</span>
        </div>
        <div class="modal-action">
          <button type="button" class="btn btn-sm" @click="detail = null">ปิด</button>
        </div>
      </div>
    </div>
  </div>
</template>

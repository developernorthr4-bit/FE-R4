<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { errorMessage } from '../lib/api'
import { formatDateTime } from '../lib/events'
import {
  fmtDowntime, getSiteTickets, LEVEL_BADGE, LEVEL_LABEL, LINK_LEVELS, linkCode, loadTicketLookups, lookupMap,
  type SiteTickets, type TicketLookups,
} from '../services/tickets.api'

/**
 * Ticket แจ้งเสียของสถานี — รวม Ticket ของ OLT/L1/L2 ที่อยู่ใต้สถานีนี้ด้วย
 * (BE เติม site_id "ขึ้นต้นไม้" ตอนนำเข้า) ป้ายบอกว่าแต่ละใบเกิดที่ชั้นไหน
 *
 * ผู้เรียกเป็นคนตัดสินว่าแสดงไหม (auth.canPage('tickets')) — ช่วงทดลองหน้านี้เพดาน dev
 */
const props = defineProps<{ siteId: string; siteCode?: string }>()

const MONTH_OPTIONS = [3, 6, 12] as const
const months = ref<number>(6)
const data = ref<SiteTickets | null>(null)
const lookups = ref<TicketLookups | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function reload() {
  loading.value = true
  error.value = null
  try {
    const [d, lk] = await Promise.all([getSiteTickets(props.siteId, months.value), loadTicketLookups()])
    data.value = d
    lookups.value = lk
  } catch (err) {
    error.value = errorMessage(err, 'โหลด Ticket ของสถานีไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

onMounted(reload)
watch(months, reload)
defineExpose({ reload })

const names = computed(() => lookupMap(lookups.value))
const name = (id: number | null) => (id === null ? 'ไม่ระบุ' : names.value.get(id) ?? '—')

/** เดือนที่ไม่มี Ticket ก็ต้องโชว์เป็นศูนย์ ไม่งั้นแท่งดูต่อกันเหมือนไม่มีช่องว่าง */
const monthBars = computed(() => {
  const d = data.value
  if (!d) return []
  const have = new Map(d.byMonth.map((m) => [m.month, m]))
  const out: { month: string; label: string; n: number; slaOver: number }[] = []
  const now = new Date()
  for (let i = d.months - 1; i >= 0; i--) {
    const t = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
    const m = have.get(key)
    out.push({ month: key, label: t.toLocaleDateString('th-TH', { month: 'short' }), n: m?.n ?? 0, slaOver: m?.slaOver ?? 0 })
  }
  return out
})
const maxMonth = computed(() => Math.max(1, ...monthBars.value.map((m) => m.n)))
const causeMax = computed(() => Math.max(1, ...(data.value?.byCause ?? []).map((c) => c.n)))
const listLink = computed(() => ({ path: '/tickets', query: { site: props.siteId, ...(props.siteCode ? { siteCode: props.siteCode } : {}) } }))
</script>

<template>
  <section class="card border border-base-300 bg-base-100">
    <div class="card-body gap-3 p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-base font-semibold">
          Ticket แจ้งเสีย
          <span class="badge badge-ghost badge-sm align-middle">dev</span>
        </h2>
        <div class="flex items-center gap-2">
          <select v-model.number="months" class="select select-bordered select-xs" aria-label="ย้อนหลัง">
            <option v-for="m in MONTH_OPTIONS" :key="m" :value="m">ย้อนหลัง {{ m }} เดือน</option>
          </select>
          <RouterLink :to="listLink" class="btn btn-ghost btn-xs">ดูทั้งหมด →</RouterLink>
        </div>
      </div>

      <div v-if="error" class="alert alert-error text-sm">{{ error }}</div>
      <p v-else-if="loading && !data" class="text-sm opacity-70">กำลังโหลด…</p>

      <template v-else-if="data">
        <p v-if="!data.total" class="text-sm opacity-70">ไม่มี Ticket ในช่วง {{ data.months }} เดือนที่ผ่านมา (ทั้งที่สถานีและ OLT/L1/L2 ใต้สถานีนี้)</p>

        <template v-else>
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-semibold">{{ data.total.toLocaleString() }} ใบ</span>
            <template v-for="l in LINK_LEVELS" :key="l">
              <span v-if="data.byLevel[l]" class="badge badge-sm" :class="LEVEL_BADGE[l]">เกิดที่{{ LEVEL_LABEL[l] }} {{ data.byLevel[l] }}</span>
            </template>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <!-- จำนวนต่อเดือน — แดงเข้มคือส่วนที่เกิน SLA -->
            <div>
              <p class="mb-1 text-xs opacity-70">ต่อเดือน (ส่วนสีแดง = เกิน SLA)</p>
              <div class="flex h-28 items-end gap-1">
                <div v-for="m in monthBars" :key="m.month" class="flex flex-1 flex-col items-center gap-1" :title="`${m.month}: ${m.n} ใบ · เกิน SLA ${m.slaOver}`">
                  <span class="text-[10px] opacity-70">{{ m.n || '' }}</span>
                  <div class="flex w-full flex-col justify-end overflow-hidden rounded-t bg-base-200" :style="{ height: `${(m.n / maxMonth) * 80}px` }">
                    <div class="w-full bg-error/70" :style="{ height: m.n ? `${(m.slaOver / m.n) * 100}%` : '0' }" />
                    <div class="w-full flex-1 bg-primary/60" />
                  </div>
                  <span class="text-[10px] opacity-70">{{ m.label }}</span>
                </div>
              </div>
            </div>

            <div>
              <p class="mb-1 text-xs opacity-70">กลุ่มสาเหตุ</p>
              <ul class="space-y-1 text-xs">
                <li v-for="c in data.byCause" :key="String(c.problemGroupId)" class="flex items-center gap-2">
                  <span class="w-36 truncate" :title="name(c.problemGroupId)">{{ name(c.problemGroupId) }}</span>
                  <div class="h-2 flex-1 rounded bg-base-200">
                    <div class="h-2 rounded bg-primary/60" :style="{ width: `${(c.n / causeMax) * 100}%` }" />
                  </div>
                  <span class="w-8 text-right">{{ c.n }}</span>
                </li>
              </ul>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="table table-xs">
              <thead>
                <tr><th>เปิด</th><th>Ticket</th><th>เกิดที่</th><th>สาเหตุ</th><th class="text-right">Downtime</th><th>SLA</th></tr>
              </thead>
              <tbody>
                <tr v-for="r in data.recent" :key="r.ticketNo" class="align-top">
                  <td class="whitespace-nowrap">{{ formatDateTime(r.openedAt) }}</td>
                  <td class="max-w-56">
                    <div class="font-mono">{{ r.ticketNo }}</div>
                    <div class="truncate opacity-60" :title="r.subject ?? ''">{{ r.subject }}</div>
                  </td>
                  <td class="whitespace-nowrap">
                    <span class="badge badge-xs" :class="LEVEL_BADGE[r.linkLevel]">{{ LEVEL_LABEL[r.linkLevel] }}</span>
                    <span v-if="r.linkLevel !== 'site'" class="ml-1 font-mono">{{ linkCode(r) }}</span>
                  </td>
                  <td class="max-w-48 truncate" :title="name(r.subCauseId)">{{ name(r.problemGroupId) }}</td>
                  <td class="whitespace-nowrap text-right">{{ fmtDowntime(r.downTimeMin) }}</td>
                  <td>
                    <span v-if="r.slaOver === true" class="badge badge-error badge-xs">เกิน</span>
                    <span v-else-if="r.slaOver === false" class="badge badge-success badge-xs">ทัน</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="data.total > data.recent.length" class="mt-1 text-xs opacity-60">แสดง {{ data.recent.length }} ใบล่าสุด — กด "ดูทั้งหมด" เพื่อกรองต่อ</p>
          </div>
        </template>
      </template>
    </div>
  </section>
</template>

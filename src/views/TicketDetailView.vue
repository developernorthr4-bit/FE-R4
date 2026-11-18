<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import { formatDateTime } from '../lib/events'
import {
  fmtDowntime, getTicket, LEVEL_BADGE, LEVEL_LABEL, loadTicketLookups, lookupMap, METHOD_LABEL,
  type TicketDetail, type TicketLookups,
} from '../services/tickets.api'

/**
 * รายละเอียด Ticket ใบเดียว — ทุกช่องที่ตาราง tickets เก็บไว้
 * (คอลัมน์ที่ตัดทิ้งตอนนำเข้า 2026-10-09 ไม่มีในระบบ จึงแสดงไม่ได้)
 */
const route = useRoute()
const ticketNo = String(route.params.ticketNo ?? '')

const t = ref<TicketDetail | null>(null)
const lookups = ref<TicketLookups | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const names = computed(() => lookupMap(lookups.value))
const name = (id: number | null) => (id === null ? null : names.value.get(id) ?? `#${id}`)

onMounted(async () => {
  try {
    const [detail, lk] = await Promise.all([getTicket(ticketNo), loadTicketLookups()])
    t.value = detail
    lookups.value = lk
  } catch (err) {
    error.value = errorMessage(err, 'โหลด Ticket ไม่สำเร็จ')
  } finally {
    loading.value = false
  }
})

const dt = (v: string | null) => (v ? formatDateTime(v) : null)

type Field = { label: string; value: string | number | null; mono?: boolean }

const timeFields = computed<Field[]>(() => {
  const r = t.value
  if (!r) return []
  return [
    { label: 'เปิด (CREATIONDATE)', value: dt(r.openedAt) },
    { label: 'เป้าหมาย (TARGET)', value: dt(r.targetAt) },
    { label: 'กู้คืน (RESTORATIONDATE)', value: dt(r.restoredAt) },
    { label: 'ปิด (CLOSEDTIME)', value: dt(r.closedAt) },
    { label: 'วันที่ปิด (CLOSED_DATE)', value: r.closedDate },
    { label: 'ดาวน์ไทม์', value: r.downTimeMin === null ? null : `${fmtDowntime(r.downTimeMin)} (${r.downTimeMin.toLocaleString()} นาที)` },
  ]
})

const causeFields = computed<Field[]>(() => {
  const r = t.value
  if (!r) return []
  return [
    { label: 'หมวด (CATEGORIES)', value: name(r.categoryId) },
    { label: 'Class', value: name(r.classId) },
    { label: 'TrackB', value: name(r.trackbId) },
    { label: 'กลุ่มปัญหา (Problem_Group)', value: name(r.problemGroupId) },
    { label: 'ปัญหา (Problem)', value: name(r.problemId) },
    { label: 'สาเหตุย่อย (SUB_CAUSE)', value: name(r.subCauseId) },
    { label: 'วิธีแก้ (REMEDY)', value: name(r.remedyId) },
  ]
})

const teamFields = computed<Field[]>(() => {
  const r = t.value
  if (!r) return []
  return [
    { label: 'ทีมรับผิดชอบ (TRUEOWNERGROUP)', value: name(r.ownerGroupId) },
    { label: 'ผู้ปิดงาน (Group)', value: name(r.handlerGroupId) },
    { label: 'Priority', value: name(r.priorityId) },
    { label: 'ค่าย (Network)', value: name(r.networkId) },
  ]
})

const placeFields = computed<Field[]>(() => {
  const r = t.value
  if (!r) return []
  return [
    { label: 'CI_Name', value: r.ciName, mono: true },
    { label: 'Site (ค่าในไฟล์)', value: r.siteRaw, mono: true },
    { label: 'รหัสตำบล (CCAATT)', value: r.ccaatt, mono: true },
    { label: 'จังหวัด', value: r.provinceName },
  ]
})
</script>

<template>
  <AppLayout>
    <PageHeader :title="`Ticket ${ticketNo}`" description="รายละเอียดใบแจ้งเสียจากไฟล์ NOC">
      <template #actions>
        <RouterLink to="/tickets" class="btn btn-ghost btn-sm">← รายการ</RouterLink>
      </template>
    </PageHeader>

    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm"><span>{{ error }}</span></div>
    <p v-if="loading" class="text-sm opacity-70">กำลังโหลด…</p>

    <template v-if="t">
      <!-- หัวใบ -->
      <div class="card mb-4 border border-base-300 bg-base-100">
        <div class="card-body gap-2 p-4">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-lg font-semibold">{{ t.ticketNo }}</span>
            <span v-if="t.severity" class="badge badge-ghost whitespace-nowrap">{{ t.severity }}</span>
            <span v-if="name(t.statusId)" class="badge badge-outline whitespace-nowrap">{{ name(t.statusId) }}</span>
            <span v-if="t.slaOver === true" class="badge badge-error whitespace-nowrap">เกิน SLA</span>
            <span v-else-if="t.slaOver === false" class="badge badge-success whitespace-nowrap">ทัน SLA</span>
            <span v-if="t.slaHrs !== null" class="text-xs opacity-70">SLA {{ t.slaHrs }} ชม.</span>
          </div>
          <p class="whitespace-pre-wrap break-words text-sm">{{ t.subject ?? '—' }}</p>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div v-for="card in [
          { title: 'เวลา', fields: timeFields },
          { title: 'สาเหตุและการแก้ไข', fields: causeFields },
          { title: 'ทีม', fields: teamFields },
          { title: 'ตำแหน่ง', fields: placeFields },
        ]" :key="card.title" class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2 p-4">
            <h2 class="card-title text-base">{{ card.title }}</h2>
            <dl class="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-3 gap-y-1.5 text-sm">
              <template v-for="f in card.fields" :key="f.label">
                <dt class="text-xs opacity-60">{{ f.label }}</dt>
                <dd class="break-words" :class="f.mono ? 'font-mono text-xs' : ''">
                  <template v-if="f.value !== null && f.value !== ''">{{ f.value }}</template>
                  <span v-else class="opacity-40">—</span>
                </dd>
              </template>
            </dl>
          </div>
        </div>

        <!-- ผลจับคู่กับทะเบียนโครงข่าย -->
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2 p-4">
            <h2 class="card-title text-base">จับคู่กับทะเบียน</h2>
            <dl class="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt class="text-xs opacity-60">เกิดที่</dt>
              <dd><span class="badge badge-sm whitespace-nowrap" :class="LEVEL_BADGE[t.linkLevel]">{{ LEVEL_LABEL[t.linkLevel] }}</span></dd>
              <dt class="text-xs opacity-60">วิธีจับคู่</dt>
              <dd>{{ t.linkMethod ? METHOD_LABEL[t.linkMethod] : '—' }}</dd>
              <dt class="text-xs opacity-60">สถานี</dt>
              <dd>
                <RouterLink v-if="t.siteId" :to="`/sites/${t.siteId}/edit`" class="link link-primary font-mono text-xs">{{ t.siteCode }}</RouterLink>
                <span v-else class="opacity-40">—</span>
              </dd>
              <dt class="text-xs opacity-60">OLT</dt>
              <dd class="font-mono text-xs">{{ t.oltCode ?? '—' }}</dd>
              <dt class="text-xs opacity-60">{{ t.nodeLevel ? LEVEL_LABEL[t.nodeLevel] : 'L1/L2' }}</dt>
              <dd class="font-mono text-xs">{{ t.nodeCode ?? '—' }}</dd>
            </dl>
            <p v-if="t.linkLevel === 'none'" class="text-xs opacity-60">
              ยังจับคู่กับทะเบียนไม่ได้ — มักเป็น L1/L2 ใหม่ที่ยังไม่อยู่ในทะเบียน หรืออุปกรณ์ที่ไม่มีทะเบียน (DSLAM/FTTC)
            </p>
          </div>
        </div>

        <!-- โชว์เมื่อ BE ส่ง cmRepairs มา = มีสิทธิ์หน้า faults -->
        <div v-if="t.cmRepairs !== undefined" class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2 p-4">
            <h2 class="card-title text-base">งานซ่อม CM ที่อ้างใบนี้</h2>
            <div v-if="t.cmRepairs.length" class="flex flex-wrap gap-2">
              <RouterLink v-for="cm in t.cmRepairs" :key="cm.id" :to="`/faults/${cm.id}`" class="link link-primary font-mono text-sm">{{ cm.cmNo }}</RouterLink>
            </div>
            <p v-else class="text-sm opacity-60">ไม่มีงานซ่อม CM อ้างถึงใบนี้</p>
          </div>
        </div>
      </div>

      <p class="mt-4 text-xs opacity-60">อัปเดตจากการนำเข้าครั้งล่าสุด {{ formatDateTime(t.updatedAt) }}</p>
    </template>
  </AppLayout>
</template>

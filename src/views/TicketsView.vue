<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import StatTile from '../components/charts/StatTile.vue'
import { errorMessage } from '../lib/api'
import { formatDateTime } from '../lib/events'
import { loadProvinces, type Province } from '../services/provinces.api'
import {
  fmtDowntime, LEVEL_BADGE, LEVEL_LABEL, LINK_LEVELS, linkCode, listTickets, loadTicketLookups, lookupMap, lookupsOf,
  METHOD_LABEL, relinkTickets, shortClass, type LinkLevel, type TicketLookups, type TicketPage,
} from '../services/tickets.api'
import { useAuthStore } from '../stores/auth'
import { useFlashStore } from '../stores/flash'

/**
 * Ticket แจ้งเสียทั้งภาค (Online + Mobile รวมกัน) — หน้า optIn เปิดให้รายคนที่ /settings/permissions
 *
 * ตัวเลข "จับคู่ได้ที่ชั้นไหน" ไม่โดนตัวกรองชั้นของตัวเอง → กดสลับชั้นแล้วยังเห็นว่าชั้นอื่นมีกี่ใบ
 * ?site=<uuid> มาจากการ์ด Ticket ในหน้าสถานี (รวม Ticket ของ OLT/L1/L2 ใต้สถานี)
 */
const PAGE_SIZE = 50

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const flash = useFlashStore()

const lookups = ref<TicketLookups | null>(null)
const provinces = ref<Province[]>([])
const page = ref<TicketPage | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const q = ref('')
const from = ref('')
const to = ref('')
const province = ref('')
const category = ref('')
const problemGroup = ref('')
const owner = ref('')
const network = ref('')
const slaOver = ref<'' | '1' | '0'>('')
const link = ref<'' | LinkLevel>('')
const site = ref(typeof route.query.site === 'string' ? route.query.site : '')
const siteLabel = ref(typeof route.query.siteCode === 'string' ? route.query.siteCode : '')
const offset = ref(0)

const names = computed(() => lookupMap(lookups.value))
const name = (id: number | null) => (id === null ? undefined : names.value.get(id))

async function load() {
  loading.value = true
  error.value = null
  try {
    const num = (v: string) => (v ? Number(v) : undefined)
    page.value = await listTickets({
      q: q.value.trim() || undefined,
      from: from.value || undefined,
      to: to.value || undefined,
      province: num(province.value),
      site: site.value || undefined,
      category: num(category.value),
      problemGroup: num(problemGroup.value),
      owner: num(owner.value),
      network: num(network.value),
      slaOver: slaOver.value || undefined,
      link: link.value || undefined,
      limit: PAGE_SIZE,
      offset: offset.value,
    })
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายการ Ticket ไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const [lk, provs] = await Promise.allSettled([loadTicketLookups(), loadProvinces()])
  if (lk.status === 'fulfilled') lookups.value = lk.value
  if (provs.status === 'fulfilled') provinces.value = provs.value
  await load()
})

/* เปลี่ยนตัวกรองต้องกลับหน้าแรก — ถ้า offset เป็น 0 อยู่แล้ว watch ไม่ยิง จึงเรียก load() เอง */
function reload() {
  if (offset.value !== 0) offset.value = 0
  else void load()
}
watch(offset, load)
watch([from, to, province, category, problemGroup, owner, network, slaOver, link, site], reload)
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(reload, 300)
})

function clearSite() {
  site.value = ''
  siteLabel.value = ''
  router.replace({ query: {} })
}

const relinking = ref(false)
async function relink() {
  relinking.value = true
  try {
    const r = await relinkTickets()
    flash.set(`จับคู่ใหม่แล้ว — ตรวจใบที่ยังไม่ได้ ${r.checked.toLocaleString()} · จับได้เพิ่ม ${r.linked.toLocaleString()} · ไล่ต้นไม้ใหม่ ${r.rolled.toLocaleString()}`)
    lookups.value = await loadTicketLookups(true)
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'จับคู่ใหม่ไม่สำเร็จ')
  } finally {
    relinking.value = false
  }
}

const rangeFrom = computed(() => (page.value?.total ? offset.value + 1 : 0))
const rangeTo = computed(() => Math.min(offset.value + PAGE_SIZE, page.value?.total ?? 0))
const linkedTotal = computed(() => {
  const b = page.value?.summary.byLevel
  return b ? LINK_LEVELS.reduce((n, l) => n + b[l], 0) : 0
})
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('th-TH', { dateStyle: 'medium' }) : '—')
</script>

<template>
  <AppLayout>
    <PageHeader
      title="Ticket แจ้งเสีย"
      description="Ticket จาก NOC (Online + Mobile) ผูกกับสถานี / OLT / L1 / L2"
    >
      <template #actions>
        <button v-if="auth.can('dev')" type="button" class="btn btn-ghost btn-sm" :disabled="relinking" title="จับคู่ใบที่ยังไม่ได้ใหม่ — ใช้หลังเพิ่ม L1/L2/สถานีเข้าทะเบียน" @click="relink">
          <span v-if="relinking" class="loading loading-spinner loading-xs" />จับคู่ใหม่
        </button>
        <RouterLink v-if="auth.can('dev')" to="/tickets/import" class="btn btn-primary btn-sm">นำเข้าไฟล์</RouterLink>
      </template>
    </PageHeader>

    <p v-if="lookups" class="mb-3 text-xs opacity-70">
      ในระบบ {{ lookups.stats.total.toLocaleString() }} ใบ · เปิดตั้งแต่ {{ day(lookups.stats.firstOpened) }} ถึง {{ day(lookups.stats.lastOpened) }}
      <template v-if="lookups.lastImport"> · นำเข้าล่าสุด {{ formatDateTime(lookups.lastImport.finishedAt) }} ({{ lookups.lastImport.fileName }})</template>
    </p>

    <div v-if="page" class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
      <button
        v-for="l in LINK_LEVELS" :key="l" type="button" class="text-left"
        :class="link === l ? 'ring-2 ring-primary rounded-box' : ''"
        @click="link = link === l ? '' : l"
      >
        <StatTile :label="l === 'none' ? 'จับคู่ไม่ได้' : `เกิดที่${LEVEL_LABEL[l]}`" :value="page.summary.byLevel[l].toLocaleString()" goodWhen="neutral"
          :hint="linkedTotal ? `${((page.summary.byLevel[l] / linkedTotal) * 100).toFixed(1)}%` : undefined" />
      </button>
      <button type="button" class="text-left" :class="slaOver === '1' ? 'ring-2 ring-primary rounded-box' : ''" @click="slaOver = slaOver === '1' ? '' : '1'">
        <StatTile label="เกิน SLA" :value="page.summary.slaOver.toLocaleString()" goodWhen="neutral" hint="ตามตัวกรองปัจจุบัน" />
      </button>
    </div>

    <div v-if="site" class="mb-3">
      <span class="badge badge-outline gap-2">
        เฉพาะสถานี {{ siteLabel || site }} (รวม OLT/L1/L2 ใต้สถานี)
        <button type="button" class="opacity-70 hover:opacity-100" aria-label="ล้าง" @click="clearSite">✕</button>
      </span>
    </div>

    <div class="mb-4 flex flex-wrap items-end gap-3">
      <label class="form-control">
        <span class="label-text mb-1 block text-sm">ค้นหา</span>
        <input v-model="q" type="search" class="input input-bordered input-sm w-56" placeholder="เลข Ticket / รหัส / ข้อความ">
      </label>
      <label class="form-control">
        <span class="label-text mb-1 block text-sm">เปิดตั้งแต่</span>
        <input v-model="from" type="date" class="input input-bordered input-sm">
      </label>
      <label class="form-control">
        <span class="label-text mb-1 block text-sm">ถึง</span>
        <input v-model="to" type="date" class="input input-bordered input-sm">
      </label>
      <label class="form-control">
        <span class="label-text mb-1 block text-sm">จังหวัด</span>
        <select v-model="province" class="select select-bordered select-sm w-40">
          <option value="">ทุกจังหวัด</option>
          <option v-for="p in provinces" :key="p.id" :value="String(p.id)">{{ p.nameTh }}</option>
        </select>
      </label>
      <label class="form-control">
        <span class="label-text mb-1 block text-sm">หมวด</span>
        <select v-model="category" class="select select-bordered select-sm w-44">
          <option value="">ทั้งหมด</option>
          <option v-for="l in lookupsOf(lookups, 'category')" :key="l.id" :value="String(l.id)">{{ l.value }}</option>
        </select>
      </label>
      <label class="form-control">
        <span class="label-text mb-1 block text-sm">กลุ่มสาเหตุ</span>
        <select v-model="problemGroup" class="select select-bordered select-sm w-44">
          <option value="">ทั้งหมด</option>
          <option v-for="l in lookupsOf(lookups, 'problem_group')" :key="l.id" :value="String(l.id)">{{ l.value }}</option>
        </select>
      </label>
      <label class="form-control">
        <span class="label-text mb-1 block text-sm">ทีมรับผิดชอบ</span>
        <select v-model="owner" class="select select-bordered select-sm w-56">
          <option value="">ทุกทีม</option>
          <option v-for="l in lookupsOf(lookups, 'owner_group')" :key="l.id" :value="String(l.id)">{{ l.value }}</option>
        </select>
      </label>
      <label class="form-control">
        <span class="label-text mb-1 block text-sm">ค่าย</span>
        <select v-model="network" class="select select-bordered select-sm w-28">
          <option value="">ทั้งหมด</option>
          <option v-for="l in lookupsOf(lookups, 'network')" :key="l.id" :value="String(l.id)">{{ l.value }}</option>
        </select>
      </label>
    </div>

    <div v-if="error" class="alert alert-error mb-3 text-sm">{{ error }}</div>
    <p v-if="loading && !page" class="text-sm opacity-70">กำลังโหลด…</p>

    <template v-if="page">
      <div class="overflow-x-auto rounded-lg border border-base-300" :class="loading ? 'opacity-60' : ''">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>เปิด</th>
              <th>ประเภท</th>
              <th>สาเหตุ / วิธีแก้</th>
              <th>เกิดที่</th>
              <th>จังหวัด</th>
              <th class="text-right">Downtime</th>
              <th>SLA</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in page.rows" :key="r.ticketNo" class="hover align-top">
              <td class="max-w-72">
                <div class="font-mono text-xs">{{ r.ticketNo }} <span v-if="r.severity" class="badge badge-ghost badge-xs">{{ r.severity }}</span></div>
                <div class="truncate text-xs opacity-70" :title="r.subject ?? ''">{{ r.subject ?? '—' }}</div>
              </td>
              <td class="whitespace-nowrap text-xs">{{ formatDateTime(r.openedAt) }}</td>
              <td class="text-xs">
                <div>{{ shortClass(name(r.classId)) }}</div>
                <div class="opacity-60">{{ name(r.categoryId) ?? '' }}</div>
              </td>
              <td class="max-w-64 text-xs">
                <div>{{ name(r.problemGroupId) ?? '—' }}<template v-if="name(r.subCauseId)"> · {{ name(r.subCauseId) }}</template></div>
                <div class="opacity-60">{{ name(r.remedyId) ?? '' }}</div>
              </td>
              <td class="whitespace-nowrap text-xs">
                <span class="badge badge-xs" :class="LEVEL_BADGE[r.linkLevel]" :title="r.linkMethod ? METHOD_LABEL[r.linkMethod] : ''">{{ LEVEL_LABEL[r.linkLevel] }}</span>
                <span v-if="linkCode(r)" class="ml-1 font-mono">{{ linkCode(r) }}</span>
                <span v-else class="ml-1 font-mono opacity-50" title="รหัสในไฟล์">{{ r.siteRaw ?? r.ciName ?? '' }}</span>
                <div v-if="r.siteId && r.linkLevel !== 'site'" class="mt-0.5">
                  <RouterLink :to="`/sites/${r.siteId}/edit`" class="link link-hover font-mono opacity-70">สถานี {{ r.siteCode }}</RouterLink>
                </div>
                <div v-else-if="r.siteId" class="mt-0.5">
                  <RouterLink :to="`/sites/${r.siteId}/edit`" class="link link-hover opacity-70">เปิดสถานี</RouterLink>
                </div>
              </td>
              <td class="text-xs">{{ r.provinceName ?? '—' }}</td>
              <td class="whitespace-nowrap text-right text-xs">{{ fmtDowntime(r.downTimeMin) }}</td>
              <td>
                <span v-if="r.slaOver === true" class="badge badge-error badge-xs">เกิน</span>
                <span v-else-if="r.slaOver === false" class="badge badge-success badge-xs">ทัน</span>
                <span v-else class="opacity-40">—</span>
              </td>
            </tr>
            <tr v-if="!page.rows.length">
              <td colspan="8" class="py-6 text-center text-sm opacity-70">ไม่พบ Ticket ตามเงื่อนไขนี้</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span class="opacity-70">แสดง {{ rangeFrom }}–{{ rangeTo }} จาก {{ page.total.toLocaleString() }}</span>
        <div class="join">
          <button type="button" class="btn btn-sm join-item" :disabled="offset === 0" @click="offset = Math.max(offset - PAGE_SIZE, 0)">ก่อนหน้า</button>
          <button type="button" class="btn btn-sm join-item" :disabled="offset + PAGE_SIZE >= page.total" @click="offset = offset + PAGE_SIZE">ถัดไป</button>
        </div>
      </div>
    </template>
  </AppLayout>
</template>

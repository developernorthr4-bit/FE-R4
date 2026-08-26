<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import {
  ACTION_BADGE, deleteAuditLog, formatWhen, IMPORTER, listAuditLog, loadFacets,
  previewDelete, reclaimSpace,
  type AuditFacets, type AuditFilter, type AuditPreview, type AuditRow,
} from '../services/audit.api'
import { formatBytes } from '../services/settings.api'

/**
 * จัดการ audit_log — ดูและลบ
 *
 * หน้านี้มีทั้งส่วนอ่านและส่วนลบโดยตั้งใจ เครื่องมือที่ลบได้อย่างเดียวคือ
 * เครื่องทำลายเอกสาร ส่วนที่ทำให้ audit_log มีค่าคือการเปิดดูได้ตอนมีเรื่อง
 *
 * กติกาความปลอดภัยบังคับที่ BE ทั้งหมด (routes/audit.ts) หน้าจอนี้ทำหน้าที่
 * แค่ทำให้กติกาเหล่านั้น "เห็นได้" ไม่ใช่ที่ที่กติกาถูกบังคับ
 */
const PAGE_SIZE = 50

const facets = ref<AuditFacets | null>(null)
const rows = ref<AuditRow[]>([])
const cursor = ref<number | null>(null)
const preview = ref<AuditPreview | null>(null)

const loading = ref(true)
const loadingMore = ref(false)
const previewing = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

/** แถวที่กางดู diff อยู่ — เก็บเป็น Set เพราะกางพร้อมกันหลายแถวได้ */
const opened = ref<Set<number>>(new Set())

const filters = reactive({
  table: '', action: '' as '' | 'INSERT' | 'UPDATE' | 'DELETE',
  actor: '', from: '', to: '', pk: '', olderThanDays: '',
})

/** เกราะแถว DELETE — ตั้งต้นเปิด ต้องปลดเองถ้าจะลบจริง */
const keepDeletes = ref(true)

/** ตัวเลขที่ต้องพิมพ์ให้ตรงจำนวนแถวของคน ก่อนปุ่มลบจะทำงาน */
const confirmInput = ref('')
const showConfirm = ref(false)

function baseFilter(): AuditFilter {
  const days = Number(filters.olderThanDays)
  return {
    table: filters.table || null,
    action: filters.action || null,
    actor: filters.actor || null,
    from: filters.from || null,
    to: filters.to || null,
    pk: filters.pk || null,
    olderThanDays: Number.isInteger(days) && days > 0 ? days : null,
  }
}

/** ตอนดูต้องเห็นแถว DELETE ด้วยเสมอ เกราะมีไว้กันตอนลบ ไม่ใช่กันตอนดู */
const browseFilter = computed<AuditFilter>(() => ({ ...baseFilter(), keepDeletes: false }))
const deleteFilter = computed<AuditFilter>(() => ({ ...baseFilter(), keepDeletes: keepDeletes.value }))

const hasFilter = computed(() =>
  Object.values(filters).some((v) => v !== ''))

/**
 * ตัวกรองว่าง = ทั้งตาราง ต้องติ๊กยอมรับก่อนปุ่มลบถึงจะทำงาน
 *
 * ที่ต้องมีเพราะสถานะตั้งต้นของหน้านี้คือ "ไม่มีตัวกรอง" ซึ่งแปลว่าทุกแถว
 * ถ้าปล่อยให้ปุ่มติดอาวุธตั้งแต่เปิดหน้ามา การลบทั้งตารางจะกลายเป็นค่าตั้งต้น
 * แทนที่จะเป็นสิ่งที่ต้องตั้งใจเลือก
 */
const wideOpenAck = ref(false)

/** ปุ่มลบพร้อมทำงานไหม — เงื่อนไขเดียวกับที่ BE ตรวจซ้ำอีกชั้น */
const confirmNeeded = computed(() => (preview.value?.humanRows ?? 0) > 0)
const confirmOk = computed(() =>
  !confirmNeeded.value || Number(confirmInput.value) === preview.value?.humanRows)
const canDelete = computed(() =>
  !busy.value && (preview.value?.rows ?? 0) > 0 && (hasFilter.value || wideOpenAck.value))

onMounted(async () => {
  try {
    facets.value = await loadFacets()
  } catch (e) {
    error.value = errorMessage(e, 'โหลดตัวเลือกไม่สำเร็จ')
  }
  await Promise.all([load(), refreshPreview()])
  loading.value = false
})

async function load() {
  error.value = null
  cursor.value = null
  opened.value = new Set()
  try {
    const res = await listAuditLog(browseFilter.value, { limit: PAGE_SIZE })
    rows.value = res.rows
    cursor.value = res.nextCursor
  } catch (e) {
    error.value = errorMessage(e, 'โหลดรายการไม่สำเร็จ')
  }
}

async function loadMore() {
  if (!cursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const res = await listAuditLog(browseFilter.value, { cursor: cursor.value, limit: PAGE_SIZE })
    rows.value = [...rows.value, ...res.rows]
    cursor.value = res.nextCursor
  } catch (e) {
    error.value = errorMessage(e, 'โหลดเพิ่มไม่สำเร็จ')
  } finally {
    loadingMore.value = false
  }
}

async function refreshPreview() {
  previewing.value = true
  // ตัวเลขเก่าที่ค้างอยู่ระหว่างโหลดใหม่อันตรายกว่าไม่มีตัวเลข — ผู้ใช้อาจกดยืนยันของเก่า
  confirmInput.value = ''
  try {
    preview.value = await previewDelete(deleteFilter.value)
  } catch (e) {
    preview.value = null
    error.value = errorMessage(e, 'นับจำนวนไม่สำเร็จ')
  } finally {
    previewing.value = false
  }
}

/*
 * หน่วงก่อนยิง เพราะช่องค้นหาพิมพ์ทีละตัวอักษร แล้วทั้ง list และ preview
 * ต้องอ่านทั้งตาราง 78,000 แถว การยิงทุกตัวอักษรคือการรัน count(*) สิบรอบ
 */
let timer: ReturnType<typeof setTimeout> | undefined
watch([filters, keepDeletes], () => {
  // ตัวกรองเปลี่ยน = การยอมรับครั้งก่อนพูดถึงของคนละชุด ต้องติ๊กใหม่
  wideOpenAck.value = false
  clearTimeout(timer)
  timer = setTimeout(() => { void load(); void refreshPreview() }, 350)
}, { deep: true })

function clearFilters() {
  Object.assign(filters, { table: '', action: '', actor: '', from: '', to: '', pk: '', olderThanDays: '' })
}

/** ปุ่มทางลัด — แค่เซ็ตตัวกรองให้ ไม่ได้ลัดข้ามขั้นยืนยันใด ๆ */
function quickImporter() {
  clearFilters()
  filters.actor = IMPORTER
}
function quickOlderThan(days: number) {
  clearFilters()
  filters.olderThanDays = String(days)
}

function toggleRow(id: number) {
  const next = new Set(opened.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  opened.value = next
}

/**
 * เทียบ old/new แล้วคืนเฉพาะคีย์ที่เปลี่ยน
 *
 * แถว UPDATE ของ sites มี 20 คอลัมน์ แต่ที่เปลี่ยนจริงมักมีคีย์เดียว
 * ถ้าโชว์ทั้งก้อนผู้ใช้ต้องไล่หาเอง ซึ่งเป็นงานที่คอมพิวเตอร์ควรทำให้
 */
function diffOf(row: AuditRow): { key: string; before: string; after: string }[] {
  const o = (row.oldData ?? {}) as Record<string, unknown>
  const n = (row.newData ?? {}) as Record<string, unknown>
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].sort()
  const show = (v: unknown) =>
    v === undefined ? '—' : v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v)

  return keys
    .filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map((k) => ({ key: k, before: show(o[k]), after: show(n[k]) }))
}

function actorLabel(row: AuditRow): string {
  if (!row.changedBy) return 'importer'
  return row.changedByName ?? 'ผู้ใช้ที่ถูกลบแล้ว'
}

async function confirmDelete() {
  if (!preview.value || !confirmOk.value) return
  busy.value = true
  error.value = null
  notice.value = null
  try {
    const res = await deleteAuditLog(deleteFilter.value, {
      confirmHumanRows: confirmNeeded.value ? preview.value.humanRows : null,
    })
    const freed = res.freedBytes > 0
      ? `คืนพื้นที่ ${formatBytes(res.freedBytes)}`
      : 'พื้นที่ถูกปลดล็อกไว้ให้ใช้ซ้ำ ยังไม่คืนดิสก์ (กดคืนพื้นที่ได้ด้านล่าง)'
    notice.value = `ลบ ${res.deleted.toLocaleString()} แถว · ${freed}`
    showConfirm.value = false
    await afterChange()
  } catch (e) {
    // 409 = จำนวนแถวของคนเปลี่ยนไประหว่างที่กำลังตัดสินใจ BE ไม่ได้ลบอะไรเลย
    error.value = errorMessage(e, 'ลบไม่สำเร็จ')
    showConfirm.value = false
    await refreshPreview()
  } finally {
    busy.value = false
  }
}

async function handleReclaim() {
  busy.value = true
  error.value = null
  notice.value = null
  try {
    const res = await reclaimSpace()
    notice.value = res.freedBytes > 0
      ? `เขียนตารางใหม่ ${res.rows.toLocaleString()} แถว · คืนพื้นที่ ${formatBytes(res.freedBytes)}`
      : `เขียนตารางใหม่ ${res.rows.toLocaleString()} แถว · ไม่มีพื้นที่ให้คืนเพิ่ม`
    await afterChange()
  } catch (e) {
    error.value = errorMessage(e, 'คืนพื้นที่ไม่สำเร็จ')
  } finally {
    busy.value = false
  }
}

async function afterChange() {
  confirmInput.value = ''
  facets.value = await loadFacets()
  await Promise.all([load(), refreshPreview()])
}
</script>

<template>
  <AppLayout>
    <PageHeader
      title="จัดการ audit_log"
      description="ดูว่าใครแก้อะไรตอนไหน และลบของที่ไม่ต้องเก็บแล้ว"
    >
      <template #actions>
        <RouterLink to="/settings" class="btn btn-ghost btn-sm">กลับไปตั้งค่าระบบ</RouterLink>
      </template>
    </PageHeader>

    <div v-if="notice" role="status" class="alert alert-success mb-4 text-sm">
      <span>{{ notice }}</span>
    </div>
    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm">
      <span>{{ error }}</span>
    </div>

    <div v-if="loading" class="mt-10 flex justify-center">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <template v-else>
      <!-- ── ตัวกรอง ─────────────────────────────────────────────── -->
      <div class="card mb-4 border border-base-300 bg-base-100">
        <div class="card-body gap-3 p-4">
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label class="form-control">
              <span class="label-text text-xs opacity-70">ตาราง</span>
              <select v-model="filters.table" class="select select-sm select-bordered w-full">
                <option value="">ทุกตาราง</option>
                <option v-for="t in facets?.tables" :key="t.name" :value="t.name">
                  {{ t.name }} ({{ t.rows.toLocaleString() }})
                </option>
              </select>
            </label>

            <label class="form-control">
              <span class="label-text text-xs opacity-70">การกระทำ</span>
              <select v-model="filters.action" class="select select-sm select-bordered w-full">
                <option value="">ทั้งหมด</option>
                <option v-for="a in facets?.actions" :key="a.name" :value="a.name">
                  {{ a.name }} ({{ a.rows.toLocaleString() }})
                </option>
              </select>
            </label>

            <label class="form-control">
              <span class="label-text text-xs opacity-70">ผู้กระทำ</span>
              <select v-model="filters.actor" class="select select-sm select-bordered w-full">
                <option value="">ทุกคน</option>
                <option :value="IMPORTER">
                  importer ({{ facets?.importerRows.toLocaleString() }})
                </option>
                <option v-for="a in facets?.actors" :key="a.id" :value="a.id">
                  {{ a.username ?? 'ผู้ใช้ที่ถูกลบแล้ว' }} ({{ a.rows.toLocaleString() }})
                </option>
              </select>
            </label>

            <label class="form-control">
              <span class="label-text text-xs opacity-70">คีย์ของแถวต้นทาง</span>
              <input
                v-model="filters.pk" type="search" placeholder="row_pk"
                class="input input-sm input-bordered w-full"
              />
            </label>

            <label class="form-control">
              <span class="label-text text-xs opacity-70">ตั้งแต่วันที่</span>
              <input v-model="filters.from" type="date" class="input input-sm input-bordered w-full" />
            </label>

            <label class="form-control">
              <span class="label-text text-xs opacity-70">ถึงวันที่ (รวมทั้งวัน)</span>
              <input v-model="filters.to" type="date" class="input input-sm input-bordered w-full" />
            </label>

            <label class="form-control">
              <span class="label-text text-xs opacity-70">เก่ากว่า (วัน)</span>
              <input
                v-model="filters.olderThanDays" type="number" min="1" placeholder="เช่น 90"
                class="input input-sm input-bordered w-full"
              />
            </label>

            <div class="flex items-end">
              <button
                type="button" class="btn btn-sm btn-ghost" :disabled="!hasFilter"
                @click="clearFilters"
              >
                ล้างตัวกรอง
              </button>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-base-300 pt-3 text-sm">
            <span class="opacity-70">
              ทั้งหมด {{ facets?.total.toLocaleString() }} แถว
            </span>
            <span v-if="previewing" class="loading loading-spinner loading-xs opacity-50" />
            <span v-else-if="preview" class="font-medium">
              ตรงตัวกรอง {{ preview.rows.toLocaleString() }} แถว
              <span :class="preview.humanRows ? 'text-error' : 'opacity-60'">
                (เป็นของคน {{ preview.humanRows.toLocaleString() }})
              </span>
            </span>
            <span v-if="preview?.oldest" class="opacity-60">
              {{ formatWhen(preview.oldest) }} — {{ formatWhen(preview.newest!) }}
            </span>
          </div>
        </div>
      </div>

      <!-- ── รายการ ──────────────────────────────────────────────── -->
      <div class="card overflow-x-auto border border-base-300 bg-base-100">
        <table class="table table-sm">
          <thead>
            <tr>
              <th class="w-20">#</th>
              <th class="w-40">เมื่อไร</th>
              <th>ตาราง</th>
              <th class="w-24">การกระทำ</th>
              <th>แถวต้นทาง</th>
              <th>ผู้กระทำ</th>
              <th class="w-10" />
            </tr>
          </thead>
          <tbody>
            <template v-for="r in rows" :key="r.id">
              <tr class="hover cursor-pointer" @click="toggleRow(r.id)">
                <td class="tabular-nums opacity-50">{{ r.id }}</td>
                <td class="whitespace-nowrap">{{ formatWhen(r.changedAt) }}</td>
                <td class="font-medium">{{ r.tableName }}</td>
                <td>
                  <span class="badge badge-sm" :class="ACTION_BADGE[r.action] ?? 'badge-ghost'">
                    {{ r.action }}
                  </span>
                </td>
                <td class="max-w-48 truncate font-mono text-xs opacity-70">{{ r.rowPk ?? '—' }}</td>
                <td class="whitespace-nowrap">
                  <span v-if="!r.changedBy" class="opacity-50">importer</span>
                  <span v-else-if="r.changedByName">{{ r.changedByName }}</span>
                  <span v-else class="text-warning">ผู้ใช้ที่ถูกลบแล้ว</span>
                </td>
                <td class="text-right opacity-40">{{ opened.has(r.id) ? '▾' : '▸' }}</td>
              </tr>
              <tr v-if="opened.has(r.id)" :key="`d-${r.id}`">
                <td colspan="7" class="bg-base-200/50">
                  <div v-if="!diffOf(r).length" class="py-1 text-sm opacity-60">
                    ไม่มีคีย์ไหนเปลี่ยนค่า
                  </div>
                  <table v-else class="table table-xs">
                    <thead>
                      <tr><th class="w-48">คอลัมน์</th><th>ก่อน</th><th>หลัง</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="d in diffOf(r)" :key="d.key">
                        <td class="font-medium">{{ d.key }}</td>
                        <td class="max-w-80 truncate font-mono text-xs opacity-60">{{ d.before }}</td>
                        <td class="max-w-80 truncate font-mono text-xs">{{ d.after }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p class="pt-1 text-xs opacity-50">
                    ผู้กระทำ {{ actorLabel(r) }}
                    <template v-if="r.changedBy"> · {{ r.changedBy }}</template>
                  </p>
                </td>
              </tr>
            </template>
            <tr v-if="!rows.length">
              <td colspan="7" class="py-6 text-center text-sm opacity-60">
                ไม่มีแถวที่ตรงตัวกรองนี้
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="cursor" class="mt-3 flex justify-center">
        <button type="button" class="btn btn-sm" :disabled="loadingMore" @click="loadMore">
          <span v-if="loadingMore" class="loading loading-spinner loading-xs" />
          โหลดเพิ่ม
        </button>
      </div>

      <!-- ── ลบ ──────────────────────────────────────────────────── -->
      <div class="card mt-6 border border-error/30 bg-base-100">
        <div class="card-body gap-4">
          <div>
            <h2 class="font-semibold">ลบตามตัวกรองข้างบน</h2>
            <p class="mt-1 text-sm opacity-70">
              ลบได้เฉพาะสิ่งที่เห็นเท่านั้น — ตัวกรองชุดเดียวกันถูกใช้ทั้งตอนนับและตอนลบ
              และทุกครั้งที่ลบจะมีแถวบันทึกไว้ว่าใครลบ ใช้ตัวกรองอะไร ลบไปกี่แถว
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm" @click="quickImporter">
              ร่องรอย importer ({{ facets?.importerRows.toLocaleString() }})
            </button>
            <button type="button" class="btn btn-sm" @click="quickOlderThan(90)">
              เก่ากว่า 90 วัน
            </button>
            <button type="button" class="btn btn-sm" @click="quickOlderThan(365)">
              เก่ากว่า 1 ปี
            </button>
          </div>

          <label class="label w-fit cursor-pointer justify-start gap-2">
            <input v-model="keepDeletes" type="checkbox" class="checkbox checkbox-sm" />
            <span class="label-text text-sm">
              เก็บแถว DELETE ไว้เสมอ ({{ facets?.deleteRows.toLocaleString() }} แถว)
            </span>
          </label>
          <p class="-mt-2 text-xs opacity-60">
            แถว INSERT/UPDATE ยังตามไปดูค่าปัจจุบันในตารางจริงได้
            แต่แถว DELETE คือหลักฐานชิ้นเดียวที่เหลือของข้อมูลที่หายไปแล้ว
          </p>

          <div v-if="preview" class="rounded-lg border border-base-300 p-3 text-sm">
            <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span>จะลบ <b class="text-lg tabular-nums">{{ preview.rows.toLocaleString() }}</b> แถว</span>
              <span :class="preview.humanRows ? 'text-error font-medium' : 'opacity-60'">
                เป็นของคน {{ preview.humanRows.toLocaleString() }} แถว
              </span>
              <span v-if="preview.protectedRows" class="opacity-60">
                กันไว้ {{ preview.protectedRows.toLocaleString() }} แถว (DELETE)
              </span>
            </div>
            <p class="mt-1 text-xs opacity-60">
              <template v-if="preview.willReclaim">
                ลบเกินครึ่งตาราง ระบบจะเขียนตารางใหม่ให้ — คืนพื้นที่ทันที
              </template>
              <template v-else>
                ลบไม่ถึงครึ่งตาราง พื้นที่จะถูกปลดล็อกไว้ให้แถวใหม่ใช้ซ้ำ ไม่คืนดิสก์ทันที
              </template>
            </p>
          </div>

          <div
            v-if="preview?.wideOpen && preview.rows" role="alert"
            class="alert alert-warning flex-col items-start gap-2 py-2 text-sm"
          >
            <span>
              ยังไม่ได้ตั้งตัวกรอง = กวาดทั้งตาราง
              ตั้งตัวกรองให้แคบลงก่อน หรือติ๊กช่องนี้ถ้าตั้งใจจะกวาดทั้งหมดจริง ๆ
            </span>
            <label class="label cursor-pointer justify-start gap-2">
              <input v-model="wideOpenAck" type="checkbox" class="checkbox checkbox-sm" />
              <span class="label-text text-sm">ตั้งใจกวาดทั้งตาราง</span>
            </label>
          </div>

          <div class="flex justify-end">
            <button
              type="button" class="btn btn-error" :disabled="!canDelete"
              @click="confirmInput = ''; showConfirm = true"
            >
              ลบ {{ (preview?.rows ?? 0).toLocaleString() }} แถว
            </button>
          </div>
        </div>
      </div>

      <!-- ── คืนพื้นที่ ───────────────────────────────────────────── -->
      <div v-if="preview" class="card mt-4 border border-base-300 bg-base-100">
        <div class="card-body gap-3">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="flex-1">
              <h2 class="font-semibold">คืนพื้นที่ให้ดิสก์</h2>
              <p class="mt-1 text-sm opacity-70">
                การลบไม่คืนพื้นที่ทันที มันแค่ทำเครื่องหมายว่าแถวตายแล้วให้แถวใหม่มาเขียนทับ
                ปุ่มนี้เขียนตารางกับ index ใหม่ทั้งใบเพื่อบีบไฟล์ให้เล็กลงจริง ไม่ลบข้อมูลอะไร
              </p>
            </div>
            <button type="button" class="btn btn-sm" :disabled="busy" @click="handleReclaim">
              <span v-if="busy" class="loading loading-spinner loading-xs" />
              คืนพื้นที่
            </button>
          </div>
          <div class="stats stats-vertical border border-base-300 sm:stats-horizontal">
            <div class="stat">
              <div class="stat-title">ขนาด audit_log</div>
              <div class="stat-value text-2xl">{{ formatBytes(preview.size.totalBytes) }}</div>
              <div class="stat-desc">index {{ formatBytes(preview.size.indexBytes) }}</div>
            </div>
            <div class="stat">
              <div class="stat-title">แถวที่ลบแล้วรอคืนพื้นที่</div>
              <div class="stat-value text-2xl">{{ preview.size.deadRows.toLocaleString() }}</div>
              <div class="stat-desc">ค่าประมาณจากสถิติของ postgres</div>
            </div>
            <div class="stat">
              <div class="stat-title">ทั้งฐานข้อมูล</div>
              <div class="stat-value text-2xl">{{ formatBytes(preview.size.dbBytes) }}</div>
              <div class="stat-desc">audit_log คิดเป็น
                {{ Math.round((preview.size.totalBytes / preview.size.dbBytes) * 100) }}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── ยืนยันก่อนลบ ─────────────────────────────────────────── -->
    <div
      v-if="showConfirm && preview" class="modal modal-open"
      @click.self="showConfirm = false"
    >
      <div class="modal-box">
        <h3 class="text-lg font-semibold">
          ลบ {{ preview.rows.toLocaleString() }} แถวจาก audit_log?
        </h3>

        <dl class="mt-3 space-y-1 text-sm">
          <div class="flex justify-between">
            <dt class="opacity-70">ช่วงเวลา</dt>
            <dd v-if="preview.oldest">{{ formatWhen(preview.oldest) }} — {{ formatWhen(preview.newest!) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="opacity-70">เป็นของคน</dt>
            <dd :class="preview.humanRows > 0 ? 'text-error font-medium' : ''">
              {{ preview.humanRows.toLocaleString() }} แถว
            </dd>
          </div>
          <div v-if="preview.protectedRows" class="flex justify-between">
            <dt class="opacity-70">กันไว้ (DELETE)</dt>
            <dd>{{ preview.protectedRows.toLocaleString() }} แถว</dd>
          </div>
          <div class="flex justify-between">
            <dt class="opacity-70">เหลือหลังลบ</dt>
            <dd>{{ (preview.totalRows - preview.rows).toLocaleString() }} แถว</dd>
          </div>
        </dl>

        <div v-if="confirmNeeded" role="alert" class="alert alert-error mt-4 flex-col items-start gap-2 text-sm">
          <span>
            ตัวกรองนี้จะลบแถวที่มีคนทำจริง {{ preview.humanRows.toLocaleString() }} แถว
            ซึ่งเอากลับมาไม่ได้ — พิมพ์เลข {{ preview.humanRows }} เพื่อยืนยันว่าอ่านแล้ว
          </span>
          <input
            v-model="confirmInput" type="text" inputmode="numeric"
            :placeholder="String(preview.humanRows)"
            class="input input-sm input-bordered w-32 text-base-content"
          />
        </div>

        <p class="mt-3 text-xs opacity-60">
          ระบบจะบันทึกไว้ว่าใครลบ ใช้ตัวกรองอะไร และลบไปกี่แถว
          แถวบันทึกนั้นมีผู้กระทำจึงไม่ถูกกวาดทิ้งในรอบถัดไป
        </p>

        <div class="modal-action">
          <button type="button" class="btn btn-ghost" :disabled="busy" @click="showConfirm = false">
            ยกเลิก
          </button>
          <button
            type="button" class="btn btn-error" :disabled="busy || !confirmOk"
            @click="confirmDelete"
          >
            <span v-if="busy" class="loading loading-spinner loading-xs" />
            ลบ {{ preview.rows.toLocaleString() }} แถว
          </button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

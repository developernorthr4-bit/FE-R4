<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import {
  formatDate, formatDuration, STATUS_BADGE, STATUS_LABEL,
  type EventFilters, type EventRow, type Lookups,
} from '../lib/events'
import { deleteEvent, listEvents, loadLookups } from '../services/events.api'
import { useAuthStore } from '../stores/auth'
import { useFlashStore } from '../stores/flash'

const PAGE_SIZE = 25

const auth = useAuthStore()
const canWrite = computed(() => auth.can('editor'))

const filters = reactive<EventFilters>({
  province: [], from: '', to: '', status: '', type: '', cause: '', q: '', offset: 0,
})
const lookups = ref<Lookups | null>(null)
const rows = ref<EventRow[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
/** แถวที่กำลังรอยืนยันลบ — เก็บทั้งก้อนเพื่อโชว์เลขที่ใน dialog */
const pendingDelete = ref<EventRow | null>(null)
const deleting = ref(false)

const page = computed(() => Math.floor((filters.offset ?? 0) / PAGE_SIZE) + 1)
const pages = computed(() => Math.max(Math.ceil(total.value / PAGE_SIZE), 1))

onMounted(async () => {
  // ข้อความจากหน้าฟอร์มที่เพิ่งกด router.back() กลับมา
  notice.value = useFlashStore().take()
  try {
    lookups.value = await loadLookups()
  } catch {
    error.value = 'โหลดตัวเลือกไม่สำเร็จ'
  }
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const data = await listEvents({ ...filters, limit: PAGE_SIZE })
    rows.value = data.events
    total.value = data.total
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายการเหตุการณ์ไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

// โหลดใหม่ทุกครั้งที่ตัวกรองเปลี่ยน — deep เพราะ province เป็น array
watch(filters, load, { deep: true, immediate: true })

/** แก้ตัวกรองแล้วต้องกลับหน้าแรกเสมอ ไม่งั้นจะค้างอยู่หน้า 3 ของผลลัพธ์ที่มี 2 แถว */
function resetPage() {
  filters.offset = 0
}

function clearFilters() {
  Object.assign(filters, {
    province: [], from: '', to: '', status: '', type: '', cause: '', q: '', offset: 0,
  })
}

const provinceValue = computed({
  get: () => (filters.province?.length ? String(filters.province[0]) : ''),
  set: (v: string) => {
    filters.province = v ? [Number(v)] : []
    resetPage()
  },
})

async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  try {
    await deleteEvent(pendingDelete.value.id)
    notice.value = `ลบ ${pendingDelete.value.eventNo} แล้ว`
    pendingDelete.value = null
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'ลบไม่สำเร็จ')
    pendingDelete.value = null
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <AppLayout>
    <PageHeader title="Network Event" description="เหตุการณ์รายวันแยกตามจังหวัด">
      <template v-if="canWrite" #actions>
        <RouterLink to="/events/new" class="btn btn-primary">บันทึกเหตุการณ์</RouterLink>
      </template>
    </PageHeader>

    <div class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body p-4">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ค้นหา</span>
            <input
              v-model="filters.q" type="search" placeholder="เลขที่ หรือ หัวข้อ"
              class="input input-sm input-bordered w-full" @input="resetPage"
            />
          </label>

          <label class="form-control">
            <span class="label-text text-xs opacity-70">จังหวัด</span>
            <select v-model="provinceValue" class="select select-sm select-bordered w-full">
              <option value="">ทุกจังหวัด</option>
              <option v-for="p in lookups?.provinces" :key="p.id" :value="String(p.id)">
                {{ p.nameTh }}
              </option>
            </select>
          </label>

          <label class="form-control">
            <span class="label-text text-xs opacity-70">สถานะ</span>
            <select
              v-model="filters.status" class="select select-sm select-bordered w-full"
              @change="resetPage"
            >
              <option value="">ทุกสถานะ</option>
              <option v-for="(label, s) in STATUS_LABEL" :key="s" :value="s">{{ label }}</option>
            </select>
          </label>

          <label class="form-control">
            <span class="label-text text-xs opacity-70">ประเภท</span>
            <select
              v-model="filters.type" class="select select-sm select-bordered w-full"
              @change="resetPage"
            >
              <option value="">ทุกประเภท</option>
              <option v-for="t in lookups?.eventTypes" :key="t.id" :value="t.id">{{ t.nameTh }}</option>
            </select>
          </label>

          <label class="form-control">
            <span class="label-text text-xs opacity-70">ตั้งแต่วันที่</span>
            <input
              v-model="filters.from" type="date"
              class="input input-sm input-bordered w-full" @change="resetPage"
            />
          </label>

          <label class="form-control">
            <span class="label-text text-xs opacity-70">ถึงวันที่</span>
            <input
              v-model="filters.to" type="date"
              class="input input-sm input-bordered w-full" @change="resetPage"
            />
          </label>

          <div class="flex items-end">
            <button type="button" class="btn btn-sm btn-ghost" @click="clearFilters">
              ล้างตัวกรอง
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="notice" role="status" class="alert alert-success mb-4 text-sm">
      <span>{{ notice }}</span>
    </div>
    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm">
      <span>{{ error }}</span>
    </div>

    <div v-if="loading" class="mt-10 flex justify-center">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <div v-else-if="!rows.length" class="card border border-base-300 bg-base-100">
      <div class="card-body text-sm opacity-70">
        ไม่พบเหตุการณ์ตามเงื่อนไขนี้<template v-if="canWrite"> — กดปุ่มบันทึกเหตุการณ์เพื่อเพิ่มรายการแรก</template>
      </div>
    </div>

    <template v-else>
      <div class="card overflow-x-auto border border-base-300 bg-base-100">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>เลขที่</th>
              <th>วันที่</th>
              <th>จังหวัด</th>
              <th>หัวข้อ</th>
              <th>ประเภท</th>
              <th>สถานะ</th>
              <th class="text-right">ระยะเวลา</th>
              <th class="text-right">สถานี</th>
              <th v-if="canWrite" class="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in rows" :key="e.id" class="hover">
              <td>
                <RouterLink :to="`/events/${e.id}`" class="link link-primary font-medium">
                  {{ e.eventNo }}
                </RouterLink>
              </td>
              <td class="whitespace-nowrap">{{ formatDate(e.eventDate) }}</td>
              <td class="whitespace-nowrap">{{ e.provinceName }}</td>
              <td>
                <span class="line-clamp-2">{{ e.title }}</span>
                <span v-if="!e.isServiceAffecting" class="ml-1 text-xs opacity-60">
                  (ไม่กระทบบริการ)
                </span>
              </td>
              <td class="whitespace-nowrap opacity-70">{{ e.eventTypeName ?? '—' }}</td>
              <td>
                <span class="badge badge-sm" :class="STATUS_BADGE[e.status]">
                  {{ STATUS_LABEL[e.status] }}
                </span>
              </td>
              <td class="whitespace-nowrap text-right">{{ formatDuration(e.durationMin) }}</td>
              <td class="text-right">{{ e.siteCount || '—' }}</td>
              <td v-if="canWrite" class="text-right">
                <button
                  type="button" class="btn btn-xs btn-ghost text-error"
                  @click="pendingDelete = e"
                >
                  ลบ
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span class="opacity-70">ทั้งหมด {{ total }} รายการ · หน้า {{ page }} จาก {{ pages }}</span>
        <div class="join">
          <button
            type="button" class="btn btn-sm join-item"
            :disabled="(filters.offset ?? 0) === 0"
            @click="filters.offset = Math.max((filters.offset ?? 0) - PAGE_SIZE, 0)"
          >
            ก่อนหน้า
          </button>
          <button
            type="button" class="btn btn-sm join-item"
            :disabled="(filters.offset ?? 0) + PAGE_SIZE >= total"
            @click="filters.offset = (filters.offset ?? 0) + PAGE_SIZE"
          >
            ถัดไป
          </button>
        </div>
      </div>
    </template>

    <!--
      ยืนยันก่อนลบ ใช้ dialog ของ DaisyUI แทน confirm() ของเบราว์เซอร์
      เพราะต้องอธิบายได้ว่าลบแล้วหายถาวร และต่างจากการ "ยกเลิก" ยังไง
    -->
    <div v-if="pendingDelete" class="modal modal-open" @click.self="pendingDelete = null">
      <div class="modal-box">
        <h3 class="text-lg font-semibold">ลบ {{ pendingDelete.eventNo }}?</h3>
        <p class="mt-2 text-sm opacity-70">{{ pendingDelete.title }}</p>
        <div role="alert" class="alert alert-warning mt-4 text-sm">
          <span>
            ลบแล้วหายถาวร รวมถึงสถานีที่ผูกไว้และไทม์ไลน์ทั้งหมด
            ถ้าต้องการแค่ปิดงานที่ไม่เกิดขึ้นจริง ให้แก้สถานะเป็น &quot;ยกเลิก&quot; แทน
          </span>
        </div>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" :disabled="deleting" @click="pendingDelete = null">
            ยกเลิก
          </button>
          <button type="button" class="btn btn-error" :disabled="deleting" @click="confirmDelete">
            <span v-if="deleting" class="loading loading-spinner loading-xs" />
            ลบถาวร
          </button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

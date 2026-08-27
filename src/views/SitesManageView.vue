<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import SiteAssetsPanel from '../components/SiteAssetsPanel.vue'
import { errorMessage } from '../lib/api'
import { categorical } from '../lib/palette'
import {
  canWriteProvince, formatCoords, SITE_STATUS_BADGE, SITE_STATUS_LABEL, SITE_STATUSES,
  type SiteFilters, type SiteRow,
} from '../lib/sites'
import { loadProvinces, type Province } from '../services/provinces.api'
import {
  deleteSite, listSites, loadSiteLookups, restoreSite, type SiteLookups,
} from '../services/sites.api'
import { useAuthStore } from '../stores/auth'
import { useFlashStore } from '../stores/flash'
import { useThemeStore } from '../stores/theme'

/**
 * ตารางจัดการสถานี — คนละงานกับหน้าแผนที่ที่ /sites
 *
 *   แผนที่  ดูภาพรวมทั้งภาค หาว่าสถานีอยู่ตรงไหน ตรงไหนข้อมูลยังขาด
 *   ตาราง   ไล่แก้ทีละแถว เพิ่ม/ลบ/แก้ไข
 *
 * ยัดรวมหน้าเดียวได้ แต่จะได้หน้าที่ทำอะไรก็ไม่สุด — ตัวกรองของสองงานนี้
 * แทบไม่ทับกันเลย และตารางต้องการการแบ่งหน้าซึ่งแผนที่ไม่ต้องการ
 *
 * ต่างจากหน้าแผนที่อีกอย่างคือ "ไม่โหลดทั้ง 7,300 แถวมาเก็บในเครื่อง" —
 * ตารางแบ่งหน้าจาก BE เพราะต้องเห็นข้อมูลล่าสุดหลังมีคนอื่นแก้ ไม่ใช่ภาพ ณ ตอนโหลด
 */
const PAGE_SIZE = 25

const auth = useAuthStore()
const theme = useThemeStore()

const filters = reactive<SiteFilters>({
  q: '', province: '', operator: '', status: '', includeDeleted: false, offset: 0,
})

const rows = ref<SiteRow[]>([])
const total = ref(0)
const provinces = ref<Province[]>([])
const lookups = ref<SiteLookups | null>(null)

const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

/** แถวที่รอยืนยันลบ — เก็บทั้งก้อนเพื่อโชว์รหัสและจำนวนของที่ห้อยอยู่ใน dialog */
const pendingDelete = ref<SiteRow | null>(null)

/** สถานีที่เปิดแผงตู้/อุปกรณ์/แบตอยู่ — null = ไม่ได้เปิด */
const assetsFor = ref<SiteRow | null>(null)
const busyId = ref<string | null>(null)

const page = computed(() => Math.floor((filters.offset ?? 0) / PAGE_SIZE) + 1)
const pages = computed(() => Math.max(Math.ceil(total.value / PAGE_SIZE), 1))

/** สร้างสถานีใหม่ได้ถ้าเขียนได้อย่างน้อยหนึ่งจังหวัด — จังหวัดไหนไปว่ากันในฟอร์ม */
const canCreate = computed(() => auth.can('editor'))

/**
 * แยก "บทบาทเขียนไม่ได้" ออกจาก "จังหวัดนี้ไม่ใช่ของคุณ" — สองอย่างนี้ต้องไปทำ
 * คนละเรื่องกันต่อ (ขอเปลี่ยนบทบาท กับ ขอเพิ่มขอบเขตจังหวัด) ถ้าเขียนป้ายเดียว
 * viewer จะเห็นคำว่า "นอกขอบเขต" ทุกแถวแล้วเข้าใจผิดว่าไปขอจังหวัดเพิ่มได้
 */
const canWriteAnywhere = computed(() => auth.can('editor'))

function canEdit(row: SiteRow): boolean {
  return canWriteProvince(auth.user?.role, auth.user?.provinceScope, row.provinceId)
}

function colorOf(slot: number | null): string {
  return categorical(slot, theme.resolved === 'dark')
}

onMounted(async () => {
  // ข้อความจากหน้าฟอร์มที่เพิ่งกด router.back() กลับมา
  notice.value = useFlashStore().take()
  try {
    const [provs, lk] = await Promise.all([loadProvinces(), loadSiteLookups()])
    provinces.value = provs
    lookups.value = lk
    console.log(provinces.value);
    console.log(lookups.value);
  } catch (err) {
    error.value = errorMessage(err, 'โหลดตัวเลือกไม่สำเร็จ')
  }
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const data = await listSites({ ...filters, limit: PAGE_SIZE })
    rows.value = data.sites
    total.value = data.total
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายการสถานีไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

watch(filters, load, { deep: true, immediate: true })

/** แก้ตัวกรองแล้วต้องกลับหน้าแรกเสมอ ไม่งั้นจะค้างอยู่หน้า 12 ของผลลัพธ์ที่มี 3 แถว */
function resetPage() {
  filters.offset = 0
}

function clearFilters() {
  Object.assign(filters, {
    q: '', province: '', operator: '', status: '', includeDeleted: false, offset: 0,
  })
}

/** select ของ HTML คืนค่าเป็นสตริงเสมอ แต่ตัวกรองเก็บเป็นตัวเลข จึงต้องมีตัวแปลงคั่น */
const provinceValue = computed({
  get: () => (filters.province ? String(filters.province) : ''),
  set: (v: string) => { filters.province = v ? Number(v) : ''; resetPage() },
})
const operatorValue = computed({
  get: () => (filters.operator ? String(filters.operator) : ''),
  set: (v: string) => { filters.operator = v ? Number(v) : ''; resetPage() },
})

async function confirmDelete() {
  const row = pendingDelete.value
  if (!row) return
  busyId.value = row.id
  try {
    await deleteSite(row.id)
    notice.value = `ลบ ${row.siteCode} แล้ว — กู้คืนได้จากตัวกรอง "แสดงที่ลบแล้ว"`
    pendingDelete.value = null
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'ลบไม่สำเร็จ')
    pendingDelete.value = null
  } finally {
    busyId.value = null
  }
}

async function handleRestore(row: SiteRow) {
  busyId.value = row.id
  try {
    await restoreSite(row.id)
    notice.value = `กู้คืน ${row.siteCode} แล้ว`
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'กู้คืนไม่สำเร็จ')
  } finally {
    busyId.value = null
  }
}

/** สรุปว่ามีอะไรห้อยอยู่กับสถานีนี้บ้าง ใช้ในกล่องยืนยันลบ */
const attachedSummary = computed(() => {
  const row = pendingDelete.value
  if (!row) return []
  return [
    { label: 'ย่านความถี่', n: row.bandCount },
    { label: 'อุปกรณ์ CPE', n: row.deviceCount },
    { label: 'เหตุการณ์ที่ผูกไว้', n: row.eventCount },
  ].filter((x) => x.n > 0)
})
</script>

<template>
  <AppLayout>
    <PageHeader
      title="จัดการสถานี"
      :description="`เพิ่ม แก้ไข และลบข้อมูลสถานี · ทั้งหมด ${total.toLocaleString()} รายการตามเงื่อนไขนี้`"
    >
      <template #actions>
        <RouterLink to="/sites" class="btn btn-ghost btn-sm">ดูบนแผนที่</RouterLink>
        <RouterLink v-if="canCreate" to="/sites/new" class="btn btn-primary">เพิ่มสถานี</RouterLink>
      </template>
    </PageHeader>

    <div class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body p-4">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ค้นหา</span>
            <input
              v-model="filters.q" type="search" placeholder="รหัส หรือ ชื่อสถานี"
              class="input input-sm input-bordered w-full" @input="resetPage"
            />
          </label>

          <label class="form-control">
            <span class="label-text text-xs opacity-70">จังหวัด</span>
            <select v-model="provinceValue" class="select select-sm select-bordered w-full">
              <option value="">ทุกจังหวัด</option>
              <option v-for="p in provinces" :key="p.id" :value="String(p.id)">{{ p.nameTh }}</option>
            </select>
          </label>

          <label class="form-control">
            <span class="label-text text-xs opacity-70">ค่าย</span>
            <select v-model="operatorValue" class="select select-sm select-bordered w-full">
              <option value="">ทุกค่าย</option>
              <option v-for="o in lookups?.operators" :key="o.id" :value="String(o.id)">
                {{ o.nameTh }}
              </option>
              <option value="-1">ยังไม่ระบุ</option>
            </select>
          </label>

          <label class="form-control">
            <span class="label-text text-xs opacity-70">สถานะ</span>
            <select
              v-model="filters.status" class="select select-sm select-bordered w-full"
              @change="resetPage"
            >
              <option value="">ทุกสถานะ</option>
              <option v-for="s in SITE_STATUSES" :key="s" :value="s">{{ SITE_STATUS_LABEL[s] }}</option>
            </select>
          </label>
        </div>

        <div class="mt-1 flex flex-wrap items-center justify-between gap-2">
          <label class="label cursor-pointer justify-start gap-2">
            <input
              v-model="filters.includeDeleted" type="checkbox" class="checkbox checkbox-sm"
              @change="resetPage"
            />
            <span class="label-text text-xs">แสดงที่ลบแล้วด้วย</span>
          </label>
          <button type="button" class="btn btn-sm btn-ghost" @click="clearFilters">ล้างตัวกรอง</button>
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
        ไม่พบสถานีตามเงื่อนไขนี้<template v-if="canCreate"> — กดปุ่มเพิ่มสถานีเพื่อสร้างรายการใหม่</template>
      </div>
    </div>

    <template v-else>
      <div class="card overflow-x-auto border border-base-300 bg-base-100">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ชื่อ</th>
              <th>พื้นที่</th>
              <th>ค่าย</th>
              <th>สถานะ</th>
              <th class="text-right">ความถี่</th>
              <!-- CPE คือ cpe_devices ส่วน "อุปกรณ์" คือ site_equipments ที่อยู่ในตู้ คนละตาราง -->
              <th class="text-right">CPE</th>
              <th class="text-right">ตู้</th>
              <th class="text-right">อุปกรณ์</th>
              <th class="text-right">แบต</th>
              <th>พิกัด</th>
              <th class="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in rows" :key="s.id" class="hover" :class="s.deletedAt && 'opacity-50'">
              <td>
                <RouterLink :to="`/sites/${s.id}/edit`" class="link link-primary font-medium">
                  {{ s.siteCode }}
                </RouterLink>
                <span v-if="s.deletedAt" class="ml-1 badge badge-xs badge-error">ลบแล้ว</span>
                <span v-else-if="!s.isVerified" class="ml-1 badge badge-xs badge-ghost">ยังไม่ตรวจสอบ</span>
              </td>
              <td class="max-w-48 truncate opacity-70">{{ s.siteName ?? '—' }}</td>
              <td class="whitespace-nowrap">
                {{ s.provinceName }}
                <span v-if="s.districtName" class="opacity-60"> · {{ s.districtName }}</span>
              </td>
              <td class="whitespace-nowrap">
                <span class="inline-flex items-center gap-1.5">
                  <span class="size-2.5 rounded-full" :style="{ background: colorOf(s.operatorColorSlot) }" />
                  {{ s.operatorName ?? 'ยังไม่ระบุ' }}
                </span>
              </td>
              <td>
                <span class="badge badge-sm" :class="SITE_STATUS_BADGE[s.status]">
                  {{ SITE_STATUS_LABEL[s.status] }}
                </span>
              </td>
              <td class="text-right tabular-nums">{{ s.bandCount || '—' }}</td>
              <td class="text-right tabular-nums">{{ s.deviceCount || '—' }}</td>
              <td class="text-right tabular-nums">{{ s.cabinetCount || '—' }}</td>
              <td class="text-right tabular-nums">{{ s.equipmentCount || '—' }}</td>
              <td class="text-right tabular-nums">{{ s.batteryCount || '—' }}</td>
              <td class="whitespace-nowrap text-xs">
                <span v-if="s.lat !== null" class="opacity-60">{{ formatCoords(s.lat, s.lng) }}</span>
                <span v-else class="text-warning">ไม่มีพิกัด</span>
              </td>
              <td class="whitespace-nowrap text-right">
                <!-- เปิดได้ทุกบทบาท ปุ่มแก้ไขข้างในแผงเป็นตัวกันสิทธิ์อีกชั้น -->
                <button type="button" class="btn btn-xs btn-ghost" @click="assetsFor = s">
                  ตู้/แบต
                </button>
                <template v-if="canEdit(s)">
                  <button
                    v-if="s.deletedAt" type="button" class="btn btn-xs btn-ghost"
                    :disabled="busyId === s.id" @click="handleRestore(s)"
                  >
                    กู้คืน
                  </button>
                  <template v-else>
                    <RouterLink :to="`/sites/${s.id}/edit`" class="btn btn-xs btn-ghost">แก้ไข</RouterLink>
                    <button
                      type="button" class="btn btn-xs btn-ghost text-error"
                      :disabled="busyId === s.id" @click="pendingDelete = s"
                    >
                      ลบ
                    </button>
                  </template>
                </template>
                <span v-else class="text-xs opacity-50">
                  {{ canWriteAnywhere ? 'นอกขอบเขต' : 'ดูอย่างเดียว' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span class="opacity-70">ทั้งหมด {{ total.toLocaleString() }} รายการ · หน้า {{ page }} จาก {{ pages }}</span>
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
      ยืนยันก่อนลบ — บอกให้ครบว่ากำลังจะซ่อนอะไรไปด้วย
      ต่างจากเหตุการณ์ตรงที่สถานีลบแบบซ่อน ไม่ได้หายถาวร จึงไม่ต้องขู่ แค่บอกให้ชัด
    -->
    <div v-if="pendingDelete" class="modal modal-open" @click.self="pendingDelete = null">
      <div class="modal-box">
        <h3 class="text-lg font-semibold">ลบ {{ pendingDelete.siteCode }}?</h3>
        <p class="mt-2 text-sm opacity-70">
          {{ pendingDelete.siteName ?? 'ไม่มีชื่อสถานี' }} · {{ pendingDelete.provinceName }}
        </p>

        <div v-if="attachedSummary.length" role="alert" class="alert alert-warning mt-4 text-sm">
          <span>
            สถานีนี้มี
            <template v-for="(a, i) in attachedSummary" :key="a.label">
              <template v-if="i > 0"> · </template>{{ a.label }} {{ a.n }}
            </template>
            ผูกอยู่ — ข้อมูลเหล่านี้จะไม่ถูกลบ แต่จะหายไปจากหน้าจอพร้อมกับสถานี
          </span>
        </div>

        <p class="mt-3 text-sm opacity-70">
          เป็นการซ่อนไม่ใช่ลบถาวร ข้อมูลยังอยู่ในฐานข้อมูลและกู้คืนได้ทุกเมื่อจากตัวกรอง
          &quot;แสดงที่ลบแล้ว&quot;
        </p>

        <div class="modal-action">
          <button
            type="button" class="btn btn-ghost" :disabled="busyId !== null"
            @click="pendingDelete = null"
          >
            ยกเลิก
          </button>
          <button
            type="button" class="btn btn-error" :disabled="busyId !== null" @click="confirmDelete"
          >
            <span v-if="busyId" class="loading loading-spinner loading-xs" />
            ลบสถานี
          </button>
        </div>
      </div>
    </div>

    <!--
      แผงตู้/อุปกรณ์/แบตของสถานีที่เลือก
      :key บังคับให้สร้างใหม่ทุกครั้งที่เปลี่ยนสถานี ไม่งั้นจะเห็นข้อมูลของสถานีก่อนหน้า
      ค้างอยู่ชั่วขณะระหว่างโหลด ซึ่งเป็นภาพที่ทำให้เข้าใจผิดที่สุด
    -->
    <SiteAssetsPanel
      v-if="assetsFor"
      :key="assetsFor.id"
      :site-id="assetsFor.id"
      :can-edit="canEdit(assetsFor)"
      :site-code="assetsFor.siteCode"
      :site-name="assetsFor.siteName"
      :province-name="assetsFor.provinceName"
      @close="assetsFor = null"
      @changed="load"
    />
  </AppLayout>
</template>

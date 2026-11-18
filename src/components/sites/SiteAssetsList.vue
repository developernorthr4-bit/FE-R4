<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { errorMessage } from '@/lib/api'
import { formatDateTime, relativeTime } from '@/lib/format'
import {
  assetStatusBadge, assetStatusLabel, brandModel, dash, meterLabel, num,
  type BatteryRow, type EquipmentRow, type SiteAssets,
} from '@/lib/assets'
import AssetDeleteDialog from '@/components/sites/AssetDeleteDialog.vue'
import AssetFormDialog from '@/components/sites/AssetFormDialog.vue'
import BatteryMoveDialog from '@/components/sites/BatteryMoveDialog.vue'
import { useBatterySelection } from '@/components/sites/useBatterySelection'
import { getSiteAssets } from '@/services/sites.api'

/**
 * รายการของในสถานี — ตู้ / อุปกรณ์ / แบตเตอรี่ พร้อมการเพิ่ม แก้ไข และลบ
 *
 * ไม่มีกรอบนอกเป็นของตัวเองโดยตั้งใจ ใช้ได้ทั้งในแผงเลื่อนที่หน้าจัดการสถานี
 * (SiteAssetsPanel) และวางตรง ๆ ในหน้าแก้ไขสถานี — สองที่นั้นต่างกันแค่กรอบ
 *
 * ⚠️ ที่นี่ "ลบถาวร" ทุกปุ่ม ไม่ใช่การซ่อนแบบหน้าสถานี — ผลตรวจ PM ของแถวนั้น
 * หายตามไปด้วยเพราะ on delete cascade กล่องยืนยันจึงต้องเขียนจำนวนที่จะหายเสมอ
 *
 * ⚠️ ทุกปุ่มที่นี่บันทึกทันที ไม่เกี่ยวกับปุ่มบันทึกของฟอร์มที่ครอบอยู่ (ถ้ามี)
 */
const props = defineProps<{
  siteId: string
  /** false = ดูได้อย่างเดียว ทั้ง viewer และ editor ที่อยู่นอกขอบเขตจังหวัดนี้ */
  canEdit: boolean
}>()

const emit = defineEmits<{
  /** บอกหน้าที่ครอบอยู่ว่าจำนวนตู้/อุปกรณ์/แบตเปลี่ยนแล้ว */
  changed: []
}>()

const data = ref<SiteAssets | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const showRemoved = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await getSiteAssets(props.siteId)
  } catch (err) {
    error.value = errorMessage(err, 'โหลดข้อมูลทรัพย์สินไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ─────────────────────────────────────────────────────────────────────────────
// การจัดกลุ่ม
// ─────────────────────────────────────────────────────────────────────────────

function keep(row: { status: string }): boolean {
  return showRemoved.value || row.status !== 'removed'
}

function batteriesIn(cabinetId: string | null): BatteryRow[] {
  return (data.value?.batteries ?? []).filter((b) => b.cabinetId === cabinetId && keep(b))
}

function equipmentsIn(cabinetId: string | null): EquipmentRow[] {
  return (data.value?.equipments ?? []).filter((e) => e.cabinetId === cabinetId && keep(e))
}

/**
 * ตู้ที่ถอดแล้วยังต้องโผล่ถ้าข้างในยังมีของที่ใช้งานอยู่
 * ไม่งั้นของพวกนั้นจะหายไปจากหน้าจอทั้งที่ไม่ได้ถูกซ่อน — หายแบบไม่มีใครรู้
 */
const visibleCabinets = computed(() =>
  (data.value?.cabinets ?? []).filter(
    (c) => keep(c) || batteriesIn(c.id).length > 0 || equipmentsIn(c.id).length > 0,
  ),
)

const looseBatteries = computed(() => batteriesIn(null))
const looseEquipments = computed(() => equipmentsIn(null))

/** จำนวนแถวที่สวิตช์กำลังซ่อนอยู่ — ต้องบอก ไม่งั้นดูเหมือนข้อมูลหาย */
const hiddenCount = computed(() => {
  const d = data.value
  if (!d || showRemoved.value) return 0
  const gone = (rows: { status: string }[]) => rows.filter((r) => r.status === 'removed').length
  return gone(d.cabinets) + gone(d.batteries) + gone(d.equipments)
})

const totals = computed(() => {
  const d = data.value
  if (!d) return null
  const live = (rows: { status: string }[]) => rows.filter((r) => r.status !== 'removed').length
  return {
    cabinets: live(d.cabinets),
    equipments: live(d.equipments),
    batteries: live(d.batteries),
  }
})

/*
 * "แก้ไขล่าสุดเมื่อไหร่" แยกตามกลุ่ม — เอาค่าใหม่สุดของแต่ละกลุ่ม รวมของที่ถอดแล้วด้วย
 * เพราะการถอดก็คือการแก้ข้อมูลครั้งหนึ่ง คนถามว่า "แบตแตะล่าสุดเมื่อไหร่" ต้องได้คำตอบนั้น
 *
 * คนละเรื่องกับ lastCheckDate ของแบต (วันตรวจ PM ครั้งล่าสุด) — อันนั้นคือหน้างาน
 * อันนี้คือฐานข้อมูล สองอย่างนี้ห่างกันได้เป็นเดือน
 */
type Edited = { updatedAt: string; updatedByName: string | null }

function newest(rows: Edited[]): Edited | null {
  let best: Edited | null = null
  for (const r of rows) if (!best || r.updatedAt > best.updatedAt) best = r
  return best
}

const latest = computed(() => {
  const d = data.value
  if (!d) return null
  return {
    cabinets: newest(d.cabinets),
    batteries: newest(d.batteries),
    equipments: newest(d.equipments),
    meters: newest(d.meters),
  }
})

/** "3 วันที่แล้ว · โดย นรินทร์" หรือ "· จากการ import" เมื่อไม่มีใครแก้จากหน้าเว็บ */
function editedBy(r: Edited | null): string {
  if (!r) return '—'
  return `${relativeTime(r.updatedAt)} · ${r.updatedByName ? `โดย ${r.updatedByName}` : 'จากการ import'}`
}

function editedTitle(r: Edited | null): string {
  if (!r) return ''
  return `แก้ไขข้อมูลล่าสุด ${formatDateTime(r.updatedAt)}${r.updatedByName ? ` โดย ${r.updatedByName}` : ' (จากการ import)'}`
}

// ─────────────────────────────────────────────────────────────────────────────
// มิเตอร์ไฟฟ้า
// ─────────────────────────────────────────────────────────────────────────────

/**
 * มิเตอร์ของสถานี พร้อมรหัสตู้ที่มันจ่ายไฟให้
 *
 * จับคู่ที่นี่แทนที่จะให้ BE ทำ aggregate เพราะ cabinets โหลดมาอยู่แล้วในชุดเดียวกัน
 * และมิเตอร์ตัวเดียวจ่ายได้หลายตู้ ส่งซ้ำมากับทุกตู้จะเปลืองเปล่า
 */
const meters = computed(() => {
  const cabs = data.value?.cabinets ?? []
  return (data.value?.meters ?? []).map((m) => ({
    ...m,
    cabinetCodes: cabs.filter((c) => c.meterId === m.id).map((c) => c.cabinetCode),
  }))
})

const meterById = computed(() => new Map((data.value?.meters ?? []).map((m) => [m.id, m])))


/** ป้ายบนหัวการ์ดตู้ — null = ตู้นี้ยังไม่ผูกมิเตอร์ ไม่ต้องขึ้นป้ายให้รก */
function meterTagOf(meterId: string | null): string | null {
  if (!meterId) return null
  const m = meterById.value.get(meterId)
  return m ? meterLabel(m) : null
}

/**
 * หมายเหตุของมิเตอร์ทุกช่องรวมกัน ตัดตัวซ้ำ
 * ช่างมักเขียนข้อความเดียวกันลงหลายช่อง เช่น "กฟภ.ล็อกกุญแจ" ทั้งช่องเลขและช่องชนิด
 * ถ้าแสดงแยกทุกช่องจะได้ข้อความเดิมสี่รอบ
 */
const meterRemarks = computed(() => [...new Set(
  (data.value?.meters ?? [])
    .flatMap((m) => [
      m.meterNoRemark, m.meterTypeRemark, m.electricPhaseRemark, m.kwhSizeRemark, m.remark,
    ])
    .filter((x): x is string => Boolean(x)),
)])

// ─────────────────────────────────────────────────────────────────────────────
// ย้ายแบตข้ามสถานี
// ─────────────────────────────────────────────────────────────────────────────

const { selected, canMove, toggle, toggleCabinet, cabinetAllSelected, selectedBatteries } =
  useBatterySelection(data, batteriesIn)
const moving = ref(false)
const flash = ref<string | null>(null)


function cabinetCodeOf(cabinetId: string | null): string {
  return data.value?.cabinets.find((c) => c.id === cabinetId)?.cabinetCode ?? '-'
}

async function onMoved(count: number) {
  moving.value = false
  selected.value = new Set()
  flash.value = `ย้ายแบต ${count} ก้อนแล้ว — ก้อนเดิมที่นี่ขึ้นเป็น "ถอดออกแล้ว" (ติ๊ก "แสดงของที่ถอดแล้ว" เพื่อดูประวัติ)`
  await load()
  emit('changed')
}

/** "→ ไป TAK0065 ตู้ 1 ช่อง 5 · 2026-10-27" */
function movedText(dir: 'from' | 'to', b: BatteryRow): string {
  const r = dir === 'from' ? b.movedFrom : b.movedTo
  if (!r) return ''
  return `${dir === 'from' ? 'ย้ายมาจาก' : 'ย้ายไป'} ${r.siteCode} ตู้ ${r.cabinetCode ?? '-'} ช่อง ${r.bankCode ?? '-'}`
    + (r.at ? ` เมื่อ ${r.at}` : '')
}

// ─────────────────────────────────────────────────────────────────────────────
// ฟอร์มเพิ่ม/แก้ไข + ยืนยันลบ — อยู่ใน AssetFormDialog / AssetDeleteDialog
// ─────────────────────────────────────────────────────────────────────────────

const formDialog = ref<InstanceType<typeof AssetFormDialog> | null>(null)
const deleteDialog = ref<InstanceType<typeof AssetDeleteDialog> | null>(null)

async function onSaved() {
  await load()
  emit('changed')
}

async function onDeleted() {
  error.value = null
  await load()
  emit('changed')
}

/** ลบไม่สำเร็จ — ข้อความขึ้นในแถบ error ของรายการ (เหมือนก่อนแยกไฟล์) */
function onDeleteFailed(message: string) {
  error.value = message
}
</script>

<template>
  <div>
    <div v-if="loading" class="flex justify-center py-10">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <div v-else-if="error" role="alert" class="alert alert-error text-sm">
      <span>{{ error }}</span>
    </div>

    <template v-else-if="data">
      <!--
        แก้ไขข้อมูลล่าสุดของแต่ละกลุ่ม — ตอบคำถาม "ข้อมูลตู้/แบตชุดนี้ยังสดอยู่ไหม"
        ก่อนจะเชื่อตัวเลขข้างล่าง ชี้เมาส์เห็นเวลาเต็มกับชื่อคนแก้
      -->
      <div
        v-if="latest"
        class="mb-3 flex flex-wrap gap-x-5 gap-y-1 rounded-field bg-base-200 px-3 py-2 text-xs"
      >
        <span class="font-medium opacity-70">แก้ไขข้อมูลล่าสุด</span>
        <span :title="editedTitle(latest.cabinets)">ตู้ <b>{{ editedBy(latest.cabinets) }}</b></span>
        <span :title="editedTitle(latest.batteries)">แบต <b>{{ editedBy(latest.batteries) }}</b></span>
        <span :title="editedTitle(latest.equipments)">อุปกรณ์ <b>{{ editedBy(latest.equipments) }}</b></span>
        <span v-if="meters.length" :title="editedTitle(latest.meters)">
          มิเตอร์ <b>{{ editedBy(latest.meters) }}</b>
        </span>
      </div>

      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div v-if="totals" class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>ตู้ <b class="tabular-nums">{{ totals.cabinets }}</b></span>
          <span>อุปกรณ์ <b class="tabular-nums">{{ totals.equipments }}</b></span>
          <span>แบตเตอรี่ <b class="tabular-nums">{{ totals.batteries }}</b> ก้อน</span>
          <span v-if="meters.length">มิเตอร์ <b class="tabular-nums">{{ meters.length }}</b></span>
        </div>
        <div class="flex items-center gap-3">
          <template v-if="canEdit && selectedBatteries.length">
            <button type="button" class="btn btn-sm btn-secondary" @click="moving = true">
              ย้ายแบต {{ selectedBatteries.length }} ก้อน…
            </button>
            <button type="button" class="btn btn-sm btn-ghost" @click="selected = new Set()">
              ยกเลิกเลือก
            </button>
          </template>
          <label class="label cursor-pointer justify-start gap-2 py-0">
            <input v-model="showRemoved" type="checkbox" class="checkbox checkbox-sm" />
            <span class="label-text text-xs">
              แสดงของที่ถอดแล้ว<template v-if="hiddenCount"> ({{ hiddenCount }})</template>
            </span>
          </label>
          <button
            v-if="canEdit" type="button" class="btn btn-sm btn-primary"
            @click="formDialog?.openAddCabinet()"
          >
            เพิ่มตู้
          </button>
        </div>
      </div>

      <p v-if="!canEdit" class="mb-4 text-xs opacity-60">
        บทบาทของคุณดูข้อมูลได้อย่างเดียว — การเพิ่มหรือแก้ไขต้องเป็นผู้บันทึกข้อมูลขึ้นไป
      </p>
      <p v-else class="mb-4 text-xs opacity-60">
        ย้ายแบตไปสถานีอื่น: ติ๊กก้อนที่จะย้ายในตารางแบตเตอรี่ แล้วกดปุ่ม "ย้ายแบต"
      </p>

      <div v-if="flash" role="status" class="alert alert-success mb-4 text-sm">
        <span>{{ flash }}</span>
        <button type="button" class="btn btn-xs btn-ghost" @click="flash = null">ปิด</button>
      </div>

      <!--
        มิเตอร์ไฟฟ้า — อยู่เหนือรายการตู้เพราะเป็นของสถานี ไม่ใช่ของตู้
        มิเตอร์ตัวเดียวจ่ายได้หลายตู้ (ในฐานมีถึงขั้น 1 ตัวจ่าย 7 ตู้) จึงไม่แสดง
        ซ้ำในทุกตู้ — ตู้แต่ละใบขึ้นแค่ป้ายบอกว่าใช้ตัวไหน
      -->
      <section class="mb-4 rounded-box border border-base-300">
        <div class="flex flex-wrap items-center justify-between gap-2 bg-base-200 px-3 py-2">
          <span class="text-sm font-semibold">มิเตอร์ไฟฟ้า ({{ meters.length }})</span>
          <button
            v-if="canEdit" type="button" class="btn btn-xs btn-ghost"
            @click="formDialog?.openAddMeter()"
          >
            + เพิ่มมิเตอร์
          </button>
        </div>
        <div class="p-3">
          <div v-if="meters.length" class="overflow-x-auto">
            <table class="table table-xs">
              <thead>
                <tr>
                  <th>เลขมิเตอร์</th>
                  <th>ชนิด</th>
                  <th>เฟส</th>
                  <th>ขนาด</th>
                  <th>จ่ายให้ตู้</th>
                  <th v-if="canEdit" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in meters" :key="m.id">
                  <td class="font-medium" :class="{ 'opacity-60': m.meterNo === null }">
                    {{ meterLabel(m) }}
                    <span
                      v-if="m.manualLock" class="badge badge-xs badge-ghost ml-1 align-middle"
                      title="แถวนี้ถูกแก้ด้วยมือแล้ว การ import จะไม่ทับ"
                    >แก้ด้วยมือ</span>
                  </td>
                  <td class="opacity-70">{{ dash(m.meterType) }}</td>
                  <td class="opacity-70">{{ dash(m.electricPhase) }}</td>
                  <td class="opacity-70">{{ dash(m.kwhSize) }}</td>
                  <td class="opacity-70">
                    {{ m.cabinetCodes.length ? m.cabinetCodes.join(', ') : 'ยังไม่ผูกกับตู้ไหน' }}
                  </td>
                  <td v-if="canEdit" class="text-right whitespace-nowrap">
                    <button type="button" class="btn btn-xs btn-ghost" @click="formDialog?.openEditMeter(m)">
                      แก้ไข
                    </button>
                    <button
                      type="button" class="btn btn-xs btn-ghost text-error"
                      @click="deleteDialog?.askDeleteMeter(m)"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="text-sm opacity-60">ยังไม่มีมิเตอร์ของสถานีนี้</p>

          <ul v-if="meterRemarks.length" class="mt-2 flex flex-col gap-1">
            <li
              v-for="r in meterRemarks" :key="r"
              class="rounded-field bg-base-200 px-2.5 py-1.5 text-xs"
            >
              {{ r }}
            </li>
          </ul>

          <p class="mt-2 text-xs opacity-60">
            ค่าตั้งต้นมาจากใบตรวจ PM — แก้ที่นี่ได้ และแถวที่แก้แล้วจะถูกล็อกไว้
            ไม่ให้การ import รอบหน้าเอาค่าจากไฟล์ทับกลับ
          </p>
        </div>
      </section>

      <!-- ตู้แต่ละใบ พร้อมของข้างใน -->
      <section
        v-for="cab in visibleCabinets" :key="cab.id"
        class="mb-4 rounded-box border border-base-300"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 bg-base-200 px-3 py-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">ตู้ {{ cab.cabinetCode }}</span>
            <span class="badge badge-sm" :class="assetStatusBadge(cab.status)">
              {{ assetStatusLabel(cab.status) }}
            </span>
            <span class="text-sm opacity-70">
              {{ cab.typeName ?? 'ไม่ระบุชนิด' }} · {{ brandModel(cab.brand, cab.model) }}
            </span>
            <span
              v-if="meterTagOf(cab.meterId)" class="badge badge-sm badge-ghost"
              title="มิเตอร์ไฟฟ้าที่จ่ายไฟให้ตู้ใบนี้"
            >
              มิเตอร์ {{ meterTagOf(cab.meterId) }}
            </span>
            <span class="text-xs opacity-60" :title="editedTitle(cab)">
              แก้ไขล่าสุด {{ editedBy(cab) }}
            </span>
          </div>
          <div v-if="canEdit" class="flex gap-1">
            <button type="button" class="btn btn-xs btn-ghost" @click="formDialog?.openEditCabinet(cab)">
              แก้ไข
            </button>
            <button
              type="button" class="btn btn-xs btn-ghost text-error"
              @click="deleteDialog?.askDeleteCabinet(cab)"
            >
              ลบ
            </button>
          </div>
        </div>

        <div class="p-3">
          <!-- แบตเตอรี่ -->
          <div class="mb-1 flex items-center justify-between">
            <h3 class="text-sm font-medium opacity-70">แบตเตอรี่</h3>
            <button
              v-if="canEdit" type="button" class="btn btn-xs btn-ghost"
              @click="formDialog?.openAddBattery(cab.id)"
            >
              + เพิ่มก้อน
            </button>
          </div>
          <div v-if="!batteriesIn(cab.id).length" class="mb-3 text-sm opacity-50">
            ยังไม่มีก้อนแบตในตู้นี้
          </div>
          <div v-else class="mb-3 overflow-x-auto">
            <table class="table table-xs">
              <thead>
                <tr>
                  <th v-if="canEdit" class="w-6">
                    <input
                      type="checkbox" class="checkbox checkbox-xs"
                      title="เลือกทุกก้อนในตู้นี้ที่ย้ายได้"
                      :checked="cabinetAllSelected(cab.id)"
                      :disabled="!batteriesIn(cab.id).some(canMove)"
                      @change="toggleCabinet(cab.id)"
                    />
                  </th>
                  <th>รหัส</th>
                  <th>ชนิด</th>
                  <th>ยี่ห้อ/รุ่น</th>
                  <th class="text-right">ความจุ</th>
                  <th class="text-right">SOH</th>
                  <th>สถานะ</th>
                  <th>แก้ล่าสุด</th>
                  <th v-if="canEdit" class="text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="b in batteriesIn(cab.id)" :key="b.id"
                  :class="b.status === 'removed' ? 'opacity-50' : ''"
                >
                  <td v-if="canEdit">
                    <input
                      v-if="canMove(b)" type="checkbox" class="checkbox checkbox-xs"
                      :checked="selected.has(b.id)" @change="toggle(b.id)"
                    />
                  </td>
                  <td class="font-medium">{{ dash(b.bankCode) }}</td>
                  <td>{{ b.typeName ?? 'ไม่ระบุ' }}</td>
                  <td>{{ brandModel(b.brand, b.model) }}</td>
                  <td class="text-right tabular-nums">{{ num(b.capacityAh, 'Ah') }}</td>
                  <td class="text-right tabular-nums">{{ num(b.healthPct, '%') }}</td>
                  <td>
                    <span class="badge badge-xs" :class="assetStatusBadge(b.status)">
                      {{ assetStatusLabel(b.status) }}
                    </span>
                    <RouterLink
                      v-if="b.movedFrom" :to="`/sites/${b.movedFrom.siteId}/edit`"
                      class="badge badge-xs badge-info badge-outline ml-1 whitespace-nowrap"
                      :title="movedText('from', b)"
                    >← จาก {{ b.movedFrom.siteCode }}</RouterLink>
                    <RouterLink
                      v-if="b.movedTo" :to="`/sites/${b.movedTo.siteId}/edit`"
                      class="badge badge-xs badge-info badge-outline ml-1 whitespace-nowrap"
                      :title="movedText('to', b)"
                    >ไป {{ b.movedTo.siteCode }} →</RouterLink>
                  </td>
                  <td class="whitespace-nowrap text-xs opacity-70" :title="editedTitle(b)">
                    {{ relativeTime(b.updatedAt) }}
                  </td>
                  <td v-if="canEdit" class="whitespace-nowrap text-right">
                    <button type="button" class="btn btn-xs btn-ghost" @click="formDialog?.openEditBattery(b)">
                      แก้ไข
                    </button>
                    <button
                      type="button" class="btn btn-xs btn-ghost text-error"
                      @click="deleteDialog?.askDeleteBattery(b)"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- อุปกรณ์ -->
          <div class="mb-1 flex items-center justify-between">
            <h3 class="text-sm font-medium opacity-70">อุปกรณ์</h3>
            <button
              v-if="canEdit" type="button" class="btn btn-xs btn-ghost"
              @click="formDialog?.openAddEquipment(cab.id)"
            >
              + เพิ่มอุปกรณ์
            </button>
          </div>
          <div v-if="!equipmentsIn(cab.id).length" class="text-sm opacity-50">
            ยังไม่มีอุปกรณ์ในตู้นี้
          </div>
          <div v-else class="overflow-x-auto">
            <table class="table table-xs">
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th>ชนิด</th>
                  <th>ยี่ห้อ/รุ่น</th>
                  <th>IP จัดการ</th>
                  <th class="text-right">จำนวน</th>
                  <th>สถานะ</th>
                  <th>แก้ล่าสุด</th>
                  <th v-if="canEdit" class="text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="e in equipmentsIn(cab.id)" :key="e.id"
                  :class="e.status === 'removed' ? 'opacity-50' : ''"
                >
                  <td class="font-medium">{{ dash(e.name) }}</td>
                  <td>{{ e.typeName ?? 'ไม่ระบุ' }}</td>
                  <td>{{ brandModel(e.brand, e.model) }}</td>
                  <td class="font-mono text-xs">{{ dash(e.mgmtIp) }}</td>
                  <td class="text-right tabular-nums">{{ e.qty }}</td>
                  <td>
                    <span class="badge badge-xs" :class="assetStatusBadge(e.status)">
                      {{ assetStatusLabel(e.status) }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap text-xs opacity-70" :title="editedTitle(e)">
                    {{ relativeTime(e.updatedAt) }}
                  </td>
                  <td v-if="canEdit" class="whitespace-nowrap text-right">
                    <button type="button" class="btn btn-xs btn-ghost" @click="formDialog?.openEditEquipment(e)">
                      แก้ไข
                    </button>
                    <button
                      type="button" class="btn btn-xs btn-ghost text-error"
                      @click="deleteDialog?.askDeleteEquipment(e)"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!--
        ของที่ไม่ได้ผูกตู้ — สคีมายอมให้ cabinet_id เป็น null ได้
        ตอนนี้ยังไม่มีสักแถวในฐานข้อมูล แต่หน้านี้เองสร้างขึ้นมาได้
        ถ้าไม่แสดงกลุ่มนี้ ของที่หลุดออกมาจะนับอยู่ในยอดรวมแต่มองไม่เห็นเลย
      -->
      <section
        v-if="looseBatteries.length || looseEquipments.length"
        class="mb-4 rounded-box border border-warning/40"
      >
        <div class="bg-warning/10 px-3 py-2 text-sm font-medium">
          ยังไม่ผูกตู้ ({{ looseBatteries.length + looseEquipments.length }})
          <span class="font-normal opacity-70">
            — รู้ว่าอยู่สถานีนี้ แต่ยังไม่รู้ว่าอยู่ตู้ไหน
          </span>
        </div>
        <div class="overflow-x-auto p-3">
          <table class="table table-xs">
            <tbody>
              <tr v-for="b in looseBatteries" :key="b.id">
                <td>แบต {{ dash(b.bankCode) }}</td>
                <td>{{ b.typeName ?? 'ไม่ระบุ' }}</td>
                <td>{{ brandModel(b.brand, b.model) }}</td>
                <td v-if="canEdit" class="text-right">
                  <button type="button" class="btn btn-xs btn-ghost" @click="formDialog?.openEditBattery(b)">
                    ย้ายเข้าตู้
                  </button>
                  <button
                    type="button" class="btn btn-xs btn-ghost text-error"
                    @click="deleteDialog?.askDeleteBattery(b)"
                  >
                    ลบ
                  </button>
                </td>
              </tr>
              <tr v-for="e in looseEquipments" :key="e.id">
                <td>{{ dash(e.name) }}</td>
                <td>{{ e.typeName ?? 'ไม่ระบุ' }}</td>
                <td>{{ brandModel(e.brand, e.model) }}</td>
                <td v-if="canEdit" class="text-right">
                  <button type="button" class="btn btn-xs btn-ghost" @click="formDialog?.openEditEquipment(e)">
                    ย้ายเข้าตู้
                  </button>
                  <button
                    type="button" class="btn btn-xs btn-ghost text-error"
                    @click="deleteDialog?.askDeleteEquipment(e)"
                  >
                    ลบ
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div
        v-if="!visibleCabinets.length && !looseBatteries.length && !looseEquipments.length"
        class="rounded-box border border-base-300 p-6 text-center text-sm opacity-70"
      >
        สถานีนี้ยังไม่มีตู้ในทะเบียน
        <template v-if="canEdit"> — กดปุ่มเพิ่มตู้เพื่อเริ่มบันทึก</template>
        <p v-if="hiddenCount" class="mt-1 text-xs">
          (ซ่อนของที่ถอดแล้วอยู่ {{ hiddenCount }} รายการ)
        </p>
      </div>

      <p v-else-if="hiddenCount" class="text-xs opacity-60">
        ซ่อนของที่ถอดแล้วอยู่ {{ hiddenCount }} รายการ
      </p>
    </template>

    <AssetFormDialog ref="formDialog" :site-id="siteId" :data="data" @saved="onSaved" />

    <!-- ═══ ย้ายแบตข้ามสถานี ═══ -->
    <BatteryMoveDialog
      v-if="moving && data && selectedBatteries.length"
      :from-site-id="siteId"
      :from-site-code="data.site.siteCode"
      :batteries="selectedBatteries"
      :cabinet-code-of="cabinetCodeOf"
      @close="moving = false"
      @moved="onMoved"
    />

    <AssetDeleteDialog
      ref="deleteDialog" :site-id="siteId"
      @deleted="onDeleted" @failed="onDeleteFailed"
    />
  </div>
</template>

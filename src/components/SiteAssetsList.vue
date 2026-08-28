<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { errorMessage } from '../lib/api'
import {
  assetStatusBadge, assetStatusLabel, brandModel, dash, meterLabel, nextCode, num,
  type BatteryRow, type CabinetRow, type EquipmentRow, type SiteAssets,
} from '../lib/assets'
import {
  createBattery, createCabinet, createEquipment,
  deleteBattery, deleteCabinet, deleteEquipment,
  getSiteAssets, updateBattery, updateCabinet, updateEquipment,
} from '../services/sites.api'

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
const busy = ref(false)

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

const cabinetOptions = computed(() => data.value?.cabinets ?? [])

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
// ฟอร์ม
// ─────────────────────────────────────────────────────────────────────────────

type FormKind = 'cabinet' | 'battery' | 'equipment'

/**
 * ฟอร์มเดียวใช้ทั้งสามชนิด เก็บทุกช่องเป็นสตริงตามที่ input คืนมา
 *
 * สตริงว่างส่งขึ้นไปได้เลย — BE ถือว่า '' คือ "ไม่ระบุ" เหมือน null ทุกช่อง
 * (optionalText / checkNumeric / checkDate ทำเหมือนกันหมด) จึงไม่ต้องแปลงที่นี่
 * แล้วเสี่ยงส่ง 0 หรือ NaN ขึ้นไปแทนช่องที่ตั้งใจเว้นว่าง
 */
type FormState = {
  kind: FormKind
  id: string | null
  title: string
  cabinetId: string
  cabinetCode: string
  bankCode: string
  assetTypeId: string
  name: string
  brand: string
  model: string
  serialNo: string
  mgmtIp: string
  voltageV: string
  capacityAh: string
  stringCount: string
  qty: string
  healthPct: string
  installDate: string
  expiryDate: string
  installedAt: string
  warrantyUntil: string
  status: string
  remark: string
}

const form = ref<FormState | null>(null)
const formError = ref<string | null>(null)
const saving = ref(false)

function blank(kind: FormKind, title: string): FormState {
  return {
    kind, id: null, title,
    cabinetId: '', cabinetCode: '', bankCode: '', assetTypeId: '', name: '',
    brand: '', model: '', serialNo: '', mgmtIp: '',
    voltageV: '', capacityAh: '', stringCount: '', qty: '', healthPct: '',
    installDate: '', expiryDate: '', installedAt: '', warrantyUntil: '',
    status: 'active', remark: '',
  }
}

const typeOptions = computed(() => {
  const kind = form.value?.kind
  return (data.value?.types ?? []).filter((t) => t.kind === kind)
})

function openAddCabinet() {
  const f = blank('cabinet', 'เพิ่มตู้')
  // รหัสตู้ของจริงคือลำดับ "1".."7" ในสถานี เดาต่อให้เลยแล้วผู้ใช้แก้ทับได้
  f.cabinetCode = nextCode((data.value?.cabinets ?? []).map((c) => c.cabinetCode))
  formError.value = null
  form.value = f
}

function openEditCabinet(row: CabinetRow) {
  const f = blank('cabinet', `แก้ไขตู้ ${row.cabinetCode}`)
  Object.assign(f, {
    id: row.id,
    cabinetCode: row.cabinetCode,
    assetTypeId: row.assetTypeId === null ? '' : String(row.assetTypeId),
    brand: row.brand ?? '',
    model: row.model ?? '',
    serialNo: row.serialNo ?? '',
    installedAt: row.installedAt ?? '',
    status: row.status,
    remark: row.remark ?? '',
  })
  formError.value = null
  form.value = f
}

function openAddBattery(cabinetId: string | null) {
  const f = blank('battery', 'เพิ่มก้อนแบต')
  f.cabinetId = cabinetId ?? ''
  f.bankCode = nextCode(
    (data.value?.batteries ?? [])
      .filter((b) => b.cabinetId === cabinetId && b.status !== 'removed')
      .map((b) => b.bankCode),
  )
  f.qty = '1'
  formError.value = null
  form.value = f
}

function openEditBattery(row: BatteryRow) {
  const f = blank('battery', `แก้ไขก้อนแบต ${row.bankCode ?? ''}`.trim())
  Object.assign(f, {
    id: row.id,
    cabinetId: row.cabinetId ?? '',
    bankCode: row.bankCode ?? '',
    assetTypeId: row.assetTypeId === null ? '' : String(row.assetTypeId),
    brand: row.brand ?? '',
    model: row.model ?? '',
    voltageV: row.voltageV === null ? '' : String(row.voltageV),
    capacityAh: row.capacityAh === null ? '' : String(row.capacityAh),
    stringCount: row.stringCount === null ? '' : String(row.stringCount),
    qty: String(row.qty),
    healthPct: row.healthPct === null ? '' : String(row.healthPct),
    installDate: row.installDate ?? '',
    expiryDate: row.expiryDate ?? '',
    status: row.status,
    remark: row.remark ?? '',
  })
  formError.value = null
  form.value = f
}

function openAddEquipment(cabinetId: string | null) {
  const f = blank('equipment', 'เพิ่มอุปกรณ์')
  f.cabinetId = cabinetId ?? ''
  f.qty = '1'
  formError.value = null
  form.value = f
}

function openEditEquipment(row: EquipmentRow) {
  const f = blank('equipment', `แก้ไข ${row.name ?? 'อุปกรณ์'}`)
  Object.assign(f, {
    id: row.id,
    cabinetId: row.cabinetId ?? '',
    assetTypeId: row.assetTypeId === null ? '' : String(row.assetTypeId),
    name: row.name ?? '',
    brand: row.brand ?? '',
    model: row.model ?? '',
    serialNo: row.serialNo ?? '',
    mgmtIp: row.mgmtIp ?? '',
    qty: String(row.qty),
    installedAt: row.installedAt ?? '',
    warrantyUntil: row.warrantyUntil ?? '',
    status: row.status,
    remark: row.remark ?? '',
  })
  formError.value = null
  form.value = f
}

async function submit() {
  const f = form.value
  if (!f) return
  saving.value = true
  formError.value = null
  const site = props.siteId

  try {
    if (f.kind === 'cabinet') {
      const p = {
        cabinetCode: f.cabinetCode, assetTypeId: f.assetTypeId, brand: f.brand,
        model: f.model, serialNo: f.serialNo, installedAt: f.installedAt,
        status: f.status, remark: f.remark,
      }
      if (f.id) await updateCabinet(site, f.id, p)
      else await createCabinet(site, p)
    } else if (f.kind === 'battery') {
      const p = {
        cabinetId: f.cabinetId, bankCode: f.bankCode, assetTypeId: f.assetTypeId,
        brand: f.brand, model: f.model, voltageV: f.voltageV, capacityAh: f.capacityAh,
        stringCount: f.stringCount, qty: f.qty, installDate: f.installDate,
        expiryDate: f.expiryDate, healthPct: f.healthPct, status: f.status, remark: f.remark,
      }
      if (f.id) await updateBattery(site, f.id, p)
      else await createBattery(site, p)
    } else {
      const p = {
        cabinetId: f.cabinetId, assetTypeId: f.assetTypeId, name: f.name, brand: f.brand,
        model: f.model, serialNo: f.serialNo, mgmtIp: f.mgmtIp, qty: f.qty,
        installedAt: f.installedAt, warrantyUntil: f.warrantyUntil,
        status: f.status, remark: f.remark,
      }
      if (f.id) await updateEquipment(site, f.id, p)
      else await createEquipment(site, p)
    }
    form.value = null
    await load()
    emit('changed')
  } catch (err) {
    formError.value = errorMessage(err, 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// การลบ
// ─────────────────────────────────────────────────────────────────────────────

type PendingDelete = {
  kind: FormKind
  id: string
  label: string
  /** สิ่งที่จะหายไปด้วย — ให้อ่านออกก่อนกด ไม่ใช่ถามซ้ำเปล่า ๆ */
  losses: string[]
  /** ลบไม่ได้ตอนนี้ พร้อมเหตุผล — ตู้ที่ยังมีของข้างในเป็นกรณีเดียวที่เกิด */
  blocker: string | null
}

const pendingDelete = ref<PendingDelete | null>(null)

function askDeleteCabinet(row: CabinetRow) {
  const inside = [
    row.batteryCount > 0 ? `แบต ${row.batteryCount} ก้อน` : null,
    row.equipmentCount > 0 ? `อุปกรณ์ ${row.equipmentCount} รายการ` : null,
  ].filter((x): x is string => x !== null)

  pendingDelete.value = {
    kind: 'cabinet',
    id: row.id,
    label: `ตู้ ${row.cabinetCode}`,
    losses: row.pmCheckCount > 0 ? [`ผลตรวจ PM ${row.pmCheckCount} ใบ`] : [],
    blocker: inside.length
      ? `ตู้นี้ยังมี${inside.join(' และ ')}อยู่ข้างใน — ต้องลบหรือย้ายของเหล่านี้ออกก่อน `
        + 'ไม่งั้นจะเหลือของที่ยังอยู่ในทะเบียนแต่ไม่รู้ว่าเคยอยู่ตู้ไหน'
      : null,
  }
}

function askDeleteBattery(row: BatteryRow) {
  pendingDelete.value = {
    kind: 'battery',
    id: row.id,
    label: `ก้อนแบต ${row.bankCode ?? '(ไม่มีรหัส)'}`,
    losses: row.pmCheckCount > 0 ? [`ผลตรวจ PM ${row.pmCheckCount} ใบ`] : [],
    blocker: null,
  }
}

function askDeleteEquipment(row: EquipmentRow) {
  pendingDelete.value = {
    kind: 'equipment',
    id: row.id,
    label: row.name ?? 'อุปกรณ์นี้',
    losses: [],
    blocker: null,
  }
}

async function confirmDelete() {
  const p = pendingDelete.value
  if (!p || p.blocker) return
  busy.value = true
  error.value = null
  try {
    if (p.kind === 'cabinet') await deleteCabinet(props.siteId, p.id)
    else if (p.kind === 'battery') await deleteBattery(props.siteId, p.id)
    else await deleteEquipment(props.siteId, p.id)
    pendingDelete.value = null
    await load()
    emit('changed')
  } catch (err) {
    error.value = errorMessage(err, 'ลบไม่สำเร็จ')
    pendingDelete.value = null
  } finally {
    busy.value = false
  }
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
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div v-if="totals" class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>ตู้ <b class="tabular-nums">{{ totals.cabinets }}</b></span>
          <span>อุปกรณ์ <b class="tabular-nums">{{ totals.equipments }}</b></span>
          <span>แบตเตอรี่ <b class="tabular-nums">{{ totals.batteries }}</b> ก้อน</span>
          <span v-if="meters.length">มิเตอร์ <b class="tabular-nums">{{ meters.length }}</b></span>
        </div>
        <div class="flex items-center gap-3">
          <label class="label cursor-pointer justify-start gap-2 py-0">
            <input v-model="showRemoved" type="checkbox" class="checkbox checkbox-sm" />
            <span class="label-text text-xs">
              แสดงของที่ถอดแล้ว<template v-if="hiddenCount"> ({{ hiddenCount }})</template>
            </span>
          </label>
          <button
            v-if="canEdit" type="button" class="btn btn-sm btn-primary"
            @click="openAddCabinet"
          >
            เพิ่มตู้
          </button>
        </div>
      </div>

      <p v-if="!canEdit" class="mb-4 text-xs opacity-60">
        บทบาทของคุณดูข้อมูลได้อย่างเดียว — การเพิ่มหรือแก้ไขต้องเป็นผู้บันทึกข้อมูลขึ้นไป
      </p>

      <!--
        มิเตอร์ไฟฟ้า — อยู่เหนือรายการตู้เพราะเป็นของสถานี ไม่ใช่ของตู้
        มิเตอร์ตัวเดียวจ่ายได้หลายตู้ (ในฐานมีถึงขั้น 1 ตัวจ่าย 7 ตู้) จึงไม่แสดง
        ซ้ำในทุกตู้ — ตู้แต่ละใบขึ้นแค่ป้ายบอกว่าใช้ตัวไหน
      -->
      <section v-if="meters.length" class="mb-4 rounded-box border border-base-300">
        <div class="bg-base-200 px-3 py-2 text-sm font-semibold">
          มิเตอร์ไฟฟ้า ({{ meters.length }})
        </div>
        <div class="p-3">
          <div class="overflow-x-auto">
            <table class="table table-xs">
              <thead>
                <tr>
                  <th>เลขมิเตอร์</th>
                  <th>ชนิด</th>
                  <th>เฟส</th>
                  <th>ขนาด</th>
                  <th>จ่ายให้ตู้</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in meters" :key="m.id">
                  <td class="font-medium" :class="{ 'opacity-60': m.meterNo === null }">
                    {{ meterLabel(m) }}
                  </td>
                  <td class="opacity-70">{{ dash(m.meterType) }}</td>
                  <td class="opacity-70">{{ dash(m.electricPhase) }}</td>
                  <td class="opacity-70">{{ dash(m.kwhSize) }}</td>
                  <td class="opacity-70">
                    {{ m.cabinetCodes.length ? m.cabinetCodes.join(', ') : 'ยังไม่ผูกกับตู้ไหน' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <ul v-if="meterRemarks.length" class="mt-2 flex flex-col gap-1">
            <li
              v-for="r in meterRemarks" :key="r"
              class="rounded-field bg-base-200 px-2.5 py-1.5 text-xs"
            >
              {{ r }}
            </li>
          </ul>

          <p class="mt-2 text-xs opacity-60">
            มาจากใบตรวจ PM แก้ที่นี่ไม่ได้ — ถ้าข้อมูลไม่ตรง ให้แก้ที่ไฟล์ต้นทางแล้ว import ใหม่
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
          </div>
          <div v-if="canEdit" class="flex gap-1">
            <button type="button" class="btn btn-xs btn-ghost" @click="openEditCabinet(cab)">
              แก้ไข
            </button>
            <button
              type="button" class="btn btn-xs btn-ghost text-error"
              @click="askDeleteCabinet(cab)"
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
              @click="openAddBattery(cab.id)"
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
                  <th>รหัส</th>
                  <th>ชนิด</th>
                  <th>ยี่ห้อ/รุ่น</th>
                  <th class="text-right">ความจุ</th>
                  <th class="text-right">SOH</th>
                  <th>สถานะ</th>
                  <th v-if="canEdit" class="text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="b in batteriesIn(cab.id)" :key="b.id"
                  :class="b.status === 'removed' ? 'opacity-50' : ''"
                >
                  <td class="font-medium">{{ dash(b.bankCode) }}</td>
                  <td>{{ b.typeName ?? 'ไม่ระบุ' }}</td>
                  <td>{{ brandModel(b.brand, b.model) }}</td>
                  <td class="text-right tabular-nums">{{ num(b.capacityAh, 'Ah') }}</td>
                  <td class="text-right tabular-nums">{{ num(b.healthPct, '%') }}</td>
                  <td>
                    <span class="badge badge-xs" :class="assetStatusBadge(b.status)">
                      {{ assetStatusLabel(b.status) }}
                    </span>
                  </td>
                  <td v-if="canEdit" class="whitespace-nowrap text-right">
                    <button type="button" class="btn btn-xs btn-ghost" @click="openEditBattery(b)">
                      แก้ไข
                    </button>
                    <button
                      type="button" class="btn btn-xs btn-ghost text-error"
                      @click="askDeleteBattery(b)"
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
              @click="openAddEquipment(cab.id)"
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
                  <td v-if="canEdit" class="whitespace-nowrap text-right">
                    <button type="button" class="btn btn-xs btn-ghost" @click="openEditEquipment(e)">
                      แก้ไข
                    </button>
                    <button
                      type="button" class="btn btn-xs btn-ghost text-error"
                      @click="askDeleteEquipment(e)"
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
                  <button type="button" class="btn btn-xs btn-ghost" @click="openEditBattery(b)">
                    ย้ายเข้าตู้
                  </button>
                  <button
                    type="button" class="btn btn-xs btn-ghost text-error"
                    @click="askDeleteBattery(b)"
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
                  <button type="button" class="btn btn-xs btn-ghost" @click="openEditEquipment(e)">
                    ย้ายเข้าตู้
                  </button>
                  <button
                    type="button" class="btn btn-xs btn-ghost text-error"
                    @click="askDeleteEquipment(e)"
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

    <!-- ═══ ฟอร์มเพิ่ม/แก้ไข ═══ -->
    <div v-if="form" class="modal modal-open" @click.self="form = null">
      <div class="modal-box max-w-2xl">
        <h3 class="text-lg font-semibold">{{ form.title }}</h3>

        <form class="mt-4 grid gap-3 sm:grid-cols-2" @submit.prevent="submit">
          <!-- ตู้ปลายทาง: มีเฉพาะแบตกับอุปกรณ์ -->
          <label v-if="form.kind !== 'cabinet'" class="form-control">
            <span class="label-text text-xs opacity-70">อยู่ในตู้</span>
            <select v-model="form.cabinetId" class="select select-sm select-bordered w-full">
              <option value="">ยังไม่ผูกตู้</option>
              <option v-for="c in cabinetOptions" :key="c.id" :value="c.id">
                ตู้ {{ c.cabinetCode }}
              </option>
            </select>
          </label>

          <label v-if="form.kind === 'cabinet'" class="form-control">
            <span class="label-text text-xs opacity-70">รหัสตู้</span>
            <input
              v-model="form.cabinetCode" type="text" required
              class="input input-sm input-bordered w-full"
            />
          </label>

          <label v-if="form.kind === 'battery'" class="form-control">
            <span class="label-text text-xs opacity-70">รหัสก้อน</span>
            <input v-model="form.bankCode" type="text" class="input input-sm input-bordered w-full" />
          </label>

          <label v-if="form.kind === 'equipment'" class="form-control">
            <span class="label-text text-xs opacity-70">ชื่ออุปกรณ์</span>
            <input v-model="form.name" type="text" class="input input-sm input-bordered w-full" />
          </label>

          <label class="form-control">
            <span class="label-text text-xs opacity-70">ชนิด</span>
            <select v-model="form.assetTypeId" class="select select-sm select-bordered w-full">
              <option value="">ไม่ระบุ</option>
              <option v-for="t in typeOptions" :key="t.id" :value="String(t.id)">
                {{ t.nameTh }}
              </option>
            </select>
          </label>

          <label class="form-control">
            <span class="label-text text-xs opacity-70">สถานะ</span>
            <select v-model="form.status" class="select select-sm select-bordered w-full">
              <option value="active">ใช้งาน</option>
              <option value="spare">สำรอง</option>
              <option value="faulty">ชำรุด</option>
              <option value="planned">ตามแผน</option>
              <option value="removed">ถอดออกแล้ว</option>
            </select>
          </label>

          <label class="form-control">
            <span class="label-text text-xs opacity-70">ยี่ห้อ</span>
            <input v-model="form.brand" type="text" class="input input-sm input-bordered w-full" />
          </label>

          <label class="form-control">
            <span class="label-text text-xs opacity-70">รุ่น</span>
            <input v-model="form.model" type="text" class="input input-sm input-bordered w-full" />
          </label>

          <label v-if="form.kind !== 'battery'" class="form-control">
            <span class="label-text text-xs opacity-70">หมายเลขเครื่อง</span>
            <input v-model="form.serialNo" type="text" class="input input-sm input-bordered w-full" />
          </label>

          <label v-if="form.kind === 'equipment'" class="form-control">
            <span class="label-text text-xs opacity-70">IP จัดการ</span>
            <input
              v-model="form.mgmtIp" type="text" placeholder="10.1.2.3 หรือ 10.1.2.0/24"
              class="input input-sm input-bordered w-full font-mono"
            />
          </label>

          <template v-if="form.kind === 'battery'">
            <label class="form-control">
              <span class="label-text text-xs opacity-70">ความจุ (Ah)</span>
              <input
                v-model="form.capacityAh" type="number" step="0.01" min="0"
                class="input input-sm input-bordered w-full"
              />
            </label>
            <label class="form-control">
              <span class="label-text text-xs opacity-70">แรงดัน (V)</span>
              <input
                v-model="form.voltageV" type="number" step="0.01" min="0"
                class="input input-sm input-bordered w-full"
              />
            </label>
            <label class="form-control">
              <span class="label-text text-xs opacity-70">SOH (%)</span>
              <input
                v-model="form.healthPct" type="number" step="0.01" min="0"
                class="input input-sm input-bordered w-full"
              />
            </label>
            <label class="form-control">
              <span class="label-text text-xs opacity-70">จำนวนสตริง</span>
              <input
                v-model="form.stringCount" type="number" min="1" step="1"
                class="input input-sm input-bordered w-full"
              />
            </label>
          </template>

          <label v-if="form.kind !== 'cabinet'" class="form-control">
            <span class="label-text text-xs opacity-70">จำนวน</span>
            <input
              v-model="form.qty" type="number" min="1" step="1"
              class="input input-sm input-bordered w-full"
            />
          </label>

          <label v-if="form.kind === 'battery'" class="form-control">
            <span class="label-text text-xs opacity-70">วันติดตั้ง</span>
            <input
              v-model="form.installDate" type="date" class="input input-sm input-bordered w-full"
            />
          </label>
          <label v-if="form.kind === 'battery'" class="form-control">
            <span class="label-text text-xs opacity-70">วันหมดอายุ</span>
            <input
              v-model="form.expiryDate" type="date" class="input input-sm input-bordered w-full"
            />
          </label>

          <label v-if="form.kind !== 'battery'" class="form-control">
            <span class="label-text text-xs opacity-70">วันติดตั้ง</span>
            <input
              v-model="form.installedAt" type="date" class="input input-sm input-bordered w-full"
            />
          </label>
          <label v-if="form.kind === 'equipment'" class="form-control">
            <span class="label-text text-xs opacity-70">วันหมดประกัน</span>
            <input
              v-model="form.warrantyUntil" type="date" class="input input-sm input-bordered w-full"
            />
          </label>

          <label class="form-control sm:col-span-2">
            <span class="label-text text-xs opacity-70">หมายเหตุ</span>
            <textarea
              v-model="form.remark" rows="2" class="textarea textarea-sm textarea-bordered w-full"
            />
          </label>

          <div v-if="formError" role="alert" class="alert alert-error text-sm sm:col-span-2">
            <span>{{ formError }}</span>
          </div>

          <div class="modal-action sm:col-span-2">
            <button type="button" class="btn btn-ghost" :disabled="saving" @click="form = null">
              ยกเลิก
            </button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              <span v-if="saving" class="loading loading-spinner loading-xs" />
              บันทึก
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ═══ ยืนยันลบ ═══ -->
    <div v-if="pendingDelete" class="modal modal-open" @click.self="pendingDelete = null">
      <div class="modal-box">
        <h3 class="text-lg font-semibold">ลบ{{ pendingDelete.label }}ถาวร?</h3>

        <div v-if="pendingDelete.blocker" role="alert" class="alert alert-warning mt-4 text-sm">
          <span>{{ pendingDelete.blocker }}</span>
        </div>

        <template v-else>
          <div v-if="pendingDelete.losses.length" role="alert" class="alert alert-error mt-4 text-sm">
            <span>สิ่งที่จะหายไปด้วย: {{ pendingDelete.losses.join(' · ') }}</span>
          </div>
          <p class="mt-3 text-sm opacity-70">
            เป็นการลบถาวร ไม่ใช่การซ่อนแบบหน้าสถานี — กู้คืนไม่ได้
          </p>
        </template>

        <div class="modal-action">
          <button
            type="button" class="btn btn-ghost" :disabled="busy" @click="pendingDelete = null"
          >
            {{ pendingDelete.blocker ? 'ปิด' : 'ยกเลิก' }}
          </button>
          <button
            v-if="!pendingDelete.blocker" type="button" class="btn btn-error"
            :disabled="busy" @click="confirmDelete"
          >
            <span v-if="busy" class="loading loading-spinner loading-xs" />
            ลบถาวร
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

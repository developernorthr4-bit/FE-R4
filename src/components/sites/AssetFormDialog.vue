<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { errorMessage } from '@/lib/api'
import {
  meterLabel, nextCode,
  type BatteryRow, type CabinetRow, type EquipmentRow, type MeterRow, type SiteAssets,
} from '@/lib/assets'
import {
  createBattery, createCabinet, createEquipment, createMeter,
  updateBattery, updateCabinet, updateEquipment, updateMeter,
} from '@/services/sites.api'

/**
 * ฟอร์มเพิ่ม/แก้ไข ตู้ / มิเตอร์ / แบต / อุปกรณ์ ของ SiteAssetsList — modal เดียวใช้ทั้งสี่ชนิด
 *
 * หน้าแม่เปิดฟอร์มผ่าน ref (open* ใน defineExpose ท้ายสคริปต์) แล้วรอ @saved
 * เพื่อโหลดรายการใหม่ — ทุกการบันทึกที่นี่ยิง BE ทันที
 */
const props = defineProps<{
  siteId: string
  /** ชุดเดียวกับที่รายการโหลดมา — ใช้เดารหัสตู้/ช่องถัดไป และทำตัวเลือกตู้/มิเตอร์/ชนิด */
  data: SiteAssets | null
}>()
const emit = defineEmits<{ saved: [] }>()
const data = computed(() => props.data)

const cabinetOptions = computed(() => data.value?.cabinets ?? [])

/** ตัวเลือกของช่อง "จ่ายไฟจากมิเตอร์" ในฟอร์มตู้ */
const meterOptions = computed(() => data.value?.meters ?? [])

type FormKind = 'cabinet' | 'battery' | 'equipment' | 'meter'

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
  /** ตู้: id ของมิเตอร์ที่จ่ายไฟให้ตู้ใบนี้ (ไม่ใช่ id ของมิเตอร์ที่กำลังแก้) */
  meterId: string
  meterNo: string
  meterType: string
  electricPhase: string
  kwhSize: string
  /**
   * ช่องเดียวในฟอร์มนี้ที่ไม่ใช่สตริง — เป็นช่องติ๊ก ไม่ใช่ช่องกรอก
   * ส่งขึ้นไปเฉพาะตอนแก้มิเตอร์ที่มีอยู่แล้ว (ตอนเพิ่มใหม่ BE ล็อกให้เองอยู่แล้ว)
   */
  manualLock: boolean
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
    cabinetId: '', cabinetCode: '',
    meterId: '', meterNo: '', meterType: '', electricPhase: '', kwhSize: '', manualLock: false,
    bankCode: '', assetTypeId: '', name: '',
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
    meterId: row.meterId ?? '',
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

/*
 * มิเตอร์
 *
 * ⚠️ ไม่มีช่อง meter_key ในฟอร์ม และห้ามเพิ่ม — มันคือคีย์ที่ importer ใช้จับคู่
 * แถวเดิม ถ้าให้แก้ได้ import รอบหน้าจะหาแถวเดิมไม่เจอแล้วสร้างมิเตอร์ซ้ำขึ้นมา
 * โดยไม่มีตู้ผูกอยู่สักใบ (เหตุผลเดียวกับที่รหัสสถานีล็อกไว้ในหน้าแก้ไขสถานี)
 */
function openAddMeter() {
  formError.value = null
  form.value = blank('meter', 'เพิ่มมิเตอร์')
}

function openEditMeter(row: MeterRow) {
  const f = blank('meter', `แก้ไข${meterLabel(row)}`)
  Object.assign(f, {
    id: row.id,
    meterNo: row.meterNo ?? '',
    meterType: row.meterType ?? '',
    electricPhase: row.electricPhase ?? '',
    kwhSize: row.kwhSize ?? '',
    status: row.status,
    remark: row.remark ?? '',
    manualLock: row.manualLock,
  })
  formError.value = null
  form.value = f
}

/*
 * แก้ช่องไหนก็ตามของมิเตอร์ = ติ๊กล็อกให้เอง ไม่ต้องรอให้ผู้ใช้ไปติ๊ก
 *
 * เหตุผลเดียวกับหน้าแก้ไขสถานี — คนที่เข้ามาแก้ก็แก้เพราะใบตรวจ PM กรอกผิด
 * ถ้าไม่ล็อก import รอบหน้าจะเอาค่าผิดเดิมทับกลับโดยไม่มีใครรู้
 *
 * before === null คือเพิ่งเปิดฟอร์ม (หรือเพิ่งปิด) ไม่ใช่การแก้ ต้องไม่ติ๊กให้
 * ไม่งั้นแค่กดดูแล้วกดบันทึก แถวนั้นก็จะถูกล็อกทั้งที่ไม่มีใครแก้อะไรเลย
 */
watch(
  () => {
    const f = form.value
    return f && f.kind === 'meter'
      ? [f.meterNo, f.meterType, f.electricPhase, f.kwhSize, f.status, f.remark].join('\u0000')
      : null
  },
  (now, before) => {
    if (now !== null && before !== null && form.value) form.value.manualLock = true
  },
)

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
        cabinetCode: f.cabinetCode, meterId: f.meterId, assetTypeId: f.assetTypeId,
        brand: f.brand, model: f.model, serialNo: f.serialNo, installedAt: f.installedAt,
        status: f.status, remark: f.remark,
      }
      if (f.id) await updateCabinet(site, f.id, p)
      else await createCabinet(site, p)
    } else if (f.kind === 'meter') {
      const p = {
        meterNo: f.meterNo, meterType: f.meterType, electricPhase: f.electricPhase,
        kwhSize: f.kwhSize, status: f.status, remark: f.remark,
      }
      // manualLock ส่งเฉพาะตอนแก้ — ตอนเพิ่มใหม่ BE ล็อกให้เองอยู่แล้ว
      // และส่งทุกครั้งไม่ใช่เฉพาะตอน true เพราะการติ๊กออกคือคำสั่ง "ปลดล็อก"
      if (f.id) await updateMeter(site, f.id, { ...p, manualLock: f.manualLock })
      else await createMeter(site, p)
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
    emit('saved')
  } catch (err) {
    formError.value = errorMessage(err, 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

defineExpose({
  openAddCabinet, openEditCabinet, openAddMeter, openEditMeter,
  openAddBattery, openEditBattery, openAddEquipment, openEditEquipment,
})
</script>

<template>
  <div v-if="form" class="modal modal-open" @click.self="form = null">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-semibold">{{ form.title }}</h3>

      <form class="mt-4 grid gap-3 sm:grid-cols-2" @submit.prevent="submit">
        <!-- ตู้ปลายทาง: มีเฉพาะแบตกับอุปกรณ์ -->
        <label
          v-if="form.kind === 'battery' || form.kind === 'equipment'" class="form-control"
        >
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

        <label v-if="form.kind === 'cabinet'" class="form-control">
          <span class="label-text text-xs opacity-70">จ่ายไฟจากมิเตอร์</span>
          <select v-model="form.meterId" class="select select-sm select-bordered w-full">
            <option value="">ไม่ระบุ</option>
            <option v-for="m in meterOptions" :key="m.id" :value="m.id">
              {{ meterLabel(m) }}
            </option>
          </select>
        </label>

        <!--
          ช่องของมิเตอร์
          ไม่มี meter_key ให้กรอกโดยตั้งใจ — ดูเหตุผลที่ openAddMeter ในสคริปต์
        -->
        <template v-if="form.kind === 'meter'">
          <label class="form-control">
            <span class="label-text text-xs opacity-70">เลขมิเตอร์</span>
            <input
              v-model="form.meterNo" type="text" placeholder="เว้นว่างได้ถ้ายังไม่รู้เลข"
              class="input input-sm input-bordered w-full"
            />
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ชนิดมิเตอร์</span>
            <input
              v-model="form.meterType" type="text" placeholder="TOU / TOD / CT"
              class="input input-sm input-bordered w-full"
            />
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">เฟส</span>
            <input
              v-model="form.electricPhase" type="text" placeholder="1P / 3P"
              class="input input-sm input-bordered w-full"
            />
          </label>
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ขนาดมิเตอร์</span>
            <input
              v-model="form.kwhSize" type="text" placeholder="5(100) A"
              class="input input-sm input-bordered w-full"
            />
          </label>
        </template>

        <label v-if="form.kind === 'battery'" class="form-control">
          <span class="label-text text-xs opacity-70">รหัสก้อน</span>
          <input v-model="form.bankCode" type="text" class="input input-sm input-bordered w-full" />
        </label>

        <label v-if="form.kind === 'equipment'" class="form-control">
          <span class="label-text text-xs opacity-70">ชื่ออุปกรณ์</span>
          <input v-model="form.name" type="text" class="input input-sm input-bordered w-full" />
        </label>

        <label v-if="form.kind !== 'meter'" class="form-control">
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

        <label v-if="form.kind !== 'meter'" class="form-control">
          <span class="label-text text-xs opacity-70">ยี่ห้อ</span>
          <input v-model="form.brand" type="text" class="input input-sm input-bordered w-full" />
        </label>

        <label v-if="form.kind !== 'meter'" class="form-control">
          <span class="label-text text-xs opacity-70">รุ่น</span>
          <input v-model="form.model" type="text" class="input input-sm input-bordered w-full" />
        </label>

        <label
          v-if="form.kind === 'cabinet' || form.kind === 'equipment'" class="form-control"
        >
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

        <label
          v-if="form.kind === 'battery' || form.kind === 'equipment'" class="form-control"
        >
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

        <label
          v-if="form.kind === 'cabinet' || form.kind === 'equipment'" class="form-control"
        >
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

        <div v-if="form.kind === 'meter' && form.id" class="sm:col-span-2">
          <label class="label w-fit cursor-pointer justify-start gap-2">
            <input v-model="form.manualLock" type="checkbox" class="checkbox checkbox-sm" />
            <span class="label-text">ล็อกไว้ ไม่ให้ import ทับ</span>
          </label>
          <p class="text-xs opacity-60">
            ติ๊กให้เองทันทีที่แก้ช่องใดช่องหนึ่งข้างบน — ถ้าไม่ล็อก การ import ใบตรวจ PM
            รอบหน้าจะเอาค่าจากไฟล์ทับกลับ ติ๊กออกเมื่อแก้ไฟล์ต้นทางถูกแล้วและอยากให้ไฟล์เป็นตัวตั้ง
          </p>
        </div>

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
</template>

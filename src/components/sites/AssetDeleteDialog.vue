<script setup lang="ts">
import { ref } from 'vue'
import { errorMessage } from '@/lib/api'
import { meterLabel, type BatteryRow, type CabinetRow, type EquipmentRow, type MeterRow } from '@/lib/assets'
import { deleteBattery, deleteCabinet, deleteEquipment, deleteMeter } from '@/services/sites.api'

/**
 * กล่องยืนยันลบถาวรของ SiteAssetsList — หน้าแม่เปิดผ่าน ref (askDelete* ใน defineExpose)
 * ลบสำเร็จ = @deleted (หน้าแม่โหลดใหม่) · ไม่สำเร็จ = @failed พร้อมข้อความ (ขึ้นในแถบ error ของรายการ)
 */
const props = defineProps<{ siteId: string }>()
const emit = defineEmits<{ deleted: []; failed: [message: string] }>()

/** ชนิดเดียวกับ FormKind ใน AssetFormDialog */
type FormKind = 'cabinet' | 'battery' | 'equipment' | 'meter'

const busy = ref(false)

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

/**
 * มิเตอร์ที่ยังจ่ายไฟให้ตู้อยู่ ลบไม่ได้
 * FK เป็น set null จะยอมให้ลบเงียบ ๆ แล้วเหลือตู้ที่ไม่รู้ว่ากินไฟจากใบไหน
 * ซึ่งกู้กลับมาไม่ได้ — BE ปฏิเสธซ้ำอีกชั้น ตรงนี้แค่บอกก่อนกด
 */
function askDeleteMeter(row: MeterRow & { cabinetCodes: string[] }) {
  pendingDelete.value = {
    kind: 'meter',
    id: row.id,
    label: meterLabel(row),
    losses: [],
    blocker: row.cabinetCodes.length
      ? `มิเตอร์นี้ยังจ่ายไฟให้ตู้ ${row.cabinetCodes.join(', ')} อยู่ — `
        + 'ต้องย้ายตู้เหล่านั้นไปมิเตอร์อื่น หรือล้างช่องมิเตอร์ของตู้ก่อน'
      : null,
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
  try {
    if (p.kind === 'cabinet') await deleteCabinet(props.siteId, p.id)
    else if (p.kind === 'battery') await deleteBattery(props.siteId, p.id)
    else if (p.kind === 'meter') await deleteMeter(props.siteId, p.id)
    else await deleteEquipment(props.siteId, p.id)
    pendingDelete.value = null
    emit('deleted')
  } catch (err) {
    emit('failed', errorMessage(err, 'ลบไม่สำเร็จ'))
    pendingDelete.value = null
  } finally {
    busy.value = false
  }
}

defineExpose({ askDeleteCabinet, askDeleteBattery, askDeleteMeter, askDeleteEquipment })
</script>

<template>
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
</template>

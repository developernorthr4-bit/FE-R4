<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import MaintenanceInventory from '@/components/maintenance/MaintenanceInventory.vue'
import MaintenancePmResults from '@/components/maintenance/MaintenancePmResults.vue'
import { errorMessage } from '@/lib/api'
import {
  fiscalLabel, formatThaiDate, getInventory, getPmSummary, type Inventory, type PmSummary,
} from '@/services/maintenance.api'

/**
 * หน้างานบำรุงรักษาเชิงป้องกัน (PM)
 *
 * มีสองส่วนที่ตอบคนละคำถามและอยู่คนละแกนเวลา จึงต้องคั่นให้ชัดบนหน้าจอ
 *   ทะเบียนทรัพย์สิน  ตอนนี้เรามีอะไรอยู่บ้าง        → ไม่ขึ้นกับปีงบ
 *   ผลการตรวจ PM     ปีงบนั้นตรวจแล้วเจออะไร        → เปลี่ยนตามปีงบที่เลือก
 *
 * ถ้าไม่คั่น คนจะเข้าใจว่าเลือกปีงบย้อนหลังแล้วจำนวนแบตที่มีจะเปลี่ยนตามไปด้วย
 * ซึ่งไม่จริง — ทะเบียนไม่มีประวัติย้อนหลังให้ดูอยู่แล้ว
 *
 * ทุกคนที่ล็อกอินดูได้
 */

const inv = ref<Inventory | null>(null)
const invLoading = ref(true)
const invError = ref<string | null>(null)

const pm = ref<PmSummary | null>(null)
const pmLoading = ref(true)
const pmError = ref<string | null>(null)

async function loadInventory() {
  invLoading.value = true
  invError.value = null
  try {
    inv.value = await getInventory()
  } catch (err) {
    invError.value = errorMessage(err, 'โหลดทะเบียนทรัพย์สินไม่สำเร็จ')
  } finally {
    invLoading.value = false
  }
}

async function loadPm(fy?: string) {
  pmLoading.value = true
  pmError.value = null
  try {
    pm.value = await getPmSummary(fy)
  } catch (err) {
    pmError.value = errorMessage(err, 'โหลดสรุปงาน PM ไม่สำเร็จ')
  } finally {
    pmLoading.value = false
  }
}

// สองก้อนไม่เกี่ยวกัน ยิงขนานกันไปเลย ไม่ต้องรอกัน
onMounted(() => {
  void loadInventory()
  void loadPm()
})
</script>

<template>
  <AppLayout>
    <PageHeader
      title="งานบำรุงรักษาเชิงป้องกัน (PM)"
      description="ทะเบียนตู้และแบตเตอรี่ที่มีอยู่ กับผลการตรวจตามปีงบประมาณ"
    />

    <!--
      ══ ส่วนที่ 1 · ทะเบียนทรัพย์สิน ═══════════════════════════════════════
      สถานะปัจจุบัน ไม่ผูกกับปีงบ — ป้ายกำกับด้านขวาบอกไว้ชัดเพื่อไม่ให้สับสน
      กับตัวเลือกปีงบของส่วนที่ 2
    -->
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-lg font-semibold tracking-tight">ทะเบียนทรัพย์สิน</h2>
      <span class="badge badge-ghost badge-sm">สถานะปัจจุบัน · ไม่ขึ้นกับปีงบ</span>
    </div>

    <div v-if="invError" role="alert" class="alert alert-error mb-4 text-sm">
      <span>{{ invError }}</span>
    </div>

    <div v-if="invLoading" class="flex justify-center py-12">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <MaintenanceInventory v-else-if="inv" :inv="inv" />

    <!--
      ══ ส่วนที่ 2 · ผลการตรวจ PM ═══════════════════════════════════════════
      ผูกกับปีงบประมาณ ต่างจากส่วนบนที่เป็นสถานะปัจจุบัน เส้นคั่นและป้ายกำกับ
      ช่วงวันที่จึงต้องอยู่ตรงนี้ ไม่ใช่ที่หัวหน้า
    -->
    <div class="divider mb-4 mt-10" />

    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">ผลการตรวจ PM</h2>
        <p v-if="pm" class="mt-1 text-sm opacity-70">
          ปีงบ {{ fiscalLabel(pm.fiscalYear) }} ·
          {{ formatThaiDate(pm.window.start) }} – {{ formatThaiDate(pm.window.end) }}
        </p>
      </div>
      <label v-if="pm" class="form-control">
        <span class="label-text text-xs opacity-70">ปีงบประมาณ</span>
        <select
          class="select select-sm select-bordered" :value="pm.fiscalYear" :disabled="pmLoading"
          @change="loadPm(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="f in pm.fiscalYears" :key="f" :value="f">{{ fiscalLabel(f) }}</option>
        </select>
      </label>
    </div>

    <div v-if="pmError" role="alert" class="alert alert-error mb-4 text-sm">
      <span>{{ pmError }}</span>
    </div>

    <div v-if="pmLoading" class="flex justify-center py-12">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <MaintenancePmResults v-else-if="pm" :pm="pm" />
  </AppLayout>
</template>

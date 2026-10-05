<script setup lang="ts">
import { assetStatusLabel, type BatteryRow, type EquipmentRow } from '../../lib/assets'
import BatteryCell from './BatteryCell.vue'

/**
 * ตู้หนึ่งใบแบบเรียบ — หัวตู้ / ช่อง rack อุปกรณ์ / ชั้นแบต / ช่องระบายอากาศ
 *
 * ช่องอุปกรณ์ซ่อนเมื่อว่าง: ตอนนี้ site_equipments ยังไม่มีข้อมูลเลยสักแถว (วัด 2026-10-05)
 * ถ้าวันหลังนำเข้า ช่องจะโผล่เองโดยไม่ต้องแก้ไฟล์นี้
 */
defineProps<{
  title: string
  /** null = กล่อง "ไม่ระบุตู้" ไม่ใช่ตู้จริง วาดเส้นประ */
  status: string | null
  meterTag: string | null
  typeName: string | null
  equipments: EquipmentRow[]
  batteries: BatteryRow[]
  selectedId: string | null
}>()

defineEmits<{ select: [battery: BatteryRow] }>()
</script>

<template>
  <div class="flex flex-col items-center">
    <!-- สายไฟจากบัสด้านบนลงมาที่ตู้ -->
    <div class="h-4 w-0.5" :class="meterTag ? 'bg-warning' : 'bg-base-300'" aria-hidden="true" />

    <div
      class="relative w-44 rounded-xl border-2 bg-base-100 shadow-sm"
      :class="[
        status === null ? 'border-dashed border-base-300' : 'border-base-content/25',
        { 'opacity-60': status === 'removed' },
      ]"
    >
      <!-- หัวตู้ -->
      <div class="flex items-center justify-between gap-1 rounded-t-[10px] bg-base-200 px-2.5 py-1.5">
        <span class="truncate text-sm font-semibold">{{ title }}</span>
        <span
          v-if="status && status !== 'active'"
          class="badge badge-xs shrink-0"
          :class="status === 'faulty' ? 'badge-error' : 'badge-ghost'"
        >{{ assetStatusLabel(status) }}</span>
      </div>
      <div class="flex items-center gap-1 px-2.5 pt-1 text-[11px] text-base-content/60">
        <span v-if="meterTag" class="text-warning">⚡ {{ meterTag }}</span>
        <span v-else-if="status !== null">ไม่ผูกมิเตอร์</span>
        <span v-if="typeName" class="truncate">· {{ typeName }}</span>
      </div>

      <!-- มือจับประตู -->
      <div class="absolute right-1 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-base-content/20" aria-hidden="true" />

      <!-- rack อุปกรณ์ -->
      <div v-if="equipments.length" class="mx-2.5 mt-2 space-y-1">
        <div
          v-for="e in equipments" :key="e.id"
          class="flex items-center justify-between rounded border border-base-300 bg-base-200/60 px-1.5 py-0.5 text-[11px]"
        >
          <span class="truncate">{{ e.typeName ?? e.name ?? 'อุปกรณ์' }}</span>
          <span v-if="e.qty > 1" class="shrink-0 tabular-nums opacity-70">×{{ e.qty }}</span>
        </div>
      </div>

      <!-- ชั้นแบต -->
      <div class="mx-2.5 mb-1 mt-2 min-h-16 rounded-lg border border-base-300 bg-base-200/40 p-1">
        <div v-if="batteries.length" class="flex flex-wrap justify-center gap-0.5">
          <BatteryCell
            v-for="b in batteries" :key="b.id"
            :battery="b" :selected="selectedId === b.id"
            @select="$emit('select', b)"
          />
        </div>
        <p v-else class="py-4 text-center text-xs text-base-content/50">ไม่มีแบต</p>
      </div>

      <!-- ช่องระบายอากาศ -->
      <div class="mx-auto mb-2 flex w-16 flex-col gap-0.5" aria-hidden="true">
        <span v-for="i in 3" :key="i" class="h-0.5 rounded bg-base-content/15" />
      </div>
    </div>
  </div>
</template>

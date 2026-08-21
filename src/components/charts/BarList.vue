<script setup lang="ts">
import { computed } from 'vue'
import type { Breakdown } from '../../services/reports.api'
import { formatMinutes } from '../../services/reports.api'

/**
 * แท่งนอนเทียบขนาด
 *
 * ใช้สีเดียวทุกแท่งโดยตั้งใจ — ความยาวแท่งบอกขนาดอยู่แล้ว การไล่เฉดตามค่า
 * เป็นการเข้ารหัสข้อมูลเดิมซ้ำสองครั้ง แล้วเผาช่องทางสีทิ้งไปเปล่า ๆ
 * (จังหวัดกับสาเหตุไม่มีลำดับตามธรรมชาติ จึงไม่ใช่เคสของ ordinal ramp ด้วย)
 *
 * ไม่ใช้กราฟวงกลม: ค่าที่ใกล้กันแยกด้วยมุมไม่ออก แท่งนอนอ่านง่ายกว่าเสมอ
 */
const props = withDefaults(defineProps<{
  items: Breakdown[]
  /** จำกัดจำนวนแถว ที่เหลือยุบเป็น "อื่น ๆ" — ไม่ใส่ = แสดงทั้งหมด */
  limit?: number
  /** true = วัดด้วยเวลาขัดข้อง แทนจำนวนเหตุการณ์ */
  byDuration?: boolean
  emptyText?: string
}>(), { emptyText: 'ไม่มีข้อมูลในสัปดาห์นี้' })

const valueOf = (b: Breakdown) => (props.byDuration ? b.durationMin : b.count)

const rows = computed(() => {
  const sorted = [...props.items].sort((a, b) => valueOf(b) - valueOf(a))
  if (!props.limit || sorted.length <= props.limit) return sorted

  // ยุบหางเป็น "อื่น ๆ" แทนที่จะตัดทิ้งเงียบ ๆ — ผลรวมต้องยังตรงกับ KPI ด้านบน
  const head = sorted.slice(0, props.limit)
  const tail = sorted.slice(props.limit)
  return [...head, {
    id: null,
    name: `อื่น ๆ (${tail.length} รายการ)`,
    count: tail.reduce((s, b) => s + b.count, 0),
    durationMin: tail.reduce((s, b) => s + b.durationMin, 0),
  }]
})

const max = computed(() => Math.max(...rows.value.map(valueOf), 1))

function display(b: Breakdown): string {
  return props.byDuration ? formatMinutes(b.durationMin) : String(b.count)
}
</script>

<template>
  <p v-if="!rows.length" class="py-6 text-center text-sm opacity-60">{{ emptyText }}</p>

  <ul v-else class="flex flex-col gap-2.5">
    <li v-for="b in rows" :key="`${b.id}-${b.name}`" class="grid grid-cols-[8rem_1fr_auto] items-center gap-3">
      <span class="truncate text-sm" :title="b.name">{{ b.name }}</span>

      <!-- ราง 1 ชั้น ไม่มีเส้นขอบ ให้แท่งเป็นสิ่งเดียวที่มีน้ำหนักหมึก -->
      <span class="block h-3 rounded-sm bg-base-200">
        <span
          class="block h-3 rounded-r-[4px] bg-primary"
          :style="{ width: `${Math.max((valueOf(b) / max) * 100, valueOf(b) > 0 ? 2 : 0)}%` }"
        />
      </span>

      <!-- ค่าอยู่ที่ปลายแท่งเสมอ ไม่ต้องมีแกน x -->
      <span class="text-right text-sm tabular-nums opacity-80">{{ display(b) }}</span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * แถบความคืบหน้าแบบ "ทำแล้ว / ทั้งหมด" เรียงจากค้างมากสุด
 *
 * ทำไมใช้ BarList เดิมไม่ได้ — BarList เทียบความยาวกับแท่งที่ยาวที่สุดในชุด
 * เชียงใหม่ที่มี 2,304 ตู้จะเต็มแถบเสมอไม่ว่าจะตรวจไปกี่ตู้ ส่วนความคืบหน้า
 * ต้องเทียบกับตัวหารของตัวเอง (180 จาก 2,304 = 8%) คนละความหมายกันคนละแกน
 *
 * เรียงตามจำนวนที่ "ค้าง" ไม่ใช่เปอร์เซ็นต์ เพราะจังหวัดเล็กที่ตรวจ 0 จาก 12 ตู้
 * ได้ 0% เหมือนกัน แต่ไม่ใช่สิ่งที่ต้องไปตามก่อนจังหวัดที่ค้าง 2,000 ตู้
 */
const props = withDefaults(defineProps<{
  items: { id: number | string; name: string; done: number; total: number }[]
  emptyText?: string
}>(), { emptyText: 'ไม่มีข้อมูล' })

const rows = computed(() =>
  [...props.items]
    .map((x) => ({
      ...x,
      remaining: Math.max(0, x.total - x.done),
      pct: x.total > 0 ? Math.round((x.done / x.total) * 100) : 0,
    }))
    .sort((a, b) => b.remaining - a.remaining))
</script>

<template>
  <p v-if="!rows.length" class="py-6 text-center text-sm opacity-60">{{ emptyText }}</p>

  <ul v-else class="flex flex-col gap-2.5">
    <li
      v-for="r in rows" :key="r.id"
      class="grid grid-cols-[7rem_1fr_auto] items-center gap-3"
    >
      <span class="truncate text-sm" :title="r.name">{{ r.name }}</span>

      <span class="block h-3 rounded-sm bg-base-200">
        <!--
          ความกว้าง 0% ต้องเป็น 0 จริง ๆ ไม่ใช่ขั้นต่ำ 2% เหมือน BarList
          เพราะที่นี่ "ยังไม่ได้เริ่ม" กับ "เริ่มไปนิดเดียว" เป็นสถานะคนละอย่าง
          ที่หัวหน้าทีมต้องแยกออกจากกันได้
        -->
        <span class="block h-3 rounded-r-[4px] bg-primary" :style="{ width: `${r.pct}%` }" />
      </span>

      <span class="text-right text-sm tabular-nums opacity-80">
        {{ r.done.toLocaleString() }}<span class="opacity-50">/{{ r.total.toLocaleString() }}</span>
        <span class="ml-1.5 inline-block w-9 text-right opacity-60">{{ r.pct }}%</span>
      </span>
    </li>
  </ul>
</template>

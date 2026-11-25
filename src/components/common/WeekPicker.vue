<script setup lang="ts">
import { computed } from 'vue'
import { addDays, formatWeekRange, isoWeekOf, weekStartOf } from '@/lib/iso-week'

/**
 * เลือกสัปดาห์ จันทร์–อาทิตย์ (ISO) — รับ/คืนเป็นวันจันทร์ของสัปดาห์
 *
 * ใช้ <input type="week"> ของเบราว์เซอร์ซึ่งใช้รูปแบบ "2026-W34" อยู่แล้ว
 * มีปุ่มถอย/เดินหน้าคู่ไว้ด้วย เพราะการใช้งานจริงคือ "ดูสัปดาห์ที่แล้ว" มากกว่า
 * การเลือกสัปดาห์เจาะจง และ Safari/Firefox ยังไม่รองรับ input type=week
 */
const props = defineProps<{ weekStart: string; maxWeekStart: string }>()
const emit = defineEmits<{ change: [weekStart: string] }>()

const label = (start: string) => {
  const { year, week } = isoWeekOf(start)
  return `${year}-W${String(week).padStart(2, '0')}`
}
const value = computed(() => label(props.weekStart))
const maxValue = computed(() => label(props.maxWeekStart))
/** อยู่ที่สัปดาห์ล่าสุดแล้ว ห้ามเดินหน้าต่อ — ยังไม่มีข้อมูลของอนาคต */
const atLatest = computed(() => props.weekStart >= props.maxWeekStart)

function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  const m = /^(\d{4})-W(\d{1,2})$/.exec(el.value)
  const start = m ? weekStartOf(Number(m[1]), Number(m[2])) : null
  if (!start || start > props.maxWeekStart) { el.value = value.value; return }
  emit('change', start)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <div class="join">
      <button
        type="button" class="btn btn-sm join-item" title="สัปดาห์ก่อนหน้า" aria-label="สัปดาห์ก่อนหน้า"
        @click="emit('change', addDays(weekStart, -7))"
      >
        ‹
      </button>
      <input
        type="week"
        :value="value"
        :max="maxValue"
        aria-label="เลือกสัปดาห์"
        class="input input-sm input-bordered join-item w-40 text-center"
        @change="onInput"
      />
      <button
        type="button" class="btn btn-sm join-item" title="สัปดาห์ถัดไป" aria-label="สัปดาห์ถัดไป"
        :disabled="atLatest"
        @click="emit('change', addDays(weekStart, 7))"
      >
        ›
      </button>
    </div>
    <button v-if="!atLatest" type="button" class="btn btn-ghost btn-sm" @click="emit('change', maxWeekStart)">สัปดาห์นี้</button>
    <span class="text-sm opacity-70">{{ formatWeekRange(weekStart) }}</span>
  </div>
</template>

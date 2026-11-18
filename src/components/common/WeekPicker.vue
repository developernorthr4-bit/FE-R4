<script setup lang="ts">
import { computed } from 'vue'

/**
 * เลือกสัปดาห์ ISO
 *
 * ใช้ <input type="week"> ของเบราว์เซอร์ซึ่งรับ/คืนค่ารูปแบบ "2026-W34" อยู่แล้ว
 * ตรงกับ iso_year/iso_week ที่ BE ใช้พอดี ไม่ต้องแปลงปฏิทินเอง
 *
 * มีปุ่มถอย/เดินหน้าคู่ไว้ด้วย เพราะการใช้งานจริงคือ "ดูสัปดาห์ที่แล้ว" มากกว่า
 * การเลือกสัปดาห์เจาะจง และ Safari ยังไม่รองรับ input type=week
 */
const props = defineProps<{ year: number; week: number; maxYear: number; maxWeek: number }>()
const emit = defineEmits<{ change: [year: number, week: number] }>()

const value = computed(() => `${props.year}-W${String(props.week).padStart(2, '0')}`)
const maxValue = computed(() => `${props.maxYear}-W${String(props.maxWeek).padStart(2, '0')}`)

/** อยู่ที่สัปดาห์ล่าสุดแล้ว ห้ามเดินหน้าต่อ — ยังไม่มีข้อมูลของอนาคต */
const atLatest = computed(
  () => props.year > props.maxYear || (props.year === props.maxYear && props.week >= props.maxWeek),
)

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value
  const m = /^(\d{4})-W(\d{1,2})$/.exec(v)
  if (!m) return
  emit('change', Number(m[1]), Number(m[2]))
}

/**
 * ถอย/เดินหน้าข้ามปีให้ถูก
 *
 * ปี ISO มี 52 หรือ 53 สัปดาห์ ไม่คงที่ — ดูจากสัปดาห์ของวันที่ 28 ธ.ค.
 * ซึ่งอยู่ในสัปดาห์สุดท้ายของปี ISO นั้นเสมอตามนิยาม
 */
function weeksInYear(year: number): number {
  const d = new Date(Date.UTC(year, 11, 28))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + 1) / 7)
}

function shift(delta: number) {
  let year = props.year
  let week = props.week + delta
  if (week < 1) { year -= 1; week = weeksInYear(year) }
  else if (week > weeksInYear(year)) { year += 1; week = 1 }
  emit('change', year, week)
}
</script>

<template>
  <div class="join">
    <button
      type="button" class="btn btn-sm join-item" title="สัปดาห์ก่อนหน้า"
      @click="shift(-1)"
    >
      ‹
    </button>
    <input
      type="week"
      :value="value"
      :max="maxValue"
      class="input input-sm input-bordered join-item w-40 text-center"
      @change="onInput"
    />
    <button
      type="button" class="btn btn-sm join-item" title="สัปดาห์ถัดไป"
      :disabled="atLatest"
      @click="shift(1)"
    >
      ›
    </button>
  </div>
</template>

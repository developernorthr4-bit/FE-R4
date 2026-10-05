<script setup lang="ts">
import { computed } from 'vue'
import { sohTone, type BatteryRow } from '../../lib/assets'

/**
 * แบตหนึ่งก้อนในภาพตู้ — ระดับที่เติมในก้อน = SOH, สี = กลุ่มจาก sohTone()
 * เป็นปุ่มเพราะกดแล้วหน้าที่ครอบอยู่เปิดรายละเอียด (แตะได้บนมือถือ ไม่พึ่ง hover)
 */
const props = defineProps<{ battery: BatteryRow; selected: boolean }>()
defineEmits<{ select: [] }>()

const soh = computed(() => sohTone(props.battery))

const toneClass = computed(() => ({
  good: 'text-success',
  warn: 'text-warning',
  bad: 'text-error',
  zero: 'text-error',
  unknown: 'text-base-content/40',
}[soh.value.tone]))

/** ความสูงที่เติม (เต็ม 31 หน่วยใน viewBox) — ค่าเกิน 100 มีจริงในฐาน ตัดไว้ที่เต็มก้อน */
const fillH = computed(() => {
  const h = props.battery.healthPct
  if (h === null || h <= 0) return 0
  return (Math.min(h, 100) / 100) * 31
})

const label = computed(() => {
  const h = props.battery.healthPct
  if (soh.value.tone === 'zero') return '0%'
  if (h === null) return '?'
  return `${Math.round(h)}%`
})

const faulty = computed(() => props.battery.status === 'faulty')
/** สำรอง/ตามแผน = ยังไม่ได้จ่ายไฟให้สถานีจริง วาดจาง */
const dim = computed(() => props.battery.status === 'spare' || props.battery.status === 'planned')
</script>

<template>
  <button
    type="button"
    class="group flex w-12 flex-col items-center gap-0.5 rounded-lg p-1 transition hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-primary"
    :class="[toneClass, { 'bg-base-200 ring-2 ring-primary': selected, 'opacity-50': dim }]"
    :aria-label="`แบตช่อง ${battery.bankCode ?? '—'} ${soh.reason}`"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <svg viewBox="0 0 24 40" class="h-10 w-6" aria-hidden="true">
      <rect x="8" y="0.5" width="8" height="4" rx="1" fill="currentColor" />
      <rect
        x="2" y="4.5" width="20" height="34" rx="3"
        fill="none" stroke="currentColor" stroke-width="2"
        :stroke-dasharray="soh.tone === 'zero' || dim ? '3 2' : undefined"
      />
      <rect
        v-if="fillH > 0"
        x="5" :y="36 - fillH" width="14" :height="fillH" rx="1.5"
        fill="currentColor" opacity="0.85"
      />
      <text
        v-if="soh.tone === 'unknown'"
        x="12" y="27" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor"
      >?</text>
      <text
        v-else-if="soh.tone === 'zero'"
        x="12" y="27" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor"
      >!</text>
      <g v-if="faulty" stroke="var(--color-error)" stroke-width="2.5" stroke-linecap="round">
        <line x1="4" y1="8" x2="20" y2="35" />
        <line x1="20" y1="8" x2="4" y2="35" />
      </g>
    </svg>
    <span class="text-[11px] font-semibold leading-none tabular-nums">{{ label }}</span>
    <span
      v-if="soh.tone === 'zero'"
      class="text-[9px] leading-none text-error"
    >ตรวจซ้ำ</span>
    <span v-if="battery.qty > 1" class="text-[10px] leading-none text-base-content/60">×{{ battery.qty }}</span>
  </button>
</template>

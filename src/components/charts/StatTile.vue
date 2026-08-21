<script setup lang="ts">
import { computed } from 'vue'

/**
 * ตัวเลขเดี่ยว + การเปลี่ยนแปลงเทียบสัปดาห์ก่อน
 *
 * ตัวเลขเดี่ยวควรเป็น "ตัวเลข" ไม่ใช่กราฟแท่งที่มีแท่งเดียว — ผู้อ่านต้องอ่านค่า
 * ไม่ได้ต้องเทียบขนาด
 *
 * ทิศทางที่ดีของแต่ละตัวไม่เหมือนกัน: เหตุการณ์เพิ่ม = แย่ลง แต่ "แก้ไขแล้ว" เพิ่ม = ดีขึ้น
 * จึงต้องบอก goodWhen มาด้วย ไม่งั้นลูกศรเขียว/แดงจะสื่อผิดความหมาย
 */
const props = withDefaults(defineProps<{
  label: string
  value: string | number
  /** ผลต่างจากสัปดาห์ก่อน — ไม่ส่งมา = ไม่แสดงแถบเปรียบเทียบ */
  diff?: number
  /** เปอร์เซ็นต์ — null แปลว่าสัปดาห์ก่อนเป็นศูนย์ เทียบเป็นสัดส่วนไม่ได้ */
  pct?: number | null
  goodWhen?: 'down' | 'up' | 'neutral'
  hint?: string
}>(), { goodWhen: 'down', pct: null })

const tone = computed(() => {
  if (props.diff === undefined || props.diff === 0 || props.goodWhen === 'neutral') return 'opacity-60'
  const improved = props.goodWhen === 'down' ? props.diff < 0 : props.diff > 0
  return improved ? 'text-success' : 'text-error'
})

/** null = สัปดาห์ก่อนเป็นศูนย์ เทียบเป็นสัดส่วนไม่ได้ ต้องบอกตรง ๆ ไม่ใช่โชว์ตัวเลขหลอกตา */
const pctText = computed(() => {
  if (props.pct === null || props.pct === undefined) return '(สัปดาห์ก่อนไม่มีข้อมูล)'
  return `(${props.pct > 0 ? '+' : ''}${props.pct}%)`
})

const arrow = computed(() => {
  if (props.diff === undefined || props.diff === 0) return '='
  return props.diff > 0 ? '▲' : '▼'
})
</script>

<template>
  <div class="card border border-base-300 bg-base-100">
    <div class="card-body gap-1 p-4">
      <span class="text-xs opacity-70">{{ label }}</span>
      <span class="text-3xl font-semibold tabular-nums">{{ value }}</span>

      <span v-if="diff !== undefined" class="text-xs" :class="tone">
        <!-- ลูกศรมาคู่กับตัวเลขเสมอ ไม่ให้สีเป็นตัวสื่อความหมายเพียงอย่างเดียว -->
        {{ arrow }}
        {{ diff === 0 ? 'เท่าเดิม' : `${diff > 0 ? '+' : ''}${diff}` }}
        <template v-if="diff !== 0">{{ pctText }}</template>
        <span class="opacity-70">จากสัปดาห์ก่อน</span>
      </span>

      <span v-else-if="hint" class="text-xs opacity-60">{{ hint }}</span>
    </div>
  </div>
</template>

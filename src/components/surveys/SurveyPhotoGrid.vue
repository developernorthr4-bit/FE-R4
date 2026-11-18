<script setup lang="ts">
import type { SurveyPhoto } from '@/services/surveys.api'

/**
 * รูปย่อ + ปุ่ม "+ รูป" ของงานสำรวจ — ใช้ทั้งรูปของจุดและรูปของงาน (เดิมเขียนซ้ำสองชุดใน SurveyFormView)
 *
 * แสดงผลอย่างเดียว: การอัปโหลด/ลบอยู่ที่หน้าแม่ เพราะต้องแก้ detail และตัวนับ "กำลังอัปโหลด"
 */
defineProps<{
  photos: SurveyPhoto[]
  /** เงื่อนไขของแต่ละที่ — จุดหนึ่งมีได้ไม่เกิน 10 รูป ส่วนรูปของงานไม่จำกัดที่ FE */
  canAdd: boolean
}>()
const emit = defineEmits<{ open: [SurveyPhoto]; files: [Event] }>()
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button v-for="ph in photos" :key="ph.id" type="button" class="relative" @click="emit('open', ph)">
      <img v-if="ph.url" :src="ph.url" class="size-20 rounded object-cover" loading="lazy" alt="">
      <span v-else class="flex size-20 items-center justify-center rounded bg-base-200 text-xs opacity-60">ไม่มีที่เก็บ</span>
    </button>
    <label v-if="canAdd" class="flex size-20 cursor-pointer items-center justify-center rounded border border-dashed border-base-300 text-xs opacity-70 hover:bg-base-200">
      + รูป
      <input type="file" accept="image/*" capture="environment" multiple class="hidden" @change="emit('files', $event)">
    </label>
  </div>
</template>

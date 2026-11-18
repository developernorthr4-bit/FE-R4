<script setup lang="ts">
import { formatDateTime } from '@/lib/format'
import type { SurveyPhoto } from '@/services/surveys.api'

/** ดูรูปใหญ่ของงานสำรวจ — กดพื้นหลังหรือ "ปิด" เพื่อปิด · การลบจริงอยู่ที่หน้าแม่ (@delete) */
defineProps<{ photo: SurveyPhoto; canDelete: boolean }>()
const emit = defineEmits<{ close: []; delete: [] }>()
</script>

<template>
  <div class="modal modal-open" @click.self="emit('close')">
    <div class="modal-box max-w-4xl p-2">
      <img v-if="photo.url" :src="photo.url" class="max-h-[80vh] w-full rounded object-contain" alt="">
      <div class="mt-2 flex items-center gap-2 px-2 pb-1 text-xs opacity-70">
        <span v-if="photo.takenAt">ถ่าย {{ formatDateTime(photo.takenAt) }}</span>
        <span>{{ (photo.sizeBytes / 1024).toFixed(0) }} KB<template v-if="photo.width"> · {{ photo.width }}×{{ photo.height }}</template></span>
        <button v-if="canDelete" type="button" class="btn btn-ghost btn-xs ml-auto text-error" @click="emit('delete')">ลบรูป</button>
        <button type="button" class="btn btn-ghost btn-xs" @click="emit('close')">ปิด</button>
      </div>
    </div>
  </div>
</template>

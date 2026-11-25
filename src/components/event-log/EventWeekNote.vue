<script setup lang="ts">
import axios from 'axios'
import { ref, watch } from 'vue'
import { errorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { saveEventWeekNote, type EventWeekNote } from '@/services/event-log.api'

/** หมายเหตุทั้งภาคของสัปดาห์ (แถวบนสุดของบางแท็บในชีตเดิม) — แก้ได้เฉพาะคนที่เขียนได้ทุกจังหวัด */
const props = defineProps<{ weekStart: string; note: EventWeekNote | null; canWrite: boolean }>()
const emit = defineEmits<{ saved: [note: EventWeekNote | null] }>()

const editing = ref(false)
const text = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

watch(() => props.weekStart, () => { editing.value = false; error.value = null })

function edit() {
  text.value = props.note?.note ?? ''
  error.value = null
  editing.value = true
}

async function save() {
  saving.value = true
  error.value = null
  try {
    emit('saved', await saveEventWeekNote(props.weekStart, text.value, props.note?.rev ?? null))
    editing.value = false
  } catch (err) {
    error.value = errorMessage(err, 'บันทึกหมายเหตุไม่สำเร็จ')
    // ชนกับคนอื่น: รับข้อความล่าสุดมาแสดงข้างบน ของที่พิมพ์ยังอยู่ในช่อง กดบันทึกซ้ำ = เขียนทับ
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      emit('saved', (err.response.data as { weekNote?: EventWeekNote | null }).weekNote ?? null)
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="note || canWrite" class="mb-3 rounded-lg border border-base-300 bg-base-100 p-3 text-sm">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="font-medium">หมายเหตุทั้งภาค</span>
      <button v-if="canWrite && !editing" type="button" class="btn btn-ghost btn-xs" @click="edit">
        {{ note ? 'แก้ไข' : 'เพิ่มหมายเหตุ' }}
      </button>
    </div>
    <p v-if="note" class="mt-1 whitespace-pre-line" :title="`${note.updatedBy ?? 'นำเข้าจากไฟล์'} · ${formatDateTime(note.updatedAt)}`">{{ note.note }}</p>
    <div v-if="editing" class="mt-2">
      <textarea v-model="text" rows="3" maxlength="2000" class="textarea textarea-bordered w-full" aria-label="หมายเหตุทั้งภาค" />
      <div v-if="error" role="alert" class="mt-1 text-sm text-error">{{ error }}</div>
      <div class="mt-2 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="editing = false">ยกเลิก</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="save">
          <span v-if="saving" class="loading loading-spinner loading-xs" /> บันทึก
        </button>
      </div>
    </div>
  </div>
</template>

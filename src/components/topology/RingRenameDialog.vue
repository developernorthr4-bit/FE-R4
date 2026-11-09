<script setup lang="ts">
import { computed, ref } from 'vue'
import { errorMessage } from '../../lib/api'
import { renameRing } from '../../services/rings.api'

/**
 * เปลี่ยนชื่อวง (dev/admin) — วงยังเป็นแถวเดิม สมาชิก/เส้น/ประวัติตามไปครบ
 * กติกาเดียวกับ BE: ตัวพิมพ์ใหญ่ ห้ามซ้ำ ใช้ได้ A–Z 0–9 ช่องว่าง _ - . ( ) /
 */
const props = defineProps<{ ringId: string; ringCode: string }>()
const emit = defineEmits<{ close: []; renamed: [ringCode: string] }>()

const RING_CODE_RE = /^[A-Z0-9][A-Z0-9 _\-.()/]{1,63}$/

const code = ref(props.ringCode)
const reason = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

const cleaned = computed(() => code.value.trim().replace(/\s+/g, ' ').toUpperCase())
const codeError = computed(() => {
  if (!cleaned.value) return null
  if (cleaned.value === props.ringCode) return 'ชื่อใหม่เหมือนชื่อเดิม'
  return RING_CODE_RE.test(cleaned.value)
    ? null
    : 'ยาว 2–64 ตัว ใช้ได้ A–Z 0–9 ช่องว่าง และ _ - . ( ) / ขึ้นต้นด้วยตัวอักษรหรือตัวเลข'
})
const canSave = computed(() => !!cleaned.value && !codeError.value && reason.value.trim().length >= 3 && !saving.value)

async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = null
  try {
    const res = await renameRing(props.ringId, cleaned.value, reason.value.trim())
    emit('renamed', res.ringCode)
  } catch (err) {
    error.value = errorMessage(err, 'เปลี่ยนชื่อวงไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="modal modal-open" @click.self="!saving && emit('close')">
    <div class="modal-box max-w-lg">
      <h3 class="text-lg font-semibold">เปลี่ยนชื่อวง {{ ringCode }}</h3>
      <p class="mt-1 text-xs opacity-60">
        สมาชิก เส้นเชื่อมต่อ และประวัติยังอยู่กับวงนี้ครบ การนำเข้า SVG รอบหน้าจับคู่วงจากชุดอุปกรณ์
        ไม่ใช่จากชื่อ ชื่อที่ตั้งไว้จึงไม่หาย
      </p>

      <label class="form-control mt-4">
        <span class="label-text text-xs opacity-70">ชื่อใหม่</span>
        <input
          v-model="code" type="text" maxlength="64" autofocus
          class="input input-sm input-bordered font-mono uppercase"
          :class="{ 'input-error': codeError }"
          @keydown.enter="save"
        />
        <span v-if="codeError" class="mt-1 text-xs text-error">{{ codeError }}</span>
        <span v-else-if="cleaned && cleaned !== code" class="mt-1 text-xs opacity-60">จะบันทึกเป็น {{ cleaned }}</span>
      </label>

      <label class="form-control mt-3">
        <span class="label-text text-xs opacity-70">เหตุผล (บังคับ)</span>
        <textarea v-model="reason" rows="2" maxlength="1000" class="textarea textarea-bordered text-sm" />
      </label>

      <div v-if="error" role="alert" class="alert alert-error mt-3 text-sm">{{ error }}</div>

      <div class="modal-action">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="emit('close')">ยกเลิก</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="!canSave" @click="save">
          <span v-if="saving" class="loading loading-spinner loading-xs" />
          บันทึก
        </button>
      </div>
    </div>
  </div>
</template>

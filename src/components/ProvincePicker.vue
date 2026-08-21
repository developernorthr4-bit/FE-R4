<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { errorMessage } from '../lib/api'
import { loadProvinces, type Province } from '../services/provinces.api'

/**
 * เลือกจังหวัดหลายอัน
 *
 * ใช้ปุ่ม toggle แทน <select multiple> เพราะบนมือถือ select multiple แทบกดไม่ได้
 * และผู้ใช้จริงของระบบนี้กรอกจากหน้างานเป็นหลัก
 */
const props = withDefaults(defineProps<{
  disabled?: boolean
  /** โชว์ตัวเลือก "ทุกจังหวัด" — หน้า register ไม่ควรมี */
  allowAll?: boolean
}>(), { allowAll: false })

const selected = defineModel<number[]>('selected', { required: true })
/** true = ทุกจังหวัด (province_scope = null) */
const all = defineModel<boolean>('all', { default: false })

const provinces = ref<Province[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    provinces.value = await loadProvinces()
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายชื่อจังหวัดไม่สำเร็จ')
  } finally {
    loading.value = false
  }
})

function toggle(id: number) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((v) => v !== id)
    : [...selected.value, id]
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <p v-if="loading" class="flex items-center gap-2 text-sm opacity-70">
      <span class="loading loading-spinner loading-xs" /> กำลังโหลดรายชื่อจังหวัด…
    </p>

    <p v-else-if="error" class="text-sm text-error">{{ error }}</p>

    <template v-else>
      <label v-if="props.allowAll" class="label cursor-pointer justify-start gap-2">
        <input v-model="all" type="checkbox" class="checkbox checkbox-sm" :disabled="disabled" />
        <span class="label-text">ทุกจังหวัด (ไม่จำกัดขอบเขต)</span>
      </label>

      <div class="flex flex-wrap gap-1.5" :class="all && 'opacity-50'">
        <button
          v-for="p in provinces"
          :key="p.id"
          type="button"
          :disabled="disabled || all"
          :aria-pressed="selected.includes(p.id)"
          class="btn btn-xs"
          :class="selected.includes(p.id) ? 'btn-primary' : 'btn-outline'"
          @click="toggle(p.id)"
        >
          {{ p.nameTh }}
        </button>
      </div>

      <p v-if="!all" class="text-xs opacity-60">
        เลือกแล้ว {{ selected.length }} จาก {{ provinces.length }} จังหวัด
      </p>
    </template>
  </div>
</template>

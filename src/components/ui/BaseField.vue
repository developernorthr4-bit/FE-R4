<script setup lang="ts">
import { useId } from 'vue'

/**
 * ช่องกรอกพร้อม label และคำอธิบาย
 *
 * ใช้ซ้ำ ~15 ที่ในโปรเจกต์ จึงคุ้มที่จะห่อ ต่างจาก badge/alert/card ที่ใช้
 * คลาส DaisyUI ตรง ๆ ได้เลยโดยไม่ต้องมี component
 */
defineProps<{
  label: string
  hint?: string
  type?: string
  required?: boolean
  disabled?: boolean
  autocomplete?: string
  placeholder?: string
  max?: string
  autofocus?: boolean
}>()

const model = defineModel<string>({ required: true })
const id = useId()
</script>

<template>
  <div class="form-control w-full">
    <label class="label" :for="id">
      <span class="label-text font-medium">{{ label }}</span>
    </label>
    <input
      :id="id"
      v-model="model"
      :type="type ?? 'text'"
      :required="required"
      :disabled="disabled"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :max="max"
      :autofocus="autofocus"
      class="input input-bordered w-full"
    />
    <p v-if="hint" class="mt-1 text-xs opacity-60">{{ hint }}</p>
  </div>
</template>

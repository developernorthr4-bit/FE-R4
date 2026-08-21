<script setup lang="ts">
import { useId } from 'vue'

defineProps<{
  label: string
  hint?: string
  required?: boolean
  disabled?: boolean
}>()

const model = defineModel<string>({ required: true })
const id = useId()
</script>

<template>
  <div class="form-control w-full">
    <label class="label" :for="id">
      <span class="label-text font-medium">{{ label }}</span>
    </label>
    <select
      :id="id"
      v-model="model"
      :required="required"
      :disabled="disabled"
      class="select select-bordered w-full"
    >
      <slot />
    </select>
    <p v-if="hint" class="mt-1 text-xs opacity-60">{{ hint }}</p>
  </div>
</template>

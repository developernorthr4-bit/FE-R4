<script setup lang="ts">
import { useId } from 'vue'

defineProps<{
  label: string
  hint?: string
  rows?: number
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
    <textarea
      :id="id"
      v-model="model"
      :rows="rows ?? 3"
      :disabled="disabled"
      class="textarea textarea-bordered w-full"
    />
    <p v-if="hint" class="mt-1 text-xs opacity-60">{{ hint }}</p>
  </div>
</template>

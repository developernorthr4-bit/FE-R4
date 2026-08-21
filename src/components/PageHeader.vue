<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">{{ title }}</h1>
      <p v-if="description" class="mt-1 text-sm opacity-70">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>

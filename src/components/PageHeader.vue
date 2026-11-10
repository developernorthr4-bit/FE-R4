<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useRoute } from 'vue-router'
import { GROUP_TONE, moduleForPath } from '../lib/modules'

/**
 * หัวเพจร่วม — ไอคอนและสีหาเองจาก route (lib/modules.ts → moduleForPath)
 * จึงไม่ต้องแก้ทีละหน้า · path ที่ไม่ตรงโมดูลไหน = แสดงแบบไม่มีไอคอน
 * `icon` ใช้ทับไอคอนเฉพาะหน้า (สียังตามกลุ่มของโมดูล)
 */
const props = defineProps<{ title: string; description?: string; icon?: Component }>()

const route = useRoute()
const mod = computed(() => moduleForPath(route.path))
const icon = computed(() => props.icon ?? mod.value?.icon)
const tile = computed(() => (mod.value ? GROUP_TONE[mod.value.group].tile : 'bg-base-200'))
</script>

<template>
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div class="flex min-w-0 items-start gap-3">
      <span
        v-if="icon"
        class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg"
        :class="tile"
        aria-hidden="true"
      >
        <component :is="icon" class="size-5" :stroke-width="2" />
      </span>
      <div class="min-w-0">
        <h1 class="text-xl font-semibold tracking-tight">{{ title }}</h1>
        <p v-if="description" class="mt-1 text-sm opacity-70">{{ description }}</p>
      </div>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>

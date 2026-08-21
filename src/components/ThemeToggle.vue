<script setup lang="ts">
import type { Theme } from '../lib/theme-store'
import { useThemeStore } from '../stores/theme'

/**
 * สลับธีมแบบ 3 ช่อง
 *
 * ไม่ใช้ปุ่มเดียวกดวน เพราะค่าเริ่มต้นคือ "ตามระบบ" — ถ้าซ่อนไว้ในวงกด
 * ผู้ใช้จะหาไม่เจอ และแยกไม่ออกว่ามืดเพราะเลือกเองหรือมืดเพราะ OS
 */
const theme = useThemeStore()

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'สว่าง' },
  { value: 'dark', label: 'มืด' },
  { value: 'system', label: 'ตามระบบ' },
]
</script>

<template>
  <div role="group" aria-label="ธีมการแสดงผล" class="join">
    <button
      v-for="o in OPTIONS"
      :key="o.value"
      type="button"
      class="btn btn-sm join-item px-2"
      :class="theme.theme === o.value ? 'btn-active' : 'btn-ghost'"
      :aria-pressed="theme.theme === o.value"
      :title="o.label"
      @click="theme.setTheme(o.value)"
    >
      <!-- ไอคอนวาดเอง ไม่ดึง icon library เข้ามาเพื่อของแค่นี้ -->
      <svg
        v-if="o.value === 'light'" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" class="size-4" aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <svg
        v-else-if="o.value === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4" aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
      <svg
        v-else viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4" aria-hidden="true"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
      <span class="sr-only">{{ o.label }}</span>
    </button>
  </div>
</template>

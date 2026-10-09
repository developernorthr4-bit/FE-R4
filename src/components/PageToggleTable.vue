<script setup lang="ts">
import { computed } from 'vue'
import { PAGE_SOURCE_LABEL, withinCeiling, type PageDef, type PageGroup, type PageSource } from '../lib/pages'
import { ROLE_LABEL, type Role } from '../lib/roles'
import type { PageMap } from '../services/permissions.api'

/**
 * ตารางหน้า × ปุ่ม 3 ทาง (ไม่ตั้ง / เปิด / ปิด) — ใช้ทั้งตัวแก้กลุ่มและตัวปรับรายคน
 *
 * role ส่งมา = ตัวปรับรายคน: หน้าที่เกินเพดาน role กดไม่ได้ (BE ก็ปฏิเสธ "เปิด" เกินเพดานอยู่แล้ว)
 * effective ส่งมา = โชว์คอลัมน์ "ผลจริง" พร้อมเหตุผล
 */
const props = defineProps<{
  pages: PageDef[]
  modelValue: PageMap
  /** ป้ายของตัวเลือก "ไม่ตั้ง" — กลุ่ม = "ตาม role" · รายคน = "ตามกลุ่ม" */
  unsetLabel: string
  role?: Role
  effective?: Record<string, { allow: boolean; source: PageSource }>
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: PageMap] }>()

const GROUP_LABEL: Record<PageGroup, string> = {
  daily: 'งานประจำวัน',
  data: 'ข้อมูลหลัก',
  'track#c': 'Track#C',
  system: 'ระบบ',
}

const sections = computed(() =>
  (Object.keys(GROUP_LABEL) as PageGroup[])
    .map((g) => ({ key: g, label: GROUP_LABEL[g], pages: props.pages.filter((p) => p.group === g) }))
    .filter((s) => s.pages.length))

type Choice = 'unset' | 'allow' | 'deny'

function choiceOf(key: string): Choice {
  if (!(key in props.modelValue)) return 'unset'
  return props.modelValue[key] ? 'allow' : 'deny'
}

function set(key: string, c: Choice) {
  const next = { ...props.modelValue }
  if (c === 'unset') delete next[key]
  else next[key] = c === 'allow'
  emit('update:modelValue', next)
}

function locked(p: PageDef): boolean {
  return props.role !== undefined && props.role !== 'dev' && !withinCeiling(props.role, p)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-for="s in sections" :key="s.key">
      <p class="mb-1 text-xs font-medium uppercase tracking-wide text-base-content/60">{{ s.label }}</p>
      <div class="divide-y divide-base-300 rounded-box border border-base-300">
        <div
          v-for="p in s.pages" :key="p.key"
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2"
          :class="{ 'opacity-50': locked(p) }"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium">
              {{ p.label }}
              <span v-if="p.optIn" class="badge badge-warning badge-xs ml-1 align-middle" title="ไม่ได้ตั้งค่า = เข้าไม่ได้ ต้องกด 'เปิด' ให้รายคนหรือในกลุ่ม">ปิดเป็นค่าเริ่มต้น</span>
            </p>
            <p class="text-xs text-base-content/60">
              <span class="font-mono">{{ p.key }}</span>
              <template v-if="p.minRole !== 'viewer'"> · ขั้นต่ำ {{ ROLE_LABEL[p.minRole] }}</template>
              <template v-if="locked(p)"> · เกินสิทธิ์ของ role นี้</template>
            </p>
          </div>

          <div class="flex items-center gap-3">
            <div class="join" role="radiogroup" :aria-label="p.label">
              <button
                v-for="c in (['unset', 'allow', 'deny'] as const)" :key="c"
                type="button" role="radio"
                class="btn join-item btn-xs"
                :class="{
                  'btn-active': choiceOf(p.key) === c,
                  'btn-success': choiceOf(p.key) === c && c === 'allow',
                  'btn-error': choiceOf(p.key) === c && c === 'deny',
                }"
                :aria-checked="choiceOf(p.key) === c"
                :disabled="disabled || locked(p)"
                @click="set(p.key, c)"
              >{{ c === 'unset' ? unsetLabel : c === 'allow' ? 'เปิด' : 'ปิด' }}</button>
            </div>

            <span
              v-if="effective?.[p.key]"
              class="w-32 text-right text-xs"
              :class="effective[p.key]!.allow ? 'text-success' : 'text-error'"
              :title="PAGE_SOURCE_LABEL[effective[p.key]!.source]"
            >
              {{ effective[p.key]!.allow ? '✓ เข้าได้' : '✕ เข้าไม่ได้' }}
              <span class="block text-base-content/50">{{ PAGE_SOURCE_LABEL[effective[p.key]!.source] }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

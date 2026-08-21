<script setup lang="ts">
/**
 * ปุ่มมาตรฐาน — ห่อ `btn` ของ DaisyUI เพิ่มแค่สถานะ loading
 *
 * ที่ทำ component นี้เพราะ "กดแล้วต้องกดซ้ำไม่ได้ + ขึ้นตัวหมุน" ใช้ซ้ำทุกฟอร์ม
 * ส่วนปุ่มธรรมดาที่ไม่มี loading ใช้ <button class="btn"> ตรง ๆ ได้เลย ไม่ต้องผ่านตัวนี้
 */
withDefaults(defineProps<{
  variant?: 'primary' | 'ghost' | 'error' | 'neutral'
  size?: 'sm' | 'md'
  type?: 'button' | 'submit'
  loading?: boolean
  disabled?: boolean
  block?: boolean
}>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
})

const VARIANT = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  error: 'btn-error',
  neutral: 'btn-neutral',
} as const
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="btn"
    :class="[VARIANT[variant], size === 'sm' && 'btn-sm', block && 'btn-block']"
  >
    <span v-if="loading" class="loading loading-spinner loading-xs" />
    <slot />
  </button>
</template>

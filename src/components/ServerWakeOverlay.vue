<script setup lang="ts">
/*
  หน้าจอรอ BE (Render free) ตื่น — สถานะมาจาก lib/server-wake.ts
  จอเต็ม = เปิดเว็บครั้งแรก · แถบบาง = กลับมาที่แท็บเดิม/เปลี่ยนหน้าหลังว่างนาน
  z-[2000] ให้อยู่เหนือแผนที่ Leaflet (pane สูงสุด ~1000) และ modal ในหน้า (z-[900])
*/
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { retryWake, serverWake } from '../lib/server-wake'

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

watch(
  () => serverWake.phase,
  (phase) => {
    if (phase === 'waking' && !timer) {
      now.value = Date.now()
      timer = setInterval(() => { now.value = Date.now() }, 1_000)
    } else if (phase !== 'waking' && timer) {
      clearInterval(timer)
      timer = null
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

const elapsed = computed(() => Math.max(0, Math.round((now.value - serverWake.startedAt) / 1000)))
const visible = computed(() => serverWake.phase !== 'idle')
const failed = computed(() => serverWake.phase === 'failed')
</script>

<template>
  <div
    v-if="visible && serverWake.mode === 'full'"
    class="fixed inset-0 z-[2000] flex items-center justify-center bg-base-100 p-4"
    role="status"
    aria-live="polite"
  >
    <div class="flex w-full max-w-sm flex-col items-center gap-4 text-center">
      <template v-if="!failed">
        <span class="loading loading-ring loading-lg text-primary" />
        <h1 class="text-lg font-semibold">กำลังปลุกเซิร์ฟเวอร์</h1>
        <p class="text-sm text-base-content/70">
          เซิร์ฟเวอร์พักเครื่องเมื่อไม่มีคนใช้งาน 15 นาที ปกติจะตื่นภายใน 30–60 วินาที
        </p>
        <progress class="progress progress-primary w-full" />
        <p class="text-xs tabular-nums text-base-content/60">รอมาแล้ว {{ elapsed }} วินาที</p>
      </template>
      <template v-else>
        <h1 class="text-lg font-semibold text-error">ยังติดต่อเซิร์ฟเวอร์ไม่ได้</h1>
        <p class="text-sm text-base-content/70">
          ตรวจการเชื่อมต่ออินเทอร์เน็ต หรือรอสักครู่แล้วลองใหม่
        </p>
        <button type="button" class="btn btn-primary" @click="retryWake">ลองใหม่</button>
      </template>
    </div>
  </div>

  <div
    v-else-if="visible"
    class="fixed inset-x-0 top-0 z-[2000] flex items-center justify-center gap-2 px-4 py-1.5 text-sm shadow"
    :class="failed ? 'bg-error text-error-content' : 'bg-warning text-warning-content'"
    role="status"
    aria-live="polite"
  >
    <template v-if="!failed">
      <span class="loading loading-spinner loading-xs" />
      <span>กำลังเชื่อมต่อเซิร์ฟเวอร์ใหม่… <span class="tabular-nums">{{ elapsed }}</span> วิ</span>
    </template>
    <template v-else>
      <span>ติดต่อเซิร์ฟเวอร์ไม่ได้</span>
      <button type="button" class="btn btn-xs" @click="retryWake">ลองใหม่</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import SiteAssetsList from './SiteAssetsList.vue'

/**
 * กรอบเลื่อนของรายการทรัพย์สิน — ใช้ที่หน้าตารางจัดการสถานี
 *
 * เป็นแผงทับหน้าเดิม ไม่ใช่หน้าใหม่ เพราะงานจริงคือไล่แก้ทีละสถานีตามตัวกรอง
 * ที่ตั้งไว้ในตาราง ถ้าเด้งไปหน้าใหม่ทุกครั้งจะเสียตัวกรองกับเลขหน้าทุกรอบ
 * (หน้าแก้ไขสถานีใช้ SiteAssetsList ตรง ๆ โดยไม่มีกรอบนี้)
 *
 * ชื่อสถานีรับมาเป็นพร็อพจากแถวในตาราง ไม่ได้รอจากผลโหลดของ List
 * หัวเรื่องจึงขึ้นทันทีตั้งแต่เปิด ไม่ใช่ค้างว่างไว้ราวหนึ่งวินาที
 */
defineProps<{
  siteId: string
  canEdit: boolean
  siteCode: string
  siteName: string | null
  provinceName: string
}>()

const emit = defineEmits<{
  close: []
  changed: []
}>()
</script>

<template>
  <div class="fixed inset-0 z-50 flex justify-end">
    <div class="absolute inset-0 bg-black/40" @click="emit('close')" />

    <aside class="relative flex h-full w-full max-w-4xl flex-col bg-base-100 shadow-2xl">
      <header class="flex items-start justify-between gap-3 border-b border-base-300 p-4">
        <div>
          <h2 class="text-lg font-semibold">
            ตู้ อุปกรณ์ และแบตเตอรี่ <span class="opacity-70">· {{ siteCode }}</span>
          </h2>
          <p class="text-sm opacity-70">
            {{ siteName ?? 'ไม่มีชื่อสถานี' }} · {{ provinceName }}
          </p>
        </div>
        <button type="button" class="btn btn-sm btn-ghost" @click="emit('close')">ปิด</button>
      </header>

      <div class="flex-1 overflow-y-auto p-4">
        <SiteAssetsList
          :site-id="siteId"
          :can-edit="canEdit"
          @changed="emit('changed')"
        />
      </div>
    </aside>
  </div>
</template>

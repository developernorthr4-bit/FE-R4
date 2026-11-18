<script setup lang="ts">
import { onMounted, ref } from 'vue'
import RingMembersCard from '@/components/rings/RingMembersCard.vue'
import { getSiteRings, type RingWithMembers } from '@/services/rings.api'

/**
 * วงที่สถานีนี้อยู่ — สถานีเดียวอยู่ได้หลายวง (202 แห่งในข้อมูลจริง)
 * การ์ดตัวเดียวกับที่ popup ในแผนที่สถานีใช้ กติกาการอธิบายต้นทางจึงตรงกันแน่
 *
 * โหลดเองแบบไม่ await รวมกับข้อมูลสถานี — ฟอร์มต้องขึ้นให้แก้ได้ก่อน
 * วงเป็นข้อมูลอ่านประกอบ ถ้าโหลดไม่ได้ก็แค่ไม่มีวง ไม่บล็อกการบันทึก
 * (เส้นทางตั้ง remountOnParams ไว้ เปลี่ยนสถานี = การ์ดนี้ถูกสร้างใหม่ ไม่ต้อง watch siteId)
 */
const props = defineProps<{
  siteId: string
  /** สถานีมีอุปกรณ์ CPE ไหม — ใช้เลือกข้อความตอนไม่มีวง */
  hasDevices: boolean
}>()

const siteRings = ref<RingWithMembers[]>([])
const ringsLoading = ref(true)

onMounted(() => {
  void getSiteRings(props.siteId)
    .then((r) => { siteRings.value = r })
    .catch(() => { siteRings.value = [] })
    .finally(() => { ringsLoading.value = false })
})
</script>

<template>
<div class="card border border-base-300 bg-base-100">
  <div class="card-body gap-2 p-4">
    <p class="text-sm font-medium">
      วงสื่อสัญญาณ<template v-if="siteRings.length"> ({{ siteRings.length }} วง)</template>
    </p>
    <div v-if="siteRings.length" class="flex flex-col gap-2">
      <RingMembersCard
        v-for="r in siteRings" :key="r.id"
        :ring="r" :current-site-id="siteId"
      />
    </div>
    <p v-else-if="ringsLoading" class="text-sm opacity-60">กำลังโหลดวง…</p>
    <p v-else-if="hasDevices" class="text-sm opacity-60">
      อุปกรณ์ของสถานีนี้ยังไม่ได้ผูกกับวงใดในไฟล์ CPE ring
    </p>
    <p v-else class="text-sm opacity-60">
      สถานีนี้ไม่มีอุปกรณ์ในไฟล์ CPE ring จึงยังไม่อยู่วงไหน
    </p>
  </div>
</div>
</template>

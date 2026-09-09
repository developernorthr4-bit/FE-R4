<script setup lang="ts">
import AppLayout from '../components/AppLayout.vue'
import OnlineNetworkMap from '../components/OnlineNetworkMap.vue'
import PageHeader from '../components/PageHeader.vue'

/**
 * แผนที่โครงข่ายงาน online ทั้งภาค
 *
 * คนละงานกับแผนที่ในหน้าสถานี — อันนั้นตอบว่า "สถานีนี้มีอะไรห้อยอยู่บ้าง"
 * ส่วนหน้านี้ตอบว่า "ทั้งภาคหน้าตาเป็นยังไง ตรงไหนผิดปกติ"
 *
 * หน้านี้เป็นเปลือกบาง ๆ ตัวจริงอยู่ใน OnlineNetworkMap.vue เพราะแผงควบคุมกับ
 * แผนที่ต้องแชร์สถานะกันแทบทุกตัว แยกไฟล์แล้วต้องส่ง props กลับไปกลับมาสิบกว่าอัน
 */
</script>

<template>
  <AppLayout>
    <PageHeader
      title="แผนที่โครงข่าย online"
      description="สถานี → OLT → L1 → L2 ทั้งภาค · กดที่จุดเพื่อไล่สายโซ่ขึ้นไปถึงสถานี"
    >
      <template #actions>
        <RouterLink to="/online/orphans" class="btn btn-ghost btn-sm">OLT ที่ยังไม่ผูกสถานี</RouterLink>
      </template>
    </PageHeader>

    <!--
      สูงเต็มจอที่เหลือ ไม่ใช่ความสูงคงที่ — แผนที่ที่เตี้ยเกินไปทำให้ต้องแพนบ่อย
      ซึ่งแปลว่ายิงขอข้อมูลใหม่บ่อยตามไปด้วย ขั้นต่ำ 32rem กันจอเตี้ยผิดปกติ
    -->
    <div class="h-[calc(100vh-15rem)] min-h-[32rem]">
      <OnlineNetworkMap />
    </div>
  </AppLayout>
</template>

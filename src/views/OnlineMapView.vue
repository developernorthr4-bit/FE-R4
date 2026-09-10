<script setup lang="ts">
import AppLayout from '../components/AppLayout.vue'
import OnlineNetworkMap from '../components/OnlineNetworkMap.vue'

/**
 * แผนที่โครงข่ายงาน online ทั้งภาค
 *
 * คนละงานกับแผนที่ในหน้าสถานี — อันนั้นตอบว่า "สถานีนี้มีอะไรห้อยอยู่บ้าง"
 * ส่วนหน้านี้ตอบว่า "ทั้งภาคหน้าตาเป็นยังไง ตรงไหนผิดปกติ"
 *
 * ใช้ AppLayout แบบ wide และไม่มีหัวข้อหน้า — แผนที่กินพื้นที่ที่เหลือทั้งหมด
 * ชื่อหน้ากับปุ่มต่าง ๆ ย้ายไปอยู่บนแผงที่ลอยทับแผนที่แทน เพราะบนแผนที่
 * ทุกพิกเซลที่เอาไปทำหัวข้อคือพื้นที่ที่ไม่ได้ใช้ดูข้อมูล
 */
</script>

<template>
  <AppLayout wide>
    <OnlineNetworkMap />
  </AppLayout>
</template>

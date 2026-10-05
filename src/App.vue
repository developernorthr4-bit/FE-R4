<script setup lang="ts">
/*
  ตัวห่อบางที่สุด — ทุกอย่างอยู่ใน router
  หน้า login/register จัดเลย์เอาต์เอง ส่วนหน้าหลังล็อกอินห่อด้วย AppLayout ในตัวมันเอง
  จึงไม่ต้องมี logic แยกเลย์เอาต์ที่นี่

  key เฉพาะเส้นทางที่ติด meta.remountOnParams — เปลี่ยน id แล้วสร้างหน้าใหม่ทั้งหน้า
  (เช่น /sites/A/edit → กดสถานีในวง → /sites/B/edit) ไม่งั้นฟอร์มค้างข้อมูลสถานี A
  แล้วกดบันทึกจะเขียนทับสถานี B · ไม่ใส่ทุกเส้นทางเพราะบางหน้าตั้งใจใช้หน้าเดิมต่อ
*/
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <component :is="Component" :key="route.meta.remountOnParams ? route.path : undefined" />
  </RouterView>
</template>

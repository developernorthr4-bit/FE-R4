<script setup lang="ts">
import OnlineNetworkMap from '../components/OnlineNetworkMap.vue'

/**
 * หน้าสำหรับ WebView ของแอปมือถือ (MB-R4) โดยเฉพาะ — แผนที่ล้วน ไม่มี AppLayout
 *
 * แอปเปิดหน้านี้แทน /online/map เพราะเมนู/แถบบนของเว็บไม่มีความหมายบนมือถือ
 * (แอปมีเมนูของตัวเองอยู่แล้ว) และแอปต้องการรับรหัสสถานีที่ผู้ใช้กดกลับไปเปิด
 * หน้าสถานีของมันเอง ซึ่ง OnlineNetworkMap ทำให้เมื่อได้ prop embed
 *
 * ยังต้อง login อยู่ (requiresAuth) — แอปยัด access token ลง localStorage ให้ก่อนโหลด
 */
</script>

<template>
  <div class="h-screen w-screen overflow-hidden bg-base-100">
    <OnlineNetworkMap embed />
  </div>
</template>

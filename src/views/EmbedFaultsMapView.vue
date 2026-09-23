<script setup lang="ts">
import FaultsMap from '../components/FaultsMap.vue'

/**
 * แผนที่จุดซ่อมสำหรับ WebView ของแอปมือถือ (MB-R4) — แผนที่ล้วน ไม่มี AppLayout
 * เหตุผลเดียวกับ EmbedOnlineMapView.vue · ปุ่ม "ลงข้อมูล" ส่ง postMessage {type:'openFault'}
 * ให้แอปเปิดฟอร์มตรวจ native (แท็บ "จุดซ่อม" ใน MB-R4)
 */
</script>

<template>
  <div class="h-screen w-screen overflow-hidden bg-base-100">
    <FaultsMap embed />
  </div>
</template>

<script setup lang="ts">
import SurveyMap from '../components/SurveyMap.vue'

/**
 * แผนที่สำรวจสำหรับ WebView ของแอปมือถือ (MB-R4) — แผนที่ล้วน ไม่มี AppLayout
 * เหตุผลเดียวกับ EmbedOnlineMapView.vue
 */
</script>

<template>
  <div class="h-screen w-screen overflow-hidden bg-base-100">
    <SurveyMap embed />
  </div>
</template>

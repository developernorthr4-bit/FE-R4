<script setup lang="ts">
import AppLayout from '../components/AppLayout.vue'
import SurveyMap from '../components/SurveyMap.vue'

/**
 * แผนที่สำรวจ — กรอกปลายทาง (OLT / L1 / L2 / สถานี) แล้วดูสายโซ่ เคเบิลรอบ ๆ
 * และเส้นทางขับรถไป · เต็มหน้าเหมือนแผนที่โครงข่าย online
 */
</script>

<template>
  <AppLayout wide>
    <SurveyMap />
  </AppLayout>
</template>

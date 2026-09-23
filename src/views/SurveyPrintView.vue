<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { errorMessage } from '../lib/api'
import { formatDate, formatDateTime } from '../lib/events'
import { formatM } from '../lib/ruler'
import {
  getSurvey, SEVERITY_LABEL, SURVEY_RESULT_LABEL, SURVEY_STATUS_LABEL,
  type SurveyDetail,
} from '../services/surveys.api'

/**
 * รายงานงานสำรวจสำหรับพิมพ์ / บันทึกเป็น PDF
 *
 * ทำเป็นหน้าเว็บแทนที่จะสร้าง PDF ที่ BE โดยตั้งใจ — รูปอยู่ใน Supabase Storage และเข้าถึง
 * ด้วย signed URL อายุ 1 ชม. ถ้าให้ BE ทำ PDF ต้องดึงรูปทั้งหมดกลับมาที่เซิร์ฟเวอร์แล้ว
 * ฝังลงไฟล์ ซึ่งบน Render free (RAM 512 MB) เสี่ยงล้มเมื่องานมีรูป 40 รูป
 * เบราว์เซอร์โหลดรูปเองอยู่แล้ว กด Ctrl+P → "บันทึกเป็น PDF" ได้ไฟล์ที่มีรูปครบ
 *
 * ไม่มี AppLayout — เมนู/แถบบนไม่ควรติดไปในกระดาษ
 */
const route = useRoute()
const data = ref<SurveyDetail | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

const survey = computed(() => data.value?.survey ?? null)
const points = computed(() => data.value?.points ?? [])
const photosOf = (pointId: string | null) => (data.value?.photos ?? []).filter((p) => p.pointId === pointId)
const KIND_LABEL: Record<string, string> = { site: 'สถานี', olt: 'OLT', l1: 'L1', l2: 'L2' }

function printPage() { window.print() }

onMounted(async () => {
  try {
    data.value = await getSurvey(String(route.params.id))
  } catch (err) {
    error.value = errorMessage(err, 'เปิดงานสำรวจไม่ได้')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="print-page mx-auto max-w-[820px] bg-white p-6 text-black">
    <div v-if="loading" class="text-sm">กำลังโหลด…</div>
    <div v-else-if="error" class="text-sm text-red-700">{{ error }}</div>

    <template v-else-if="survey">
      <!-- แถบเครื่องมือ — ไม่ติดไปในกระดาษ -->
      <div class="no-print mb-4 flex items-center gap-2 border-b border-gray-300 pb-3">
        <button type="button" class="btn btn-primary btn-sm" @click="printPage">พิมพ์ / บันทึกเป็น PDF</button>
        <RouterLink :to="`/surveys/${survey.id}`" class="btn btn-ghost btn-sm">← กลับไปหน้างาน</RouterLink>
        <span class="text-xs opacity-60">ในกล่องพิมพ์ เลือกปลายทางเป็น "บันทึกเป็น PDF" · เปิด "กราฟิกพื้นหลัง" ถ้าอยากได้สีพื้น</span>
      </div>

      <header class="mb-4 border-b-2 border-black pb-2">
        <h1 class="text-xl font-bold">รายงานงานสำรวจ {{ survey.surveyNo }}</h1>
        <p class="text-sm">
          {{ KIND_LABEL[survey.targetKind] ?? survey.targetKind }} {{ survey.targetCode }}
          <template v-if="survey.siteCode"> · สถานี {{ survey.siteCode }} {{ survey.siteName }}</template>
        </p>
      </header>

      <table class="mb-5 w-full text-sm">
        <tbody>
          <tr><th class="w-36 py-1 text-left align-top">วันที่สำรวจ</th><td class="py-1">{{ formatDate(survey.surveyDate) }}</td></tr>
          <tr><th class="py-1 text-left align-top">ประเภทงาน</th><td class="py-1">{{ survey.jobTypeName ?? '—' }}</td></tr>
          <tr><th class="py-1 text-left align-top">ผู้สำรวจ</th><td class="py-1">{{ survey.surveyorName }}<template v-if="survey.companions"> · ร่วมกับ {{ survey.companions }}</template></td></tr>
          <tr><th class="py-1 text-left align-top">จังหวัด</th><td class="py-1">{{ survey.provinceName ?? '—' }}</td></tr>
          <tr><th class="py-1 text-left align-top">สถานะ</th><td class="py-1">{{ SURVEY_STATUS_LABEL[survey.status] }}<template v-if="survey.result"> · ผลสรุป {{ SURVEY_RESULT_LABEL[survey.result] }}</template></td></tr>
          <tr v-if="survey.routeM !== null"><th class="py-1 text-left align-top">เส้นทางที่วางไว้</th><td class="py-1">{{ formatM(survey.routeM) }}</td></tr>
          <tr v-if="survey.submittedAt"><th class="py-1 text-left align-top">ส่งงานเมื่อ</th><td class="py-1">{{ formatDateTime(survey.submittedAt) }}</td></tr>
          <tr v-if="survey.summary"><th class="py-1 text-left align-top">สรุป</th><td class="whitespace-pre-line py-1">{{ survey.summary }}</td></tr>
        </tbody>
      </table>

      <h2 class="mb-2 border-b border-gray-400 text-base font-bold">จุดปัญหา ({{ points.length }})</h2>
      <p v-if="!points.length" class="text-sm">ไม่มีจุดปัญหาในงานนี้</p>

      <section v-for="p in points" :key="p.id" class="point mb-5">
        <h3 class="text-sm font-bold">
          จุดที่ {{ p.seqNo }} · {{ p.pointTypeName ?? '—' }} · ความรุนแรง {{ SEVERITY_LABEL[p.severity] }}
          <span v-if="p.resolvedAt" class="font-normal">· แก้ไขแล้ว {{ formatDate(p.resolvedAt) }}</span>
        </h3>
        <p class="text-xs">
          พิกัด {{ p.lat.toFixed(5) }}, {{ p.lng.toFixed(5) }} · บันทึกเมื่อ {{ formatDateTime(p.createdAt) }}
        </p>
        <p v-if="p.note" class="mt-1 whitespace-pre-line text-sm">{{ p.note }}</p>
        <div v-if="photosOf(p.id).length" class="mt-2 grid grid-cols-2 gap-2">
          <figure v-for="ph in photosOf(p.id)" :key="ph.id" class="shot">
            <img v-if="ph.url" :src="ph.url" :alt="`จุดที่ ${p.seqNo}`" class="w-full border border-gray-300 object-cover">
            <figcaption v-else class="border border-gray-300 p-4 text-center text-xs">ไม่มีไฟล์รูป</figcaption>
          </figure>
        </div>
      </section>

      <template v-if="photosOf(null).length">
        <h2 class="mb-2 border-b border-gray-400 text-base font-bold">รูปของงาน ({{ photosOf(null).length }})</h2>
        <div class="grid grid-cols-2 gap-2">
          <figure v-for="ph in photosOf(null)" :key="ph.id" class="shot">
            <img v-if="ph.url" :src="ph.url" alt="รูปของงาน" class="w-full border border-gray-300 object-cover">
          </figure>
        </div>
      </template>

      <footer class="mt-6 border-t border-gray-400 pt-2 text-xs">
        พิมพ์เมื่อ {{ formatDateTime(new Date().toISOString()) }} · ระบบงานโครงข่ายภาคเหนือ (R4)
      </footer>
    </template>
  </div>
</template>

<style scoped>
/* หน้านี้เป็นกระดาษ — บังคับพื้นขาวตัวอักษรดำแม้เว็บอยู่โหมดมืด */
.print-page { color-scheme: light; }

@media print {
  .no-print { display: none !important; }
  .print-page { max-width: none; padding: 0; }
  /* ห้ามหั่นจุดหรือรูปคาหน้ากระดาษ */
  .point, .shot { break-inside: avoid; page-break-inside: avoid; }
  .shot img { max-height: 9cm; object-fit: contain; }
}
</style>

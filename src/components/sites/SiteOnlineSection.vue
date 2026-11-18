<script setup lang="ts">
import { ref } from 'vue'
import SiteOnlineMap from '@/components/sites/SiteOnlineMap.vue'
import SiteOnlineTree from '@/components/sites/SiteOnlineTree.vue'
import type { OnlineFocus } from '@/services/online.api'

/** ส่วน "โครงข่ายงาน online" ในหน้า /sites/:id/edit — อ่านอย่างเดียว (ย้าย OLT/L2 ทำผ่านปุ่มในต้นไม้) */
defineProps<{
  /** null = หน้าสร้างสถานีใหม่ ยังไม่มีโครงข่ายให้ดู */
  siteId: string | null
  siteCode: string
  /** = canWriteOriginal ของหน้าแม่ */
  canEdit: boolean
}>()

/*
 * โครงข่ายงาน online — ต้นไม้กับแผนที่เป็นสองมุมของข้อมูลชุดเดียวกัน
 *
 * จุดที่เลือกอยู่ต้องเก็บไว้ตรงนี้ ไม่ใช่ในแต่ละ component เพราะทั้งสองฝั่งต้อง
 * ชี้ที่เดียวกัน กดหมุดบนแผนที่แล้วต้นไม้กางลงไปหา กดรหัสในต้นไม้แล้วแผนที่ซูมไป
 * ไม่วนเป็นลูป เพราะแต่ละฝั่งแค่อ่านค่านี้ ไม่ได้ยิงกลับตอนค่าเปลี่ยน
 */
const onlineView = ref<'tree' | 'map'>('tree')
const onlineFocus = ref<OnlineFocus | null>(null)
/**
 * แผนที่ค่อยสร้างตอนกดดูครั้งแรก แล้วอยู่ยาวด้วย v-show
 * ถ้าใช้ v-if สลับ Leaflet จะสร้างใหม่และยิงขอข้อมูลทุกครั้งที่สลับแท็บ
 * แต่ถ้าสร้างตั้งแต่เปิดหน้า คนที่มาแก้ข้อมูลสถานีเฉย ๆ ก็ต้องจ่ายค่าโหลดฟรี ๆ
 */
const mapReady = ref(false)

function showOnline(view: 'tree' | 'map') {
  if (view === 'map') mapReady.value = true
  onlineView.value = view
}

/** กดจากแผนที่ → ไปดูในต้นไม้ · กดจากต้นไม้ → ไปดูบนแผนที่ */
function focusFromMap(target: OnlineFocus) {
  onlineFocus.value = target
  onlineView.value = 'tree'
}

function focusFromTree(target: OnlineFocus) {
  onlineFocus.value = target
  showOnline('map')
}
</script>

<template>
<section>
  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-base font-semibold">โครงข่ายงาน online</h2>

    <div v-if="siteId" class="flex items-center gap-3">
      <p class="hidden text-sm opacity-70 sm:block">
        {{ onlineView === 'tree' ? 'กดลูกศรเพื่อกางชั้นถัดไป' : 'กดหมุดเพื่อดูในต้นไม้' }}
      </p>
      <div role="tablist" class="tabs-boxed tabs tabs-sm">
        <button
          type="button" role="tab" class="tab"
          :class="{ 'tab-active': onlineView === 'tree' }"
          @click="showOnline('tree')"
        >
          ต้นไม้
        </button>
        <button
          type="button" role="tab" class="tab"
          :class="{ 'tab-active': onlineView === 'map' }"
          @click="showOnline('map')"
        >
          แผนที่
        </button>
      </div>
    </div>
  </div>

  <template v-if="siteId">
    <div v-show="onlineView === 'tree'">
      <SiteOnlineTree
        :site-id="siteId" :site-code="siteCode" :can-edit="canEdit"
        :focus="onlineFocus" @focus="focusFromTree"
      />
    </div>

    <div v-if="mapReady" v-show="onlineView === 'map'">
      <SiteOnlineMap
        :site-id="siteId"
        :active="onlineView === 'map'"
        :focus="onlineFocus"
        @focus="focusFromMap"
      />
    </div>
  </template>

  <div v-else class="card border border-base-300 bg-base-100">
    <div class="card-body gap-2 p-4 text-sm opacity-70">
      <p class="font-medium opacity-100">ยังไม่มีโครงข่าย</p>
      <p>OLT มาจากไฟล์ต้นทาง จึงเห็นได้เฉพาะสถานีที่บันทึกไว้แล้ว</p>
    </div>
  </div>
</section>
</template>

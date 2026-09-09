<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { errorMessage } from '../lib/api'
import {
  BAND_LABEL, DEFAULT_RULES, downloadRadiusXlsx, getRadius,
  type RadiusResult, type RadiusRules,
} from '../services/online.api'

/**
 * แผงวิเคราะห์รอบ OLT ตัวเดียว — ของที่แผนที่เฉย ๆ ตอบไม่ได้
 *
 * แผนที่ตอบได้แค่ "อะไรอยู่ตรงไหน" แต่คำถามจริงของงาน Re-design คือ
 * "ลูกตัวไหนของ OLT นี้อยู่ไกลเกินไป และมีตัวไหนใกล้กว่าให้ย้ายไปได้บ้าง"
 * ซึ่งต้องคิดระยะข้าม OLT ทุกตัวในละแวก — ทำฝั่ง BE แล้วส่งผลมาแสดงที่นี่
 *
 * ⚠️ ระยะทุกตัวเลขในแผงนี้เป็น "เส้นตรง" ไม่ใช่ความยาวสายจริง ไฟล์ต้นทางไม่มี
 *    คอลัมน์ ODN_length ระยะสายจริงยาวกว่าเสมอ ใช้จัดลำดับความสำคัญได้
 *    แต่ห้ามเอาไปกรอกเป็นค่า ODN ในเอกสารส่งงาน
 */
const props = defineProps<{ code: string }>()

const emit = defineEmits<{
  close: []
  /** ให้แผนที่ลากวงรัศมี — null = ลบวงทิ้ง */
  circle: [{ lat: number; lng: number; km: number } | null]
  goto: [{ lat: number; lng: number }]
}>()

const rules = ref<RadiusRules>({ ...DEFAULT_RULES })
const data = ref<RadiusResult | null>(null)
const loading = ref(false)
const busyExport = ref(false)
const error = ref<string | null>(null)
const openChild = ref<string | null>(null)
const showInside = ref(false)

const PRESETS = [3, 4, 5]

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await getRadius(props.code, rules.value)
    data.value = res
    emit('circle', { lat: res.olt.lat, lng: res.olt.lng, km: rules.value.km })
  } catch (err) {
    data.value = null
    emit('circle', null)
    error.value = errorMessage(err, 'วิเคราะห์รัศมีไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

watch(() => props.code, () => {
  openChild.value = null
  showInside.value = false
  void load()
}, { immediate: true })

/* กติกาเปลี่ยน = ผลเปลี่ยน ต้องคิดใหม่ทั้งชุด ไม่ใช่กรองของเดิมที่โหลดมา
   เพราะ OLT ที่ถูกกฎตัดออกไปแล้วไม่ได้ถูกส่งมาให้ตั้งแต่แรก */
watch(rules, () => void load(), { deep: true })

async function exportXlsx() {
  busyExport.value = true
  error.value = null
  try {
    await downloadRadiusXlsx(props.code, rules.value)
  } catch (err) {
    error.value = errorMessage(err, 'สร้างไฟล์ Excel ไม่สำเร็จ')
  } finally {
    busyExport.value = false
  }
}

function close() {
  emit('circle', null)
  emit('close')
}

const BAND_CLASS: Record<number, string> = {
  0: 'badge-success',
  1: 'badge-warning',
  2: 'badge-error',
}

function metres(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} กม.` : `${Math.round(m)} ม.`
}

/** ลดลงกี่เปอร์เซ็นต์ถ้าย้ายไปตัวนี้ — ตัวเลขที่ note.txt ใช้ตัดสิน */
function cut(from: number, to: number): number {
  return Math.round((1 - to / from) * 100)
}

const insideMineFirst = computed(() => {
  const list = data.value?.inside ?? []
  return [...list].sort((a, b) => Number(b.mine) - Number(a.mine) || a.m - b.m)
})
</script>

<template>
  <div
    class="absolute right-3 top-3 z-[800] flex max-h-[calc(100%-1.5rem)] w-80 flex-col
           overflow-hidden rounded-box border border-base-300 bg-base-100/95 shadow-lg backdrop-blur"
  >
    <div class="flex items-start gap-2 border-b border-base-300 p-3">
      <div class="min-w-0">
        <p class="truncate font-mono text-sm font-semibold">{{ code }}</p>
        <p class="text-xs opacity-60">
          <template v-if="data?.olt.siteCode">สถานี {{ data.olt.siteCode }}</template>
          <template v-else>ยังผูกสถานีไม่ได้</template>
        </p>
      </div>
      <button type="button" class="btn btn-ghost btn-xs ml-auto" @click="close">✕</button>
    </div>

    <div class="flex-1 overflow-auto p-3 text-sm">
      <div class="flex items-center gap-2">
        <input
          v-model.number="rules.km" type="number" min="0.2" max="20" step="0.5"
          class="input input-bordered input-sm w-20"
        >
        <span class="text-xs opacity-70">กิโลเมตร</span>
        <div class="join ml-auto">
          <button
            v-for="p in PRESETS" :key="p" type="button"
            class="btn btn-xs join-item" :class="{ 'btn-active': rules.km === p }"
            @click="rules.km = p"
          >
            {{ p }}
          </button>
        </div>
      </div>

      <p v-if="loading" class="mt-3 opacity-70">กำลังคิด…</p>
      <div v-else-if="error" class="alert alert-error mt-3 text-xs">{{ error }}</div>

      <template v-else-if="data">
        <div class="mt-3 rounded-lg bg-base-200 p-2 text-xs leading-relaxed">
          <p>
            L1 ในวง <b>{{ data.summary.inside.toLocaleString() }}</b>
            <span class="opacity-70">
              (ของตัวนี้ {{ data.summary.insideMine.toLocaleString() }} ·
              ของ OLT อื่น {{ data.summary.insideOthers.toLocaleString() }})
            </span>
          </p>
          <p>
            ลูกที่หลุดนอกวง <b>{{ data.summary.outside.toLocaleString() }}</b>
            <template v-if="data.summary.newOltRequired">
              · <span class="text-error">หา OLT ไม่ได้ {{ data.summary.newOltRequired }}</span>
            </template>
          </p>
          <p v-if="data.summary.insideCapped" class="text-warning">
            รายการในวงถูกตัดที่ 500 ตัว ลดรัศมีลงเพื่อดูให้ครบ
          </p>
        </div>

        <!-- ลูกที่หลุดนอกวง — ส่วนที่เป็นงานจริง จึงอยู่บนสุด -->
        <p class="mt-4 text-xs font-semibold uppercase opacity-60">
          ลูกที่หลุดนอกวง ({{ data.outside.length }})
        </p>
        <p v-if="!data.outside.length" class="mt-1 text-xs opacity-60">
          ลูกทุกตัวอยู่ในรัศมีนี้หมดแล้ว
        </p>

        <div
          v-for="child in data.outside" :key="child.code"
          class="mt-1 rounded-lg border border-base-300 p-2"
        >
          <button
            type="button" class="flex w-full items-center gap-2 text-left"
            @click="openChild = openChild === child.code ? null : child.code"
          >
            <span class="font-mono text-xs">{{ child.code }}</span>
            <span class="badge badge-xs" :class="BAND_CLASS[child.band]">{{ metres(child.m) }}</span>
            <span class="ml-auto text-xs" :class="child.newOltRequired ? 'text-error' : 'opacity-70'">
              <template v-if="child.newOltRequired">NEW_OLT_REQUIRED</template>
              <template v-else>→ {{ child.alternatives[0]?.code }}</template>
            </span>
          </button>

          <div v-if="openChild === child.code" class="mt-2 border-t border-base-200 pt-2 text-xs">
            <p class="opacity-60">{{ BAND_LABEL[child.band] }}</p>
            <button
              type="button" class="link mt-1"
              @click="emit('goto', { lat: child.lat, lng: child.lng })"
            >
              ไปที่ตำแหน่งของ L1 ตัวนี้
            </button>

            <p v-if="child.alternatives.length" class="mt-2 font-semibold">OLT ที่ใกล้กว่า</p>
            <ul class="mt-1 flex flex-col gap-1">
              <li
                v-for="alt in child.alternatives" :key="alt.code"
                class="flex items-center gap-2"
              >
                <button
                  type="button" class="link font-mono"
                  @click="emit('goto', { lat: alt.lat, lng: alt.lng })"
                >
                  {{ alt.code }}
                </button>
                <span class="opacity-70">{{ metres(alt.m) }}</span>
                <span class="opacity-50">ลูก {{ alt.l1Count }}</span>
                <span class="ml-auto text-success">สั้นลง {{ cut(child.m, alt.m) }}%</span>
              </li>
            </ul>

            <p v-if="Object.keys(child.rejected).length" class="mt-2 opacity-60">
              ถูกกฎตัดออก:
              <span v-for="(n, why) in child.rejected" :key="why" class="mr-2">{{ why }} {{ n }}</span>
            </p>
          </div>
        </div>

        <!-- L1 ในวง — ข้อมูลประกอบ พับไว้ก่อนเพราะยาวได้ถึง 500 แถว -->
        <button
          type="button" class="mt-4 text-xs font-semibold uppercase opacity-60"
          @click="showInside = !showInside"
        >
          {{ showInside ? '▾' : '▸' }} L1 ในวง ({{ data.inside.length }})
        </button>
        <ul v-if="showInside" class="mt-1 flex flex-col gap-0.5">
          <li v-for="r in insideMineFirst" :key="r.code" class="flex items-center gap-2 text-xs">
            <button
              type="button" class="link font-mono"
              @click="emit('goto', { lat: r.lat, lng: r.lng })"
            >
              {{ r.code }}
            </button>
            <span class="opacity-70">{{ metres(r.m) }}</span>
            <span v-if="!r.mine" class="ml-auto font-mono opacity-50">{{ r.parentCode }}</span>
          </li>
        </ul>

        <!-- กฎเลือก OLT ใหม่ ตาม note.txt -->
        <p class="mt-4 text-xs font-semibold uppercase opacity-60">กฎเลือก OLT ใหม่</p>
        <div class="mt-1 flex items-center gap-2 text-xs">
          <span>ค้นหาไม่เกิน</span>
          <input
            v-model.number="rules.altKm" type="number" min="0.2" max="30" step="0.5"
            class="input input-bordered input-xs w-16"
          >
          <span>กม.</span>
        </div>
        <label class="mt-1 flex cursor-pointer items-center gap-2 text-xs">
          <input v-model="rules.shrink80" type="checkbox" class="checkbox checkbox-xs">
          ช่วง 3,501–4,000 ม. ต้องสั้นลง ≥ 80%
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-xs">
          <input v-model="rules.capFull" type="checkbox" class="checkbox checkbox-xs">
          ตัดตัวที่มีลูกครบ 25 แล้ว
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-xs">
          <input v-model="rules.sameDistrict" type="checkbox" class="checkbox checkbox-xs">
          ต้องอยู่อำเภอเดียวกัน
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-xs">
          <input v-model="rules.noG0" type="checkbox" class="checkbox checkbox-xs">
          ตัดชื่อลงท้าย G00–G04
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-xs">
          <input v-model="rules.noGO" type="checkbox" class="checkbox checkbox-xs">
          ตัดชื่อลงท้าย GO0–GO4
        </label>

        <div class="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs leading-relaxed">
          <p>
            ⚠️ กฎ “ห้ามใช้ OLT ลงท้าย G00–G04” ใน note.txt เขียนกำกับว่า
            <b>เฉพาะใน BKK</b> — ข้อมูลชุดนี้เป็น 17 จังหวัดภูมิภาค และ OLT
            เกือบทุกตัวชื่อลงท้ายแบบนี้ เปิดแล้วแทบไม่เหลือตัวเลือกให้ย้าย
          </p>
          <p class="mt-1">
            ⚠️ กฎ “กลุ่ม NN_ID เดียวกัน” ยังทำไม่ได้ ไม่มี NN_ID ทั้งใน DB และไฟล์
            PowerBI — ใช้ “อำเภอเดียวกัน” แทนไปก่อน
          </p>
          <p class="mt-1">
            ⚠️ ระยะทั้งหมดเป็น <b>เส้นตรง</b> ไม่ใช่ความยาวสายจริง
          </p>
        </div>

        <button
          type="button" class="btn btn-sm mt-3 w-full"
          :disabled="busyExport" @click="exportXlsx"
        >
          {{ busyExport ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลดเป็น Excel' }}
        </button>
      </template>
    </div>
  </div>
</template>

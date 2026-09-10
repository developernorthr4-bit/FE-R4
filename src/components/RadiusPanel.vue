<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { errorMessage } from '../lib/api'
import { categorical } from '../lib/palette'
import { glyphPoints, type MarkerShape } from '../lib/shape-marker'
import { downloadRadiusXlsx, getRadius, type MapKind, type RadiusResult } from '../services/online.api'
import { useThemeStore } from '../stores/theme'

/**
 * "รอบจุดนี้มีอะไรอยู่บ้าง" — เปิดเองทุกครั้งที่กดจุดบนแผนที่
 *
 * ถามชั้นถัดลงไปหนึ่งชั้นเสมอ เพราะนั่นคือคำถามที่คนทำงานถามจริง
 *   สถานี → มี OLT อะไรอยู่รอบ ๆ · OLT → มี L1 · L1 → มี L2
 *
 * สิ่งที่ทำให้แผงนี้มีค่ากว่าการกางต้นไม้ คือมันไม่สนใจว่าใครเป็นลูกใคร
 * มันตอบว่า "อะไรอยู่ตรงนั้นบ้าง" ซึ่งรวมของที่ขึ้นกับตัวอื่นด้วย — ตรงนั้นแหละ
 * ที่เห็นว่ามีทางเลือกอะไรอยู่ในพื้นที่ จึงมีป้าย "ของตัวอื่น" กำกับทุกแถว
 *
 * ⚠️ ระยะเป็นเส้นตรง ไม่ใช่ความยาวสายจริง — ไฟล์ต้นทางไม่มี ODN_length มาให้
 */
const props = defineProps<{ kind: MapKind; code: string }>()

const emit = defineEmits<{
  close: []
  /** ให้แผนที่ลากวงรัศมี — null = ลบวงทิ้ง */
  circle: [{ lat: number; lng: number; km: number } | null]
  goto: [{ lat: number; lng: number }]
}>()

const theme = useThemeStore()

const LABEL: Record<MapKind, string> = { site: 'สถานี', olt: 'OLT', l1: 'L1', l2: 'L2' }
const SLOT: Record<MapKind, number> = { site: 8, olt: 1, l1: 3, l2: 7 }
/** รูปทรงชุดเดียวกับบนแผนที่ ไม่งั้นหัวแผงกับหมุดที่กดจะดูไม่เข้าคู่กัน */
const SHAPE: Record<MapKind, MarkerShape> = {
  site: 'triangle', olt: 'square', l1: 'diamond', l2: 'circle',
}
const PRESETS = [1, 3, 5]

const km = ref(3)
const data = ref<RadiusResult | null>(null)
const loading = ref(false)
const busyExport = ref(false)
const error = ref<string | null>(null)
const onlyOthers = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await getRadius(props.kind, props.code, km.value)
    data.value = res
    emit('circle', { lat: res.origin.lat, lng: res.origin.lng, km: res.km })
  } catch (err) {
    data.value = null
    emit('circle', null)
    error.value = errorMessage(err, 'หาสิ่งที่อยู่ในรัศมีไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

watch(() => [props.kind, props.code], () => void load(), { immediate: true })
watch(km, () => void load())

async function exportXlsx() {
  busyExport.value = true
  error.value = null
  try {
    await downloadRadiusXlsx(props.kind, props.code, km.value)
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

function metres(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} กม.` : `${Math.round(m)} ม.`
}

const rows = computed(() => {
  const list = data.value?.items ?? []
  return onlyOthers.value ? list.filter((i) => !i.mine) : list
})

const childLabel = computed(() => (data.value ? LABEL[data.value.childKind] : ''))
</script>

<template>
  <div
    class="absolute right-3 top-3 z-[800] flex max-h-[calc(100%-1.5rem)] w-80 flex-col
           overflow-hidden rounded-box border border-base-300 bg-base-100/95 shadow-lg backdrop-blur"
  >
    <div class="flex items-start gap-2 border-b border-base-300 p-3">
      <svg class="mt-1 size-3.5 shrink-0" viewBox="-10 -10 20 20" aria-hidden="true">
        <polygon
          v-if="glyphPoints(SHAPE[kind])" :points="glyphPoints(SHAPE[kind])"
          :fill="categorical(SLOT[kind], theme.resolved === 'dark')"
        />
        <circle v-else r="7" :fill="categorical(SLOT[kind], theme.resolved === 'dark')" />
      </svg>
      <div class="min-w-0">
        <p class="truncate font-mono text-sm font-semibold">{{ code }}</p>
        <p class="text-xs opacity-60">
          {{ LABEL[kind] }}<template v-if="childLabel"> · รอบตัวนี้มี {{ childLabel }} อะไรบ้าง</template>
        </p>
      </div>
      <button type="button" class="btn btn-ghost btn-xs ml-auto" @click="close">✕</button>
    </div>

    <div class="flex-1 overflow-auto p-3 text-sm">
      <div class="flex items-center gap-2">
        <input
          v-model.number="km" type="number" min="0.2" max="20" step="0.5"
          class="input input-bordered input-sm w-20"
        >
        <span class="text-xs opacity-70">กิโลเมตร</span>
        <div class="join ml-auto">
          <button
            v-for="p in PRESETS" :key="p" type="button"
            class="btn btn-xs join-item" :class="{ 'btn-active': km === p }"
            @click="km = p"
          >
            {{ p }}
          </button>
        </div>
      </div>

      <p v-if="loading" class="mt-3 opacity-70">กำลังหา…</p>
      <div v-else-if="error" class="alert alert-error mt-3 text-xs">{{ error }}</div>

      <template v-else-if="data">
        <div class="mt-3 rounded-lg bg-base-200 p-2 text-xs leading-relaxed">
          <p>
            ในรัศมี {{ data.km }} กม. มี {{ childLabel }}
            <b>{{ data.summary.total.toLocaleString() }}</b> ตัว
          </p>
          <p class="opacity-70">
            ของ {{ code }} เอง {{ data.summary.mine.toLocaleString() }} ·
            ของตัวอื่น {{ data.summary.others.toLocaleString() }}
          </p>
          <p v-if="data.summary.capped" class="text-warning">
            รายการถูกตัดที่ 500 ตัว — ลดรัศมีลงเพื่อดูให้ครบ
          </p>
        </div>

        <label
          v-if="data.summary.others"
          class="mt-2 flex cursor-pointer items-center gap-2 text-xs"
        >
          <input v-model="onlyOthers" type="checkbox" class="checkbox checkbox-xs">
          แสดงเฉพาะที่ขึ้นกับตัวอื่น
        </label>

        <p v-if="!rows.length" class="mt-3 text-xs opacity-60">
          ไม่มี {{ childLabel }} อยู่ในรัศมีนี้
        </p>

        <ul v-else class="mt-2 flex flex-col divide-y divide-base-200">
          <li v-for="r in rows" :key="r.code" class="flex items-center gap-2 py-1 text-xs">
            <button
              type="button" class="link font-mono"
              @click="emit('goto', { lat: r.lat, lng: r.lng })"
            >
              {{ r.code }}
            </button>
            <span class="opacity-70">{{ metres(r.m) }}</span>
            <span
              v-if="!r.mine" class="ml-auto truncate font-mono opacity-50"
              :title="`ขึ้นกับ ${r.parentCode ?? 'ไม่ทราบ'}`"
            >
              {{ r.parentCode ?? '—' }}
            </span>
            <span v-else class="ml-auto opacity-40">ของตัวนี้</span>
          </li>
        </ul>

        <p class="mt-3 text-xs leading-relaxed opacity-60">
          ระยะเป็นเส้นตรงจากจุดที่เลือก ไม่ใช่ความยาวสายจริง
        </p>

        <button
          type="button" class="btn btn-sm mt-2 w-full"
          :disabled="busyExport || !data.items.length" @click="exportXlsx"
        >
          {{ busyExport ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลดเป็น Excel' }}
        </button>
      </template>
    </div>
  </div>
</template>

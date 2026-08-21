<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { errorMessage } from '../lib/api'
import { searchSites, type SiteLite } from '../services/sites.api'

/**
 * ค้นหาและเลือกสถานีที่ได้รับผลกระทบ
 *
 * ไม่โหลดรายชื่อทั้งหมดมาใส่ dropdown เพราะมีสถานี 7,300 แห่ง —
 * ค้นทีละครั้งผ่าน /sites/search แล้วให้ BE ตัดเหลือ 20 รายการ
 *
 * ไม่บังคับให้เลือก: ตอนเหตุการณ์เพิ่งเกิดมักยังไม่รู้ว่ากระทบสถานีไหน
 */
const props = defineProps<{
  /** จังหวัดของเหตุการณ์ — จำกัดผลค้นหาให้เลือกข้ามจังหวัดไม่ได้ */
  provinceId: number | null
  disabled?: boolean
}>()

const picked = defineModel<SiteLite[]>({ required: true })

const term = ref('')
const results = ref<SiteLite[]>([])
const searching = ref(false)
const error = ref<string | null>(null)
const open = ref(false)
const box = ref<HTMLElement | null>(null)

let timer: number | null = null
/** นับรอบการค้นหา เพื่อทิ้งผลของคำค้นที่ล้าสมัย */
let seq = 0

/**
 * หน่วง 300ms ก่อนยิง และทิ้งผลที่ล้าสมัย
 *
 * ถ้าไม่ทิ้ง ผลของ "CM" ที่กลับมาช้ากว่าผลของ "CMI" จะเขียนทับรายการที่ถูกต้อง
 * — อาการที่ผู้ใช้เห็นเป็น "พิมพ์เร็วแล้วผลไม่ตรง"
 */
watch([term, () => props.provinceId], ([q, province]) => {
  if (timer) clearTimeout(timer)
  if (!q.trim() || province === null) {
    results.value = []
    searching.value = false
    return
  }
  searching.value = true
  const mine = ++seq
  timer = window.setTimeout(async () => {
    try {
      const rows = await searchSites(q.trim(), province)
      if (mine !== seq) return
      results.value = rows
      error.value = null
    } catch (err) {
      if (mine === seq) error.value = errorMessage(err, 'ค้นหาสถานีไม่สำเร็จ')
    } finally {
      if (mine === seq) searching.value = false
    }
  }, 300)
})

// ปิดผลค้นหาเมื่อคลิกนอกกล่อง ไม่งั้นรายการจะค้างทับเนื้อหาข้างล่าง
function onDocClick(e: MouseEvent) {
  if (box.value && !box.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
  if (timer) clearTimeout(timer)
})

const unpicked = computed(() => results.value.filter((r) => !picked.value.some((s) => s.id === r.id)))

function add(site: SiteLite) {
  if (!picked.value.some((s) => s.id === site.id)) picked.value = [...picked.value, site]
  term.value = ''
  results.value = []
  open.value = false
}

function remove(id: string) {
  picked.value = picked.value.filter((s) => s.id !== id)
}
</script>

<template>
  <div ref="box" class="flex flex-col gap-2">
    <div v-if="picked.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="s in picked"
        :key="s.id"
        class="badge badge-outline gap-1.5 py-3"
      >
        <span class="font-medium">{{ s.siteCode }}</span>
        <span v-if="s.siteName" class="opacity-60">{{ s.siteName }}</span>
        <button
          v-if="!disabled"
          type="button"
          :aria-label="`เอา ${s.siteCode} ออก`"
          class="ml-0.5 opacity-60 hover:opacity-100"
          @click="remove(s.id)"
        >
          ✕
        </button>
      </span>
    </div>

    <div class="relative">
      <input
        v-model="term"
        type="text"
        :disabled="disabled || provinceId === null"
        :placeholder="provinceId === null ? 'เลือกจังหวัดก่อนจึงจะค้นหาสถานีได้' : 'พิมพ์รหัสหรือชื่อสถานี'"
        class="input input-bordered w-full"
        @focus="open = true"
        @input="open = true"
      />

      <div
        v-if="open && term.trim()"
        class="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-box border border-base-300 bg-base-100 shadow-lg"
      >
        <p v-if="searching" class="flex items-center gap-2 px-3 py-2.5 text-sm opacity-70">
          <span class="loading loading-spinner loading-xs" /> กำลังค้นหา…
        </p>
        <p v-else-if="!unpicked.length" class="px-3 py-2.5 text-sm opacity-70">
          ไม่พบสถานีที่ตรงกับคำค้นในจังหวัดนี้
        </p>
        <button
          v-for="s in unpicked"
          v-else
          :key="s.id"
          type="button"
          class="block w-full px-3 py-2 text-left text-sm hover:bg-base-200"
          @click="add(s)"
        >
          <span class="font-medium">{{ s.siteCode }}</span>
          <span v-if="s.siteName" class="ml-2 opacity-60">{{ s.siteName }}</span>
        </button>
      </div>
    </div>

    <p v-if="error" class="text-xs text-error">{{ error }}</p>
    <p class="text-xs opacity-60">
      เลือกแล้ว {{ picked.length }} สถานี — ไม่บังคับ ถ้ายังไม่รู้ว่ากระทบที่ไหนเว้นว่างไว้ได้ แล้วกลับมาเติมทีหลัง
    </p>
  </div>
</template>

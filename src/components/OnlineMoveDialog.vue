<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { errorMessage } from '../lib/api'
import { searchSites, type SiteLite } from '../services/sites.api'
import {
  moveNode, moveOlt, searchOnline, type MapHit, type MoveResult,
} from '../services/online.api'

/**
 * ย้าย OLT ไปสถานี uplink อื่น หรือย้าย L2 ไปใต้ L1 อื่น — กล่องเดียวใช้ทั้งสองแบบ
 *
 * ย้ายแล้ว BE ติดล็อก (manual_lock) ให้เอง ไฟล์ import รอบหน้าที่ยังเขียนที่เดิมจะไม่ดึงกลับ
 * ล็อกเฉพาะ "อยู่ใต้ใคร" ไม่แตะพิกัด — พิกัด OLT เป็นของตัวมันเอง ไม่ใช่ของสถานี
 * Ticket ที่ผูกอยู่ย้ายตามในคำสั่งเดียวกัน
 */
const props = defineProps<{
  mode: 'olt' | 'l2'
  /** id ของ OLT หรือ L2 ที่จะย้าย */
  id: string
  code: string
  /** ที่อยู่ปัจจุบัน — รหัสสถานี (OLT) หรือรหัส L1 (L2) · null = ยังไม่ผูก */
  currentParent: string | null
  /** เฉพาะ OLT: จำนวนโหนดที่ย้ายตามไปด้วย */
  l1Count?: number
  l2Count?: number
}>()

const emit = defineEmits<{ close: []; moved: [result: MoveResult & { target: string }] }>()

type Pick = { key: string; code: string; sub: string | null }

const term = ref('')
const results = ref<Pick[]>([])
const searching = ref(false)
const picked = ref<Pick | null>(null)
const saving = ref(false)
const error = ref<string | null>(null)

let timer: number | null = null
let seq = 0

/*
 * OLT → ค้นสถานีทุกจังหวัด (provinceId 0) · L2 → ค้นผ่าน /online/search แล้วเหลือแค่ L1
 * /online/search คืนเฉพาะโหนดที่ยังใช้งานและมีพิกัด — ตรงกับที่ BE ยอมให้ย้ายเข้าพอดี
 */
async function find(q: string): Promise<Pick[]> {
  if (props.mode === 'olt') {
    const rows: SiteLite[] = await searchSites(q, 0, 10)
    return rows.map((s) => ({ key: s.id, code: s.siteCode, sub: s.siteName }))
  }
  const hits: MapHit[] = await searchOnline(q)
  return hits.filter((h) => h.kind === 'l1').map((h) => ({ key: h.code, code: h.code, sub: null }))
}

watch(term, (q) => {
  if (timer) clearTimeout(timer)
  const v = q.trim()
  if (v.length < 2 || picked.value) {
    results.value = []
    searching.value = false
    return
  }
  searching.value = true
  const mine = ++seq
  timer = window.setTimeout(async () => {
    try {
      const rows = await find(v)
      if (mine === seq) results.value = rows.filter((r) => r.code !== props.currentParent)
    } catch (err) {
      if (mine === seq) error.value = errorMessage(err, 'ค้นหาไม่สำเร็จ')
    } finally {
      if (mine === seq) searching.value = false
    }
  }, 300)
})

onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

function choose(p: Pick) {
  picked.value = p
  results.value = []
  term.value = ''
  error.value = null
}

const what = computed(() => (props.mode === 'olt' ? 'สถานี uplink' : 'L1'))

async function submit() {
  if (!picked.value || saving.value) return
  saving.value = true
  error.value = null
  try {
    const res = props.mode === 'olt'
      ? await moveOlt(props.id, picked.value.key)
      : await moveNode(props.id, picked.value.code)
    emit('moved', { ...res, target: picked.value.code })
  } catch (err) {
    error.value = errorMessage(err, 'ย้ายไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="modal modal-open" @click.self="!saving && emit('close')">
    <div class="modal-box max-w-lg">
      <h3 class="text-lg font-semibold">
        ย้าย <span class="font-mono">{{ code }}</span> ไป{{ what }}อื่น
      </h3>
      <p class="mt-1 text-sm opacity-70">
        ตอนนี้อยู่ที่ <b class="font-mono">{{ currentParent ?? 'ยังไม่ผูก' }}</b>
        <template v-if="mode === 'olt' && (l1Count || l2Count)">
          · L1 {{ (l1Count ?? 0).toLocaleString() }} · L2 {{ (l2Count ?? 0).toLocaleString() }} ย้ายตามไปด้วย
        </template>
      </p>

      <div class="mt-4">
        <span class="label-text text-xs opacity-70">{{ what }}ปลายทาง</span>
        <div v-if="picked" class="mt-1 flex items-center gap-2">
          <span class="badge badge-lg badge-primary badge-outline font-mono">{{ picked.code }}</span>
          <span v-if="picked.sub" class="text-sm opacity-70">{{ picked.sub }}</span>
          <button type="button" class="btn btn-xs btn-ghost" :disabled="saving" @click="picked = null">
            เปลี่ยน
          </button>
        </div>
        <div v-else class="relative mt-1">
          <input
            v-model="term" type="search" autofocus
            :placeholder="mode === 'olt' ? 'พิมพ์รหัสสถานี เช่น UTR0052' : 'พิมพ์รหัส L1'"
            class="input input-sm input-bordered w-full font-mono"
          />
          <span
            v-if="searching"
            class="loading loading-spinner loading-xs absolute right-3 top-2 opacity-60"
          />
          <ul
            v-if="results.length"
            class="menu absolute z-10 mt-1 w-full rounded-box bg-base-100 p-1 shadow-lg"
          >
            <li v-for="r in results" :key="r.key">
              <button type="button" @click="choose(r)">
                <b class="font-mono">{{ r.code }}</b>
                <span v-if="r.sub" class="opacity-60">{{ r.sub }}</span>
              </button>
            </li>
          </ul>
          <p
            v-else-if="term.trim().length >= 2 && !searching"
            class="mt-1 text-xs opacity-60"
          >
            ไม่พบ{{ what }}ที่ตรงกับคำค้น
            <template v-if="mode === 'l2'"> (ค้นเจอเฉพาะ L1 ที่ยังใช้งานอยู่)</template>
          </p>
        </div>
      </div>

      <ul class="mt-4 list-disc pl-5 text-xs opacity-70">
        <li>ระบบจะล็อกไว้ — import ไฟล์รอบหน้าที่ยังเขียนที่เดิมจะไม่ดึงกลับ (ปลดล็อกได้ภายหลัง)</li>
        <li>พิกัดของ{{ mode === 'olt' ? ' OLT' : ' L2' }}ไม่เปลี่ยน</li>
        <li>Ticket ที่ผูกอยู่จะย้ายตามไปทันที</li>
      </ul>

      <div v-if="error" role="alert" class="alert alert-error mt-4 text-sm">
        <span>{{ error }}</span>
      </div>

      <div class="modal-action">
        <button type="button" class="btn btn-ghost" :disabled="saving" @click="emit('close')">
          ยกเลิก
        </button>
        <button type="button" class="btn btn-primary" :disabled="!picked || saving" @click="submit">
          <span v-if="saving" class="loading loading-spinner loading-xs" />
          ย้าย<template v-if="picked"> ไป {{ picked.code }}</template>
        </button>
      </div>
    </div>
  </div>
</template>

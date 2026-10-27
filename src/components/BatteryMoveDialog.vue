<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { errorMessage } from '../lib/api'
import {
  brandModel, freeCodes, isPresent, num, type BatteryRow, type SiteAssets,
} from '../lib/assets'
import {
  getSiteAssets, moveBatteries, searchSites, type SiteLite,
} from '../services/sites.api'

/**
 * ย้ายแบตหลายก้อนไปตู้ของสถานีอื่น
 *
 * BE ไม่เปลี่ยน site_id ทับ — ปิดแถวต้นทางเป็น "ถอดออกแล้ว" แล้วเปิดแถวใหม่ที่ปลายทาง
 * (POST /sites/:id/batteries/move) ประวัติการย้ายจึงเห็นได้ทั้งสองสถานี
 *
 * ช่องปลายทางต้องว่าง เพราะงานนี้คือ "เพิ่มแบตให้ตู้ที่ load สูง" ไม่ใช่เปลี่ยนก้อน
 * ระบบเติมช่องว่างให้ก่อน ผู้ใช้แก้ทับได้ — BE ตรวจชนซ้ำอีกชั้น
 */
const props = defineProps<{
  fromSiteId: string
  fromSiteCode: string
  /** ก้อนที่ติ๊กไว้ — เรียงตามที่จะจับคู่กับช่องปลายทาง */
  batteries: BatteryRow[]
  /** id ตู้ → รหัสตู้ ของสถานีต้นทาง ไว้เขียนว่าแต่ละก้อนมาจากตู้ไหน */
  cabinetCodeOf: (cabinetId: string | null) => string
}>()

const emit = defineEmits<{ close: []; moved: [count: number] }>()

/** วันนี้ตามเวลาเครื่อง (ไม่ใช่ UTC) — sv-SE ให้รูปแบบ ปปปป-ดด-วว พอดี */
const today = new Date().toLocaleDateString('sv-SE')

const term = ref('')
const results = ref<SiteLite[]>([])
const searching = ref(false)
const dest = ref<SiteLite | null>(null)
const destAssets = ref<SiteAssets | null>(null)
const loadingDest = ref(false)
const cabinetId = ref('')
const codes = ref<string[]>([])
const movedAt = ref(today)
const remark = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

let timer: number | null = null
let seq = 0

// ค้นทุกจังหวัด (provinceId 0) — ย้ายข้ามจังหวัดได้ BE ตรวจสิทธิ์จังหวัดปลายทางเอง
watch(term, (q) => {
  if (timer) clearTimeout(timer)
  if (!q.trim() || dest.value) {
    results.value = []
    searching.value = false
    return
  }
  searching.value = true
  const mine = ++seq
  timer = window.setTimeout(async () => {
    try {
      const rows = await searchSites(q.trim(), 0, 10)
      if (mine === seq) results.value = rows.filter((s) => s.id !== props.fromSiteId)
    } catch (err) {
      if (mine === seq) error.value = errorMessage(err, 'ค้นหาสถานีไม่สำเร็จ')
    } finally {
      if (mine === seq) searching.value = false
    }
  }, 300)
})

onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

async function pickSite(s: SiteLite) {
  dest.value = s
  results.value = []
  term.value = ''
  cabinetId.value = ''
  destAssets.value = null
  error.value = null
  loadingDest.value = true
  try {
    destAssets.value = await getSiteAssets(s.id)
    // ตู้ใบเดียวเลือกให้เลย · หลายใบเลือกตู้ 1 ก่อน เพราะสูตรสำรองไฟนับเฉพาะตู้ 1
    const cabs = cabinets.value
    const first = cabs.length === 1 ? cabs[0] : cabs.find((c) => c.cabinetCode === '1')
    if (first) cabinetId.value = first.id
  } catch (err) {
    error.value = errorMessage(err, 'โหลดตู้ของสถานีปลายทางไม่สำเร็จ')
  } finally {
    loadingDest.value = false
  }
}

function clearSite() {
  dest.value = null
  destAssets.value = null
  cabinetId.value = ''
}

const cabinets = computed(() => (destAssets.value?.cabinets ?? []).filter((c) => isPresent(c.status)))

/** แบตที่ยังอยู่ในตู้ปลายทางตอนนี้ */
const destBatteries = computed(() =>
  (destAssets.value?.batteries ?? [])
    .filter((b) => b.cabinetId === cabinetId.value && isPresent(b.status))
    .sort((a, b) => Number(a.bankCode) - Number(b.bankCode)),
)

const destCabinetCode = computed(() =>
  cabinets.value.find((c) => c.id === cabinetId.value)?.cabinetCode ?? null,
)

// เปลี่ยนตู้ = คำนวณช่องว่างใหม่ทั้งชุด (ค่าที่แก้มือไว้ของตู้เดิมไม่มีความหมายกับตู้ใหม่)
watch(cabinetId, () => {
  codes.value = cabinetId.value
    ? freeCodes(destBatteries.value.map((b) => b.bankCode), props.batteries.length)
    : []
})

const takenCodes = computed(() => new Set(destBatteries.value.map((b) => b.bankCode)))

/** ปัญหาของช่องปลายทางทีละก้อน — ตรวจก่อนส่งให้เห็นตรงแถว ไม่ต้องรอ BE ตอบ 409 */
const codeProblems = computed(() => codes.value.map((c, i) => {
  const v = c.trim()
  if (!v) return 'ต้องระบุช่อง'
  if (takenCodes.value.has(v)) return 'ช่องนี้มีแบตอยู่แล้ว'
  if (codes.value.findIndex((x) => x.trim() === v) !== i) return 'ซ้ำกับก้อนอื่น'
  return null
}))

const totalAh = computed(() =>
  props.batteries.reduce((sum, b) => sum + (b.capacityAh ?? 0) * b.qty, 0),
)

const canSubmit = computed(() =>
  !!dest.value && !!cabinetId.value && !!movedAt.value && movedAt.value <= today
  && codeProblems.value.every((p) => p === null) && !saving.value,
)

async function submit() {
  if (!canSubmit.value || !dest.value) return
  saving.value = true
  error.value = null
  try {
    const res = await moveBatteries(props.fromSiteId, {
      batteryIds: props.batteries.map((b) => b.id),
      toSiteId: dest.value.id,
      toCabinetId: cabinetId.value,
      bankCodes: codes.value.map((c) => c.trim()),
      movedAt: movedAt.value,
      remark: remark.value,
    })
    emit('moved', res.moved)
  } catch (err) {
    error.value = errorMessage(err, 'ย้ายแบตไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="modal modal-open" @click.self="!saving && emit('close')">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-semibold">
        ย้ายแบต {{ batteries.length }} ก้อน ออกจาก {{ fromSiteCode }}
      </h3>
      <p class="mt-1 text-xs opacity-60">
        ก้อนที่ย้ายจะขึ้นเป็น "ถอดออกแล้ว · ย้ายไป …" ที่สถานีนี้ และเป็นก้อนใหม่ที่สถานีปลายทาง
        ผลตรวจ PM เก่ายังอยู่กับสถานีนี้ซึ่งเป็นที่ที่วัดจริง
      </p>

      <!-- 1. สถานีปลายทาง -->
      <div class="mt-4">
        <span class="label-text text-xs opacity-70">สถานีปลายทาง</span>
        <div v-if="dest" class="mt-1 flex items-center gap-2">
          <span class="badge badge-lg badge-primary badge-outline">{{ dest.siteCode }}</span>
          <span v-if="dest.siteName" class="text-sm opacity-70">{{ dest.siteName }}</span>
          <button type="button" class="btn btn-xs btn-ghost" :disabled="saving" @click="clearSite">
            เปลี่ยน
          </button>
        </div>
        <div v-else class="relative mt-1">
          <input
            v-model="term" type="search" placeholder="พิมพ์รหัสสถานี เช่น TAK0065"
            class="input input-sm input-bordered w-full" autofocus
          />
          <span
            v-if="searching"
            class="loading loading-spinner loading-xs absolute right-3 top-2 opacity-60"
          />
          <ul
            v-if="results.length"
            class="menu absolute z-10 mt-1 w-full rounded-box bg-base-100 p-1 shadow-lg"
          >
            <li v-for="s in results" :key="s.id">
              <button type="button" @click="pickSite(s)">
                <b>{{ s.siteCode }}</b>
                <span v-if="s.siteName" class="opacity-60">{{ s.siteName }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- 2. ตู้ปลายทาง -->
      <div v-if="loadingDest" class="mt-4 flex justify-center">
        <span class="loading loading-spinner opacity-60" />
      </div>
      <template v-else-if="dest && destAssets">
        <div v-if="!cabinets.length" role="alert" class="alert alert-warning mt-4 text-sm">
          <span>
            สถานี {{ dest.siteCode }} ยังไม่มีตู้ในทะเบียน — เพิ่มตู้ที่หน้าสถานีนั้นก่อน แล้วค่อยกลับมาย้าย
          </span>
        </div>
        <template v-else>
          <label class="form-control mt-4">
            <span class="label-text text-xs opacity-70">ตู้ปลายทาง</span>
            <select v-model="cabinetId" class="select select-sm select-bordered w-full">
              <option value="" disabled>เลือกตู้</option>
              <option v-for="c in cabinets" :key="c.id" :value="c.id">
                ตู้ {{ c.cabinetCode }}
              </option>
            </select>
          </label>

          <p v-if="cabinetId" class="mt-1 text-xs opacity-70">
            ตู้ {{ destCabinetCode }} มีแบตอยู่ {{ destBatteries.length }} ก้อน
            <template v-if="destBatteries.length">
              (ช่อง {{ destBatteries.map((b) => b.bankCode ?? '-').join(', ') }})
            </template>
          </p>
          <div
            v-if="cabinetId && destCabinetCode !== '1'" role="alert"
            class="alert alert-warning mt-2 py-2 text-xs"
          >
            <span>
              ชั่วโมงสำรองไฟคิดเฉพาะแบตใน<b>ตู้ 1</b> — ย้ายเข้าตู้ {{ destCabinetCode }}
              จะไม่ทำให้ชั่วโมงสำรองไฟของ {{ dest.siteCode }} เพิ่มขึ้น
            </span>
          </div>
        </template>
      </template>

      <!-- 3. ก้อนที่ย้าย + ช่องปลายทาง -->
      <div class="mt-4 overflow-x-auto">
        <table class="table table-xs">
          <thead>
            <tr>
              <th>จากตู้/ช่อง</th>
              <th>ยี่ห้อ/รุ่น</th>
              <th class="text-right">ความจุ</th>
              <th class="text-right">SOH</th>
              <th class="w-32">ไปช่อง</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(b, i) in batteries" :key="b.id">
              <td class="whitespace-nowrap">ตู้ {{ cabinetCodeOf(b.cabinetId) }} · {{ b.bankCode ?? '-' }}</td>
              <td>{{ brandModel(b.brand, b.model) }}</td>
              <td class="text-right tabular-nums">{{ num(b.capacityAh, 'Ah') }}</td>
              <td class="text-right tabular-nums">{{ num(b.healthPct, '%') }}</td>
              <td>
                <input
                  v-if="cabinetId" v-model="codes[i]" type="text"
                  class="input input-xs input-bordered w-20"
                  :class="codeProblems[i] ? 'input-error' : ''"
                  :disabled="saving"
                />
                <span v-else class="text-xs opacity-50">เลือกตู้ก่อน</span>
                <div v-if="cabinetId && codeProblems[i]" class="text-xs text-error">
                  {{ codeProblems[i] }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mt-1 text-xs opacity-60">
          รวมความจุที่ย้าย {{ totalAh.toLocaleString() }} Ah · ช่องปลายทางเติมช่องที่ว่างให้ก่อน
          (ใบตรวจ PM มีแค่ช่อง 1–8)
        </p>
      </div>

      <!-- 4. วันที่ + หมายเหตุ -->
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <label class="form-control">
          <span class="label-text text-xs opacity-70">วันที่ย้าย</span>
          <input
            v-model="movedAt" type="date" :max="today" required
            class="input input-sm input-bordered w-full"
          />
        </label>
        <label class="form-control sm:col-span-2">
          <span class="label-text text-xs opacity-70">หมายเหตุ (ไม่บังคับ)</span>
          <textarea
            v-model="remark" rows="2" placeholder="เช่น ตู้ปลายทาง load สูง แบตไม่พอ"
            class="textarea textarea-sm textarea-bordered w-full"
          />
        </label>
      </div>

      <div v-if="error" role="alert" class="alert alert-error mt-4 text-sm">
        <span>{{ error }}</span>
      </div>

      <div class="modal-action">
        <button type="button" class="btn btn-ghost" :disabled="saving" @click="emit('close')">
          ยกเลิก
        </button>
        <button type="button" class="btn btn-primary" :disabled="!canSubmit" @click="submit">
          <span v-if="saving" class="loading loading-spinner loading-xs" />
          ย้าย {{ batteries.length }} ก้อน<template v-if="dest"> ไป {{ dest.siteCode }}</template>
        </button>
      </div>
    </div>
  </div>
</template>

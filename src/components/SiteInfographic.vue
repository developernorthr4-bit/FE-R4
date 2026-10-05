<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { errorMessage } from '../lib/api'
import {
  assetStatusLabel, brandModel, meterLabel, num, sohTone,
  type BatteryRow, type SiteAssets, type SohTone,
} from '../lib/assets'
import { formatDate } from '../lib/events'
import { getSiteAssets, type SiteFrequency } from '../services/sites.api'
import CabinetBox from './infographic/CabinetBox.vue'

/**
 * ภาพภายในสถานี — เสาสายอากาศ + ย่านความถี่ / มิเตอร์ไฟ / ตู้ / แบตทีละก้อน
 * ดูอย่างเดียว การแก้ยังอยู่ที่ SiteAssetsList ข้างล่าง
 *
 * โหลด getSiteAssets เองแยกจาก SiteAssetsList (ข้อมูลชุดเดียวกัน) — หน้าที่ครอบอยู่
 * ต้องเรียก reload() เมื่อการ์ดรายการส่ง changed ไม่งั้นภาพจะค้างค่าเก่า
 *
 * ความถี่รับมาจากหน้าที่ครอบอยู่ เพราะ SiteFormView โหลดไว้แล้ว ไม่ต้องยิงซ้ำ
 * (site_frequencies.equipment_id ว่างทั้งหมด = รู้ว่าสถานีมีย่านอะไร แต่ไม่รู้ว่าอยู่ตู้ไหน
 * จึงวาดไว้ที่เสา ไม่ใช่ในตู้)
 */
const props = defineProps<{
  siteId: string
  siteCode: string
  frequencies: SiteFrequency[]
}>()

const data = ref<SiteAssets | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const selectedId = ref<string | null>(null)

async function reload() {
  loading.value = data.value === null
  error.value = null
  try {
    data.value = await getSiteAssets(props.siteId)
  } catch (err) {
    error.value = errorMessage(err, 'โหลดภาพภายในสถานีไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

onMounted(reload)
watch(() => props.siteId, () => {
  data.value = null
  selectedId.value = null
  reload()
})
defineExpose({ reload })

// ─────────────────────────────────────────────────────────────────────────────
// จัดของลงตู้
// ─────────────────────────────────────────────────────────────────────────────

/** รหัสตู้/ช่องแบตในฐานเป็นเลข "1".."8" — เรียงแบบตัวเลข ไม่งั้น "10" มาก่อน "2" */
const byCode = (a: string | null, b: string | null) =>
  (a ?? '').localeCompare(b ?? '', undefined, { numeric: true })

/** ของที่ถอดออกแล้วไม่วาด — ภาพนี้ตอบว่า "ตอนนี้ในสถานีมีอะไร" */
const live = <T extends { status: string }>(rows: T[]) => rows.filter((r) => r.status !== 'removed')

const batteries = computed(() =>
  live(data.value?.batteries ?? []).sort((a, b) => byCode(a.bankCode, b.bankCode)))
const equipments = computed(() => live(data.value?.equipments ?? []))

/** มิเตอร์ได้ป้ายสั้น M1, M2… ไว้จับคู่กับตู้ — เลขมิเตอร์จริงส่วนใหญ่ว่าง */
const meters = computed(() =>
  live(data.value?.meters ?? []).map((m, i) => ({ ...m, tag: `M${i + 1}` })))
const meterTag = (id: string | null) => meters.value.find((m) => m.id === id)?.tag ?? null

const cabinets = computed(() => {
  const rows = data.value?.cabinets ?? []
  return rows
    .map((c) => ({
      key: c.id,
      title: `ตู้ ${c.cabinetCode}`,
      status: c.status,
      meterTag: meterTag(c.meterId),
      typeName: c.typeName,
      batteries: batteries.value.filter((b) => b.cabinetId === c.id),
      equipments: equipments.value.filter((e) => e.cabinetId === c.id),
    }))
    // ตู้ที่ถอดแล้วยังต้องโผล่ถ้าข้างในยังมีของ ไม่งั้นของหายจากภาพแบบไม่มีใครรู้
    .filter((c) => c.status !== 'removed' || c.batteries.length || c.equipments.length)
    .sort((a, b) => byCode(a.title, b.title))
})

/** ของที่รู้ว่าอยู่สถานีนี้แต่ไม่รู้ว่าตู้ไหน — ตอนนี้ไม่มี แต่ schema อนุญาต */
const loose = computed(() => ({
  batteries: batteries.value.filter((b) => b.cabinetId === null),
  equipments: equipments.value.filter((e) => e.cabinetId === null),
}))

const bands = computed(() =>
  [...props.frequencies]
    .filter((f) => f.status !== 'removed')
    .sort((a, b) => Number(a.nominalMhz ?? 0) - Number(b.nominalMhz ?? 0)))

const isEmpty = computed(() =>
  cabinets.value.length === 0 && !loose.value.batteries.length && !loose.value.equipments.length)

// ─────────────────────────────────────────────────────────────────────────────
// สรุป
// ─────────────────────────────────────────────────────────────────────────────

const TONE_META: { tone: SohTone; label: string; dot: string }[] = [
  { tone: 'good', label: 'SOH ≥70%', dot: 'bg-success' },
  { tone: 'warn', label: '40–69%', dot: 'bg-warning' },
  { tone: 'bad', label: '1–39%', dot: 'bg-error' },
  { tone: 'zero', label: '0% ตรวจซ้ำ', dot: 'border-2 border-dashed border-error' },
  { tone: 'unknown', label: 'ไม่มีค่า', dot: 'bg-base-content/30' },
]

const summary = computed(() => {
  const counts: Record<SohTone, number> = { good: 0, warn: 0, bad: 0, zero: 0, unknown: 0 }
  let cells = 0
  for (const b of batteries.value) {
    counts[sohTone(b).tone] += b.qty
    cells += b.qty
  }
  const types = [...new Set(batteries.value.map((b) => b.typeName).filter(Boolean))]
  return {
    cells,
    counts,
    types,
    faulty: batteries.value.filter((b) => b.status === 'faulty').reduce((s, b) => s + b.qty, 0),
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// รายละเอียดก้อนที่เลือก
// ─────────────────────────────────────────────────────────────────────────────

const selected = computed<BatteryRow | null>(() =>
  batteries.value.find((b) => b.id === selectedId.value) ?? null)

const selectedCabinet = computed(() => {
  const s = selected.value
  if (!s) return null
  return cabinets.value.find((c) => c.key === s.cabinetId)?.title ?? 'ไม่ระบุตู้'
})

function toggle(b: BatteryRow) {
  selectedId.value = selectedId.value === b.id ? null : b.id
}

const READ_STATUS_LABEL: Record<string, string> = {
  ok: 'อ่านค่าได้',
  unreadable: 'อ่านค่าไม่ได้',
  charging: 'กำลังชาร์จ',
}
</script>

<template>
  <section class="card border border-base-300 bg-base-100">
    <div class="card-body gap-4 p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-base font-semibold">
          ภาพภายในสถานี {{ siteCode }}
          <span class="badge badge-ghost badge-sm align-middle">dev</span>
        </h2>
        <p class="text-xs text-base-content/60">กดที่แบตเพื่อดูรายละเอียด · ดูอย่างเดียว แก้ได้ที่รายการด้านล่าง</p>
      </div>

      <div v-if="loading" class="flex justify-center py-10">
        <span class="loading loading-spinner" />
      </div>

      <div v-else-if="error" role="alert" class="alert alert-error text-sm">
        <span>{{ error }}</span>
        <button type="button" class="btn btn-sm" @click="reload">ลองใหม่</button>
      </div>

      <template v-else>
        <!-- เสาสายอากาศ + ย่านความถี่ -->
        <div class="flex items-end gap-3">
          <svg viewBox="0 0 40 64" class="h-16 w-10 shrink-0 text-base-content/60" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
              <path d="M20 6 L8 62 M20 6 L32 62 M12 44 L28 44 M15 28 L25 28 M10 54 L30 54 M12 44 L25 28 M28 44 L15 28" />
            </g>
            <rect x="6" y="8" width="4" height="12" rx="1" class="fill-primary" />
            <rect x="30" y="8" width="4" height="12" rx="1" class="fill-primary" />
            <circle cx="20" cy="5" r="2.5" class="fill-primary" />
          </svg>
          <div class="min-w-0">
            <p class="text-xs text-base-content/60">
              ความถี่ที่ใช้ {{ bands.length ? `${bands.length} ย่าน` : '' }}
            </p>
            <div v-if="bands.length" class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="f in bands" :key="f.id"
                class="badge badge-primary badge-outline badge-sm font-mono"
                :title="f.bandLabel ?? undefined"
              >{{ f.code }}</span>
            </div>
            <p v-else class="text-sm text-base-content/50">ยังไม่มีข้อมูลความถี่</p>
          </div>
        </div>

        <!-- มิเตอร์ไฟ = บัสด้านบนของตู้ -->
        <div v-if="!isEmpty" class="rounded-lg">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span class="font-medium text-warning">⚡ ไฟเข้า</span>
            <span v-for="m in meters" :key="m.id" class="text-base-content/70">
              <span class="font-semibold text-warning">{{ m.tag }}</span>
              {{ meterLabel(m) }}<template v-if="m.electricPhase"> · {{ m.electricPhase }}</template>
            </span>
            <span v-if="!meters.length" class="text-base-content/50">ไม่มีข้อมูลมิเตอร์</span>
          </div>
          <div class="mt-1 h-0.5 rounded bg-warning/60" aria-hidden="true" />

          <!-- ตู้ -->
          <div class="flex flex-wrap justify-center gap-3 sm:justify-start">
            <CabinetBox
              v-for="c in cabinets" :key="c.key"
              :title="c.title" :status="c.status" :meter-tag="c.meterTag" :type-name="c.typeName"
              :batteries="c.batteries" :equipments="c.equipments" :selected-id="selectedId"
              @select="toggle"
            />
            <CabinetBox
              v-if="loose.batteries.length || loose.equipments.length"
              title="ไม่ระบุตู้" :status="null" :meter-tag="null" :type-name="null"
              :batteries="loose.batteries" :equipments="loose.equipments" :selected-id="selectedId"
              @select="toggle"
            />
          </div>
        </div>

        <div v-else class="rounded-lg border border-dashed border-base-300 py-8 text-center text-sm text-base-content/60">
          ยังไม่มีข้อมูลตู้ในสถานีนี้
        </div>

        <!-- รายละเอียดก้อนที่เลือก -->
        <div v-if="selected" class="rounded-lg border border-base-300 bg-base-200/50 p-3 text-sm">
          <div class="mb-2 flex items-center justify-between gap-2">
            <p class="font-semibold">
              {{ selectedCabinet }} · ช่องแบต {{ selected.bankCode ?? '—' }}
            </p>
            <button type="button" class="btn btn-ghost btn-xs" aria-label="ปิด" @click="selectedId = null">✕</button>
          </div>
          <p
            class="mb-2 font-medium"
            :class="{
              'text-success': sohTone(selected).tone === 'good',
              'text-warning': sohTone(selected).tone === 'warn',
              'text-error': ['bad', 'zero'].includes(sohTone(selected).tone),
              'text-base-content/70': sohTone(selected).tone === 'unknown',
            }"
          >{{ sohTone(selected).reason }}</p>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt class="text-base-content/60">ชนิด</dt><dd>{{ selected.typeName ?? '—' }}</dd>
            <dt class="text-base-content/60">ยี่ห้อ/รุ่น</dt><dd>{{ brandModel(selected.brand, selected.model) }}</dd>
            <dt class="text-base-content/60">ความจุ</dt>
            <dd>{{ num(selected.capacityAh, ' Ah') }}<template v-if="selected.voltageV !== null"> · {{ num(selected.voltageV, ' V') }}</template></dd>
            <dt class="text-base-content/60">สถานะ</dt><dd>{{ assetStatusLabel(selected.status) }}</dd>
            <dt class="text-base-content/60">ตรวจ PM ล่าสุด</dt>
            <dd>
              {{ selected.lastCheckDate ? formatDate(selected.lastCheckDate) : '—' }}
              <template v-if="selected.lastReadStatus"> · {{ READ_STATUS_LABEL[selected.lastReadStatus] ?? selected.lastReadStatus }}</template>
            </dd>
            <template v-if="selected.lastSohRemark">
              <dt class="text-base-content/60">หมายเหตุ SOH</dt><dd>{{ selected.lastSohRemark }}</dd>
            </template>
            <template v-if="selected.remark">
              <dt class="text-base-content/60">หมายเหตุ</dt><dd>{{ selected.remark }}</dd>
            </template>
          </dl>
        </div>

        <!-- สรุป + คำอธิบายสี -->
        <div v-if="!isEmpty" class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-base-300 pt-3 text-xs">
          <span class="font-medium">
            {{ cabinets.length }} ตู้ · แบต {{ summary.cells }} ก้อน
            <template v-if="summary.types.length"> ({{ summary.types.join(', ') }})</template>
            <template v-if="equipments.length"> · อุปกรณ์ {{ equipments.length }} รายการ</template>
            · {{ bands.length }} ย่าน
          </span>
          <span v-if="summary.faulty" class="text-error">✕ ชำรุด {{ summary.faulty }}</span>
          <span
            v-for="t in TONE_META" :key="t.tone"
            class="inline-flex items-center gap-1 text-base-content/70"
          >
            <span class="inline-block h-2.5 w-2.5 rounded-sm" :class="t.dot" />
            {{ t.label }} <b class="tabular-nums">{{ summary.counts[t.tone] }}</b>
          </span>
        </div>
      </template>
    </div>
  </section>
</template>

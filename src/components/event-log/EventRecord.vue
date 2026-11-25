<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import EventCellDialog from '@/components/event-log/EventCellDialog.vue'
import EventDayGrid from '@/components/event-log/EventDayGrid.vue'
import EventPasteDialog from '@/components/event-log/EventPasteDialog.vue'
import EventWeekNote from '@/components/event-log/EventWeekNote.vue'
import { errorMessage } from '@/lib/api'
import { cellKey, parseTsv, yesterdayOf } from '@/lib/event-log'
import { daysOf, formatDowDay } from '@/lib/iso-week'
import { getEventWeek, saveEventCells, type EventCell, type EventWeek, type EventWeekNote as WeekNote, type SaveCellsResult } from '@/services/event-log.api'

/** แท็บ "บันทึกรายวัน" — โหลดข้อมูลสัปดาห์ ถือสถานะของตาราง และต่อกล่องแก้/วาง/เติมปกติเข้าด้วยกัน */
const props = defineProps<{ weekStart: string }>()

const data = ref<EventWeek | null>(null)
const cells = ref<Map<string, EventCell>>(new Map())
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const grid = ref<InstanceType<typeof EventDayGrid> | null>(null)

const days = computed(() => daysOf(props.weekStart))
const canWriteAny = computed(() => data.value?.provinces.some((p) => p.canWrite) ?? false)

let seq = 0
async function load() {
  const my = ++seq
  loading.value = true
  error.value = null
  notice.value = null
  try {
    const res = await getEventWeek(props.weekStart)
    if (my !== seq) return // เปลี่ยนสัปดาห์ไปแล้ว ทิ้งผลเก่า
    data.value = res
    cells.value = new Map(res.cells.map((c) => [cellKey(c.provinceId, c.date), c]))
  } catch (err) {
    if (my === seq) error.value = errorMessage(err, 'โหลดบันทึกไม่สำเร็จ')
  } finally {
    if (my === seq) loading.value = false
  }
}

/** รับสถานะล่าสุดจาก BE ของช่องที่ส่งไป — ช่องที่ไม่อยู่ในผล = ว่าง */
function apply(result: SaveCellsResult, keys: string[]) {
  const next = new Map(cells.value)
  for (const k of keys) next.delete(k)
  for (const c of result.cells) next.set(cellKey(c.provinceId, c.date), c)
  cells.value = next
}

// ── กล่องแก้ทีละช่อง ──
const open = ref<{ row: number; col: number; text?: string } | null>(null)
const openProvince = computed(() => (open.value ? data.value?.provinces[open.value.row] ?? null : null))
const openDate = computed(() => (open.value ? days.value[open.value.col] ?? null : null))
/** จังหวัดถัดไปที่เขียนได้ในวันเดียวกัน */
const nextRow = computed(() => {
  const o = open.value
  if (!o || !data.value) return -1
  return data.value.provinces.findIndex((p, i) => i > o.row && p.canWrite)
})

async function closeCell() {
  const o = open.value
  open.value = null
  await nextTick()
  if (o) grid.value?.focusCell(o.row, o.col)
}

// ── วาง ──
const pasteAt = ref<{ text: string; row: number; col: number } | null>(null)
function onPaste(text: string, row: number, col: number) {
  const block = parseTsv(text)
  const single = block.length === 1 && block[0]!.length === 1
  const p = data.value?.provinces[row]
  const d = days.value[col]
  // ช่องเดียว = เปิดกล่องแก้ให้ดูก่อน ยังไม่บันทึก
  if (single && p?.canWrite && d && d <= data.value!.today) open.value = { row, col, text: block[0]![0]!.trim() }
  else pasteAt.value = { text, row, col }
}
function onPasted(result: SaveCellsResult, keys: string[]) {
  apply(result, keys)
  pasteAt.value = null
  report(keys.length, result)
}

function report(sent: number, result: SaveCellsResult) {
  const bad = result.conflicts.length
  notice.value = bad
    ? `บันทึก ${sent - bad} ช่อง · อีก ${bad} ช่องมีคนแก้ก่อนหน้า จึงไม่เขียนทับ (แสดงข้อความล่าสุดแล้ว)`
    : `บันทึก ${sent} ช่องแล้ว`
}

// ── เติมปกติทั้งวัน ──
const fillDate = ref<string | null>(null)
const fillProvinces = computed(() => (fillDate.value && data.value
  ? data.value.provinces.filter((p) => p.canWrite && !cells.value.has(cellKey(p.id, fillDate.value!)))
  : []))

async function fillNormal() {
  const date = fillDate.value
  if (!date || saving.value) return
  const list = fillProvinces.value
  saving.value = true
  error.value = null
  try {
    const result = await saveEventCells(list.map((p) => ({ provinceId: p.id, date, text: 'ปกติ', rev: null })))
    apply(result, list.map((p) => cellKey(p.id, date)))
    report(list.length, result)
  } catch (err) {
    error.value = errorMessage(err, 'เติมปกติไม่สำเร็จ')
  } finally {
    saving.value = false
    fillDate.value = null
  }
}

function onWeekNote(note: WeekNote | null) {
  if (data.value) data.value = { ...data.value, weekNote: note }
}

function closeAll() {
  open.value = null
  pasteAt.value = null
  fillDate.value = null
}

// อยู่ท้ายสุดเพราะ immediate รันทันที — ย้ายขึ้นไปก่อน ref ของกล่องต่าง ๆ จะพังทั้งแท็บ (ใช้ก่อนประกาศ)
watch(() => props.weekStart, () => { closeAll(); void load() }, { immediate: true })
</script>

<template>
  <div v-if="error" role="alert" class="alert alert-error mb-3 text-sm">
    {{ error }}
    <button type="button" class="btn btn-ghost btn-xs" @click="load">ลองใหม่</button>
  </div>
  <div v-if="notice" role="status" class="alert mb-3 text-sm">
    {{ notice }}
    <button type="button" class="btn btn-ghost btn-xs" @click="notice = null">ปิด</button>
  </div>
  <p v-if="loading && !data" class="text-sm opacity-70">กำลังโหลด…</p>

  <template v-if="data">
    <EventWeekNote :week-start="weekStart" :note="data.weekNote" :can-write="data.canWriteWeekNote" @saved="onWeekNote" />

    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs opacity-60">
        <template v-if="canWriteAny">กดช่องเพื่อบันทึก · ลูกศรเลื่อนช่อง · Ctrl+V วางบล็อกจาก Google Sheet · </template>
        ช่องว่าง = ยังไม่บันทึก (ไม่นับเป็นปกติ)
      </p>
      <div class="flex gap-2">
        <button v-if="canWriteAny" type="button" class="btn btn-sm" @click="pasteAt = { text: '', row: 0, col: 0 }">วางจาก Google Sheet</button>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" @click="load">โหลดใหม่</button>
      </div>
    </div>

    <EventDayGrid
      ref="grid" :provinces="data.provinces" :days="days" :today="data.today" :cells="cells" :busy="loading || saving"
      @open="(row, col) => { open = { row, col } }" @fill="(d) => { fillDate = d }" @paste="onPaste"
    />

    <EventCellDialog
      v-if="open && openProvince && openDate" :key="`${open.row}-${open.col}`"
      :province="openProvince" :date="openDate" :cell="cells.get(cellKey(openProvince.id, openDate)) ?? null"
      :initial-text="open.text" :yesterday="cells.get(cellKey(openProvince.id, yesterdayOf(openDate))) ?? null"
      :can-write="openProvince.canWrite" :has-next="nextRow >= 0"
      @close="closeCell" @next="open = { row: nextRow, col: open!.col }"
      @saved="(r) => apply(r, [cellKey(openProvince!.id, openDate!)])"
    />

    <EventPasteDialog
      v-if="pasteAt" :provinces="data.provinces" :days="days" :today="data.today" :cells="cells"
      :initial-text="pasteAt.text" :start="{ row: pasteAt.row, col: pasteAt.col }"
      @close="pasteAt = null" @saved="onPasted"
    />

    <div v-if="fillDate" class="modal modal-open" role="dialog" aria-modal="true" @click.self="!saving && (fillDate = null)">
      <div class="modal-box max-w-md">
        <h3 class="text-lg font-semibold">เติม "ปกติ" · {{ formatDowDay(fillDate) }}</h3>
        <p class="mt-2 text-sm">
          ใส่ "ปกติ" ให้ {{ fillProvinces.length }} จังหวัดที่ยังว่าง: {{ fillProvinces.map((p) => p.code).join(', ') }}
        </p>
        <p class="mt-1 text-xs opacity-60">ช่องที่บันทึกไว้แล้วไม่ถูกแตะ</p>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="fillDate = null">ยกเลิก</button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="saving || !fillProvinces.length" @click="fillNormal">
            <span v-if="saving" class="loading loading-spinner loading-xs" /> เติมปกติ
          </button>
        </div>
      </div>
    </div>
  </template>
</template>

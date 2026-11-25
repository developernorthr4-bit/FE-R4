<script setup lang="ts">
import { computed, ref } from 'vue'
import { errorMessage } from '@/lib/api'
import { cellKey, cellText, mapPaste, parseTsv } from '@/lib/event-log'
import { formatDowDay } from '@/lib/iso-week'
import { saveEventCells, type EventCell, type EventProvince, type SaveCellsResult } from '@/services/event-log.api'

/**
 * วางบล็อกจาก Google Sheet / Excel — แสดงก่อนเสมอว่าจะเขียนช่องไหนทับอะไร แล้วค่อยยืนยัน
 * (ข้อความหลายบรรทัดจากที่อื่น เช่น LINE จะถูกอ่านเป็นหลายแถว ถ้าเขียนทันทีจะไหลลงหลายจังหวัด)
 */
const props = defineProps<{
  provinces: (EventProvince & { canWrite: boolean })[]
  days: string[]
  today: string
  cells: Map<string, EventCell>
  initialText: string
  start: { row: number; col: number }
}>()
const emit = defineEmits<{ close: []; saved: [result: SaveCellsResult, keys: string[]] }>()

const raw = ref(props.initialText)
const saving = ref(false)
const error = ref<string | null>(null)

const provById = computed(() => new Map(props.provinces.map((p) => [p.id, p])))
const mapped = computed(() =>
  raw.value.trim() ? mapPaste(parseTsv(raw.value), props.provinces, props.days, props.start) : null)

const plan = computed(() => {
  const fresh: { key: string; provinceId: number; date: string; text: string; before: string }[] = []
  const replace: typeof fresh = []
  let same = 0
  let noScope = 0
  let future = 0
  for (const t of mapped.value?.targets ?? []) {
    if (!provById.value.get(t.provinceId)?.canWrite) { noScope++; continue }
    if (t.date > props.today) { future++; continue }
    const key = cellKey(t.provinceId, t.date)
    const cur = props.cells.get(key)
    const before = cellText(cur)
    if (cur && before.trim() === t.text) { same++; continue }
    ;(cur ? replace : fresh).push({ ...t, key, before })
  }
  const skipped = [...(mapped.value?.skipped ?? [])]
  if (noScope) skipped.push(`จังหวัดที่คุณไม่มีสิทธิ์แก้ ${noScope} ช่อง`)
  if (future) skipped.push(`วันที่ยังไม่ถึง ${future} ช่อง`)
  return { fresh, replace, same, skipped }
})
const total = computed(() => plan.value.fresh.length + plan.value.replace.length)

async function save() {
  if (!total.value || saving.value) return
  saving.value = true
  error.value = null
  const rows = [...plan.value.fresh, ...plan.value.replace]
  try {
    const result = await saveEventCells(rows.map((r) => ({
      provinceId: r.provinceId, date: r.date, text: r.text, rev: props.cells.get(r.key)?.rev ?? null,
    })))
    emit('saved', result, rows.map((r) => r.key))
  } catch (err) {
    error.value = errorMessage(err, 'วางไม่สำเร็จ ยังไม่มีช่องไหนถูกเขียน')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="modal modal-open" role="dialog" aria-modal="true" @click.self="!saving && !raw.trim() && emit('close')" @keydown.esc="!saving && emit('close')">
    <div class="modal-box max-w-3xl">
      <h3 class="text-lg font-semibold">วางจาก Google Sheet / Excel</h3>
      <p class="mt-1 text-xs opacity-60">
        คัดลอกทั้งตารางรวมคอลัมน์ Province และหัววันที่ได้เลย ระบบจับตามรหัสจังหวัดและวันที่ให้ ·
        ถ้าคัดลอกแค่ข้อความ จะเริ่มที่ช่อง {{ provinces[start.row]?.code }} {{ days[start.col] ? formatDowDay(days[start.col]!) : '' }} ·
        ช่องว่างในบล็อกไม่ล้างของเดิม
      </p>

      <textarea
        v-model="raw" rows="4" class="textarea textarea-bordered mt-3 w-full font-mono text-xs" aria-label="ข้อความที่คัดลอกมา"
        placeholder="กด Ctrl+V ที่นี่"
      />

      <template v-if="mapped">
        <div class="mt-3 flex flex-wrap gap-2 text-sm">
          <span class="badge badge-neutral">ใหม่ {{ plan.fresh.length }} ช่อง</span>
          <span class="badge" :class="plan.replace.length ? 'badge-warning' : 'badge-ghost'">เขียนทับ {{ plan.replace.length }} ช่อง</span>
          <span class="badge badge-ghost">เหมือนเดิม {{ plan.same }} ช่อง</span>
          <span class="badge badge-ghost">จับแถวตาม{{ mapped.byCode ? 'รหัสจังหวัด' : 'ตำแหน่ง' }}</span>
          <span class="badge badge-ghost">จับวันตาม{{ mapped.byDate ? 'หัววันที่' : 'ตำแหน่ง' }}</span>
        </div>
        <ul v-if="plan.skipped.length" class="mt-2 list-disc pl-5 text-sm text-base-content/70">
          <li v-for="s in plan.skipped" :key="s">ไม่วาง: {{ s }}</li>
        </ul>

        <div v-if="total" class="mt-3 max-h-64 overflow-auto rounded border border-base-300">
          <table class="table table-xs">
            <thead><tr><th>ช่อง</th><th>เดิม</th><th>จะเป็น</th></tr></thead>
            <tbody>
              <tr v-for="r in [...plan.replace, ...plan.fresh]" :key="r.key" class="align-top">
                <td class="whitespace-nowrap">{{ provById.get(r.provinceId)?.code }} {{ formatDowDay(r.date) }}</td>
                <td class="whitespace-pre-line" :class="r.before ? '' : 'opacity-50'">{{ r.before || '(ว่าง)' }}</td>
                <td class="whitespace-pre-line">{{ r.text }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <div v-if="error" role="alert" class="alert alert-error mt-3 text-sm">{{ error }}</div>

      <div class="modal-action">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="emit('close')">ยกเลิก</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="!total || saving" @click="save">
          <span v-if="saving" class="loading loading-spinner loading-xs" />
          บันทึก {{ total }} ช่อง
        </button>
      </div>
    </div>
  </div>
</template>

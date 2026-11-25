<script setup lang="ts">
import { computed, ref } from 'vue'
import { Star } from 'lucide-vue-next'
import { cellKey, cellText } from '@/lib/event-log'
import { dowOf, formatDayMonth } from '@/lib/iso-week'
import type { EventCell, EventProvince } from '@/services/event-log.api'

/**
 * ตารางบันทึก 15 จังหวัด × จันทร์–อาทิตย์ — แสดงผลและส่งเหตุการณ์อย่างเดียว ไม่เขียนข้อมูลเอง
 * ลูกศรบนคีย์บอร์ดเลื่อนช่อง · Enter เปิดช่อง · Ctrl+V วางบล็อกจาก Google Sheet เริ่มที่ช่องที่โฟกัส
 */
const props = defineProps<{
  provinces: (EventProvince & { canWrite: boolean })[]
  days: string[]
  today: string
  cells: Map<string, EventCell>
  busy: boolean
}>()
const emit = defineEmits<{
  open: [row: number, col: number]
  fill: [date: string]
  paste: [text: string, row: number, col: number]
}>()

const box = ref<HTMLElement | null>(null)
const cellOf = (provinceId: number, date: string) => props.cells.get(cellKey(provinceId, date))
const isFuture = (date: string) => date > props.today

const recordedOf = (date: string) => props.provinces.filter((p) => cellOf(p.id, date)).length
/** ช่องว่างของวันนั้นที่คนนี้เขียนได้ — 0 = ไม่ต้องโชว์ปุ่มเติมปกติ */
const fillable = (date: string) =>
  isFuture(date) ? 0 : props.provinces.filter((p) => p.canWrite && !cellOf(p.id, date)).length
const canWriteAny = computed(() => props.provinces.some((p) => p.canWrite))

function tone(c: EventCell | undefined, future: boolean): string {
  if (future) return 'bg-base-200 opacity-50'
  if (!c) return 'border border-dashed border-base-content/30'
  if (c.isNormal) return 'bg-base-200'
  return c.isHighlight ? 'border-l-4 border-error bg-error/10' : 'border-l-4 border-warning bg-warning/10'
}

function title(p: EventProvince, date: string, c: EventCell | undefined): string {
  const head = `${p.nameTh} ${dowOf(date)} ${formatDayMonth(date)}`
  if (isFuture(date)) return `${head} — ยังไม่ถึงวัน`
  return c ? `${head}\n${cellText(c)}` : `${head} — ยังไม่บันทึก`
}

function focusCell(row: number, col: number) {
  box.value?.querySelector<HTMLElement>(`[data-cell="${row}-${col}"]`)?.focus()
}

function onKey(e: KeyboardEvent, row: number, col: number) {
  const step: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
  const s = step[e.key]
  if (!s) return
  e.preventDefault()
  focusCell(row + s[0], col + s[1])
}

function onPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text/plain')
  if (!text?.trim() || !canWriteAny.value) return
  const at = (document.activeElement as HTMLElement | null)?.dataset?.cell?.split('-').map(Number)
  e.preventDefault()
  emit('paste', text, at?.[0] ?? 0, at?.[1] ?? 0)
}

defineExpose({ focusCell })
</script>

<template>
  <!-- ช่องที่ปัก (sticky) ต้อง z-[1] และ thead ต้อง z-[2] — ดูกับดัก table-pin ใน CLAUDE.md -->
  <div
    ref="box" class="max-h-[78vh] overflow-auto rounded-lg border border-base-300 bg-base-100"
    :class="busy ? 'opacity-60' : ''" @paste="onPaste"
  >
    <table class="w-full min-w-[68rem] table-fixed border-separate border-spacing-0 text-sm">
      <thead class="sticky top-0 z-[2] bg-base-100">
        <tr>
          <th class="sticky left-0 z-[1] w-24 border-b border-base-300 bg-base-100 px-3 py-2 text-left font-medium">จังหวัด</th>
          <th
            v-for="d in days" :key="d"
            class="border-b border-base-300 px-2 py-2 text-left align-top font-medium"
            :class="d === today ? 'bg-primary/10' : ''"
          >
            <div class="flex items-baseline justify-between gap-1">
              <span :class="isFuture(d) ? 'opacity-50' : ''">
                {{ dowOf(d) }} {{ formatDayMonth(d) }}
                <span v-if="d === today" class="text-xs font-normal text-primary">วันนี้</span>
              </span>
              <span v-if="!isFuture(d)" class="text-xs font-normal tabular-nums opacity-60">
                {{ recordedOf(d) }}/{{ provinces.length }}
              </span>
            </div>
            <button
              v-if="fillable(d)" type="button" class="btn btn-ghost btn-xs mt-1 -ml-2 font-normal" :disabled="busy"
              :title="`ใส่ ปกติ ให้ ${fillable(d)} จังหวัดที่ยังว่าง`" @click="emit('fill', d)"
            >
              เติม "ปกติ" ช่องว่าง
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(p, row) in provinces" :key="p.id">
          <th
            scope="row"
            class="sticky left-0 z-[1] border-b border-base-200 bg-base-100 px-3 py-1 text-left align-top font-medium"
          >
            <div>{{ p.code }}</div>
            <div class="text-xs font-normal opacity-60">{{ p.nameTh }}</div>
          </th>
          <td
            v-for="(d, col) in days" :key="d"
            class="h-px border-b border-base-200 p-1 align-top" :class="d === today ? 'bg-primary/5' : ''"
          >
            <button
              type="button" :data-cell="`${row}-${col}`" :disabled="isFuture(d)"
              class="block h-full min-h-12 w-full rounded px-2 py-1 text-left text-xs leading-snug hover:ring-1 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:hover:ring-0"
              :class="tone(cellOf(p.id, d), isFuture(d))"
              :title="title(p, d, cellOf(p.id, d))"
              @click="emit('open', row, col)" @keydown="onKey($event, row, col)"
            >
              <template v-if="cellOf(p.id, d)">
                <Star
                  v-if="cellOf(p.id, d)!.isHighlight" class="mr-1 inline size-3 fill-current text-error" aria-label="เหตุเด่น"
                />
                <span
                  class="line-clamp-4 whitespace-pre-line"
                  :class="cellOf(p.id, d)!.isNormal && !cellOf(p.id, d)!.note ? 'text-base-content/60' : ''"
                >{{ cellText(cellOf(p.id, d)) }}</span>
              </template>
              <span v-else-if="!isFuture(d)" class="text-base-content/50">{{ p.canWrite ? '+ บันทึก' : '—' }}</span>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

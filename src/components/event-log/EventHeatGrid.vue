<script setup lang="ts">
import { computed } from 'vue'
import { Check, Star } from 'lucide-vue-next'
import { cellKey, cellText, STATE_LABEL, stateOf, type CellState } from '@/lib/event-log'
import { dowOf, formatDayMonth } from '@/lib/iso-week'
import type { EventDashCell, EventProvince } from '@/services/event-log.api'

/**
 * ตารางสี 15 จังหวัด × 7 วัน — ปกติ / มีเหตุ / เหตุหนัก / ยังไม่บันทึก
 *
 * สีไม่ใช่ตัวสื่อความหมายอย่างเดียว: เหตุหนัก = พื้นทึบ + SA1/SA2/★ ในช่อง · มีเหตุ = พื้นอ่อน + ขอบ ·
 * ปกติ = เครื่องหมายถูกจาง · ยังไม่บันทึก = เส้นประ (เหลืองกับแดงแยกยากสำหรับคนตาบอดสีเขียว)
 * มีตัวกรองหมวด = ช่องที่ไม่เข้าหมวดจางลง ไม่หายไป จะได้ไม่เข้าใจผิดว่าไม่มีบันทึก
 */
const props = defineProps<{
  provinces: EventProvince[]
  days: string[]
  today: string
  cells: EventDashCell[]
  category: number | null
}>()
const emit = defineEmits<{ open: [provinceId: number, date: string] }>()

const map = computed(() => new Map(props.cells.map((c) => [cellKey(c.provinceId, c.date), c])))
const at = (p: number, d: string) => map.value.get(cellKey(p, d))
const match = (c: EventDashCell | undefined) =>
  props.category === null || (!!c && !c.isNormal && c.categories.includes(props.category))

const TONE: Record<CellState, string> = {
  normal: 'bg-base-200 text-base-content/60',
  event: 'border border-warning bg-warning/25 text-base-content',
  heavy: 'bg-error text-error-content font-semibold',
  empty: 'border border-dashed border-base-content/30',
}
const LEGEND: CellState[] = ['heavy', 'event', 'normal', 'empty']

const eventsOf = (list: (EventDashCell | undefined)[]) => list.filter((c) => c && !c.isNormal && match(c)).length
const rowCount = (p: number) => eventsOf(props.days.map((d) => at(p, d)))
const colCount = (d: string) => eventsOf(props.provinces.map((p) => at(p.id, d)))

function label(c: EventDashCell | undefined): string {
  if (!c || c.isNormal) return ''
  if (c.sa === 1 || c.sa === 2) return `SA${c.sa}`
  return ''
}
function title(p: EventProvince, d: string): string {
  const c = at(p.id, d)
  const head = `${p.nameTh} ${dowOf(d)} ${formatDayMonth(d)}`
  if (d > props.today) return `${head} — ยังไม่ถึงวัน`
  return c ? `${head}\n${cellText(c)}` : `${head} — ยังไม่บันทึก`
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full min-w-[30rem] border-separate border-spacing-0.5 text-xs">
      <thead>
        <tr>
          <th class="w-12 text-left font-normal opacity-60">จังหวัด</th>
          <th v-for="d in days" :key="d" class="px-1 pb-1 text-center font-normal" :class="d === today ? 'text-primary' : 'opacity-70'">
            {{ dowOf(d) }}<br>{{ formatDayMonth(d) }}
          </th>
          <th class="w-10 text-right font-normal opacity-60">เหตุ</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in provinces" :key="p.id">
          <th scope="row" class="text-left font-medium" :title="p.nameTh">{{ p.code }}</th>
          <td v-for="d in days" :key="d" class="p-0">
            <div v-if="d > today" class="h-7 rounded bg-base-200/50" :title="title(p, d)" />
            <button
              v-else type="button"
              class="flex h-7 w-full items-center justify-center gap-0.5 rounded hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              :class="[TONE[stateOf(at(p.id, d))], match(at(p.id, d)) ? '' : 'opacity-25']"
              :title="title(p, d)" :aria-label="`${title(p, d)} (${STATE_LABEL[stateOf(at(p.id, d))]})`"
              @click="emit('open', p.id, d)"
            >
              <Star v-if="at(p.id, d)?.isHighlight" class="size-3 fill-current" aria-hidden="true" />
              <Check v-else-if="at(p.id, d)?.isNormal" class="size-3" aria-hidden="true" />
              <span v-if="label(at(p.id, d))">{{ label(at(p.id, d)) }}</span>
            </button>
          </td>
          <td class="text-right tabular-nums">{{ rowCount(p.id) || '–' }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" class="pt-1 text-left font-normal opacity-60">รวม</th>
          <td v-for="d in days" :key="d" class="pt-1 text-center tabular-nums opacity-70">{{ d > today ? '' : colCount(d) }}</td>
          <td class="pt-1 text-right font-medium tabular-nums">{{ eventsOf(cells) }}</td>
        </tr>
      </tfoot>
    </table>
  </div>
  <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
    <li v-for="s in LEGEND" :key="s" class="flex items-center gap-1.5">
      <span class="flex size-4 items-center justify-center rounded-sm" :class="TONE[s]" aria-hidden="true">
        <Star v-if="s === 'heavy'" class="size-2.5 fill-current" />
        <Check v-else-if="s === 'normal'" class="size-2.5" />
      </span>
      {{ STATE_LABEL[s] }}
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TrendPoint } from '../../services/reports.api'

/**
 * กราฟเส้นซีรีส์เดียว 8 สัปดาห์
 *
 * เขียนเป็น SVG เองแทนที่จะใช้ chart.js เพราะ chart.js วาดลง canvas ด้วยค่าสี
 * ที่ resolve แล้ว พอผู้ใช้สลับ light/dark ธีม DaisyUI เปลี่ยนผ่าน CSS variable
 * แต่ canvas ไม่รู้ ต้องเขียน watcher คอย re-render เอง
 * ส่วน SVG ใช้ currentColor/คลาสของธีมได้ตรง ๆ เปลี่ยนตามเอง
 *
 * ซีรีส์เดียวจึงไม่มี legend — หัวข้อการ์ดบอกอยู่แล้วว่าพล็อตอะไร
 */
const props = defineProps<{ points: TrendPoint[]; currentWeek: number }>()

const W = 720
const H = 180
const PAD = { top: 16, right: 16, bottom: 26, left: 34 }

const hover = ref<number | null>(null)

const max = computed(() => Math.max(...props.points.map((p) => p.eventCount), 1))

/** ปัดเพดานแกน y ขึ้นเป็นเลขกลม ๆ — 16 → 20, 7 → 10 */
const yMax = computed(() => {
  const m = max.value
  const step = m <= 5 ? 1 : m <= 20 ? 5 : m <= 50 ? 10 : 25
  return Math.ceil(m / step) * step
})

const ticks = computed(() => {
  const n = 3
  return Array.from({ length: n + 1 }, (_, i) => Math.round((yMax.value / n) * i))
})

const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom

function x(i: number): number {
  if (props.points.length <= 1) return PAD.left + plotW / 2
  return PAD.left + (i / (props.points.length - 1)) * plotW
}

function y(v: number): number {
  return PAD.top + plotH - (v / yMax.value) * plotH
}

const linePath = computed(() =>
  props.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.eventCount).toFixed(1)}`).join(' '),
)

/** พื้นที่ใต้เส้น — ปิดกลับลงมาที่เส้นฐานเพื่อให้ระบายได้ */
const areaPath = computed(() => {
  if (!props.points.length) return ''
  const last = props.points.length - 1
  return `${linePath.value} L${x(last).toFixed(1)},${PAD.top + plotH} L${x(0).toFixed(1)},${PAD.top + plotH} Z`
})

const active = computed(() => (hover.value === null ? null : props.points[hover.value] ?? null))

/** จับตำแหน่งเมาส์เป็นดัชนีจุดที่ใกล้ที่สุด — hit target กว้างกว่าตัวจุดมาก */
function onMove(e: MouseEvent) {
  const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
  const px = ((e.clientX - rect.left) / rect.width) * W
  let best = 0
  let bestD = Infinity
  props.points.forEach((_, i) => {
    const d = Math.abs(x(i) - px)
    if (d < bestD) { bestD = d; best = i }
  })
  hover.value = best
}
</script>

<template>
  <div class="relative">
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      class="w-full"
      role="img"
      aria-label="จำนวนเหตุการณ์ราย 8 สัปดาห์ล่าสุด"
      @mousemove="onMove"
      @mouseleave="hover = null"
    >
      <!-- เส้นกริดบาง 1px ไม่ประ ถอยไปอยู่หลังข้อมูล -->
      <g class="text-base-300">
        <line
          v-for="t in ticks" :key="`g${t}`"
          :x1="PAD.left" :x2="W - PAD.right" :y1="y(t)" :y2="y(t)"
          stroke="currentColor" stroke-width="1"
        />
      </g>
      <g class="fill-base-content text-[11px] opacity-50">
        <text v-for="t in ticks" :key="`t${t}`" :x="PAD.left - 6" :y="y(t) + 4" text-anchor="end">
          {{ t }}
        </text>
      </g>

      <path :d="areaPath" class="fill-primary" opacity="0.1" />
      <path
        :d="linePath" fill="none" class="stroke-primary"
        stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
      />

      <!-- จุดปลายเส้น: r=4 (8px) พร้อมวงแหวนสีพื้นผิว 2px ให้เด่นเมื่อทับเส้น -->
      <circle
        v-if="points.length"
        :cx="x(points.length - 1)" :cy="y(points[points.length - 1]!.eventCount)"
        r="4" class="fill-primary stroke-base-100" stroke-width="2"
      />

      <!-- เส้นชี้ตำแหน่ง + จุดที่กำลังชี้ -->
      <template v-if="hover !== null && active">
        <line
          :x1="x(hover)" :x2="x(hover)" :y1="PAD.top" :y2="PAD.top + plotH"
          class="stroke-base-content" stroke-width="1" opacity="0.25"
        />
        <circle
          :cx="x(hover)" :cy="y(active.eventCount)"
          r="4" class="fill-primary stroke-base-100" stroke-width="2"
        />
      </template>

      <g class="fill-base-content text-[11px] opacity-50">
        <text
          v-for="(p, i) in points" :key="`x${p.year}-${p.week}`"
          :x="x(i)" :y="H - 8" text-anchor="middle"
          :class="p.week === currentWeek ? 'opacity-100 font-medium' : ''"
        >
          W{{ p.week }}
        </text>
      </g>
    </svg>

    <div
      v-if="active"
      class="pointer-events-none absolute top-2 rounded-box border border-base-300 bg-base-100 px-3 py-2 text-xs shadow-lg"
      :style="{ left: `${Math.min(Math.max((x(hover!) / W) * 100, 6), 78)}%` }"
    >
      <p class="font-medium">สัปดาห์ที่ {{ active.week }} / {{ active.year }}</p>
      <p class="mt-0.5 opacity-70">เหตุการณ์ {{ active.eventCount }} · ยังไม่ปิด {{ active.openCount }}</p>
    </div>
  </div>
</template>

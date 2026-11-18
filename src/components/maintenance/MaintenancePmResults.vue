<script setup lang="ts">
import { computed } from 'vue'
import ProgressList from '@/components/charts/ProgressList.vue'
import StatTile from '@/components/charts/StatTile.vue'
import { measurementBreakdown, num, pctOf, type PmSummary } from '@/services/maintenance.api'

/**
 * ส่วนที่ 2 ของหน้า /maintenance — ผลการตรวจ PM ของปีงบที่เลือก
 * แสดงผลอย่างเดียว ตัวเลือกปีงบ + loading/error อยู่ที่หน้าแม่
 */
const props = defineProps<{ pm: PmSummary }>()
const pm = computed(() => props.pm)

/** เรียงช่วง SOH เอง — BE group by ไม่รับประกันลำดับ และ 90-100 ต้องมาก่อนเสมอ */
const SOH_ORDER = ['90-100', '80-89', '70-79', '50-69', '1-49']

const pmPct = computed(() => {
  const p = pm.value?.progress
  if (!p || p.cabinetsTotal === 0) return 0
  return Math.round((p.done / p.cabinetsTotal) * 100)
})

const sohBuckets = computed(() => {
  const b = pm.value?.batteries
  if (!b) return []
  return SOH_ORDER
    .map((bucket) => ({ bucket, n: b.buckets.find((x) => x.bucket === bucket)?.n ?? 0 }))
    .filter((x) => x.n > 0)
})

/** ห้าหมวดของการวัด ต้องบวกกันได้เท่าจำนวนก้อนทั้งหมด — ดู measurementBreakdown */
const measurement = computed(() => (pm.value ? measurementBreakdown(pm.value.batteries) : []))
</script>

<template>
  <!-- ความคืบหน้าการตรวจ -->
  <div class="card border border-base-300 bg-base-100">
    <div class="card-body gap-3">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="card-title text-base">ความคืบหน้าการตรวจ</h3>
        <span class="text-sm opacity-70">
          นับเฉพาะตู้ที่ยังใช้งานอยู่ในสถานีที่ยังไม่ถูกลบ
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <span class="text-3xl font-semibold tabular-nums">
          {{ num(pm.progress.done) }}<span
            class="text-base opacity-50"
          >/{{ num(pm.progress.cabinetsTotal) }}</span>
        </span>
        <span class="text-sm opacity-70">ตู้ที่ตรวจแล้วในปีงบนี้</span>
        <progress
          class="progress w-40"
          :class="pmPct >= 80 ? 'progress-success' : pmPct >= 40 ? 'progress-warning' : 'progress-error'"
          :value="pm.progress.done" :max="Math.max(pm.progress.cabinetsTotal, 1)"
        />
        <span class="text-sm tabular-nums opacity-70">{{ pmPct }}%</span>
      </div>

      <p class="text-xs opacity-60">ตัวเลขคือ ตรวจแล้ว/ทั้งหมด · เรียงจากจังหวัดที่ค้างมากที่สุด</p>
      <ProgressList :items="pm.progress.provinces" empty-text="ยังไม่มีตู้ในระบบ" />
    </div>
  </div>

  <!-- ตัวเลขที่ต้องลงมือ -->
  <div class="mt-4 grid gap-3 sm:grid-cols-3">
    <StatTile
      label="SOH เฉลี่ย" :value="pm.batteries.avgSoh === null ? '—' : `${pm.batteries.avgSoh}%`"
      good-when="neutral"
      :hint="`จาก ${num(pm.batteries.readable)} ก้อนที่วัดได้ค่าจริง`"
    />
    <StatTile
      label="SOH ต่ำกว่า 70%" :value="pm.batteries.lowSoh" good-when="neutral"
      hint="ก้อนที่วัดได้ค่าและค่าต่ำจริง ไม่รวมก้อนที่วัดได้ 0"
    />
    <StatTile
      label="ตำหนิทางกายภาพ" :value="pm.batteries.defectBanks" good-when="neutral"
      :hint="pm.batteries.defects.map((d) => `${d.name} ${d.n}`).join(' · ') || 'ไม่พบตำหนิ'"
    />
  </div>

  <!--
    เตือนเรื่องที่ตัวเลข SOH ตอบไม่ได้
    แบตบวมรายงาน SOH 99% ได้สบาย ๆ ถ้าดูแต่ค่า SOH จะพลาดของที่อันตรายที่สุด
  -->
  <div
    v-if="pm.batteries.defectBanks" role="note"
    class="alert alert-warning mt-3 py-2 text-sm"
  >
    <span>
      ตำหนิทางกายภาพเป็นคนละเรื่องกับ SOH — แบตที่บวมหรือมีขี้เกลือยังรายงาน SOH สูงได้ตามปกติ
      ค่า SOH จึงมองไม่เห็นความเสี่ยงกลุ่มนี้
    </span>
  </div>

  <div class="mt-4 grid gap-4 lg:grid-cols-2">
    <!-- การกระจาย SOH -->
    <div class="card border border-base-300 bg-base-100">
      <div class="card-body">
        <h3 class="card-title text-base">การกระจายค่า SOH</h3>
        <p class="text-xs opacity-60">
          เฉพาะ {{ num(pm.batteries.readable) }} ก้อนที่วัดได้ค่าจริง
        </p>
        <div class="mt-2 overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr><th>ช่วง SOH</th><th class="text-right">ก้อน</th><th class="text-right">สัดส่วน</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in sohBuckets" :key="s.bucket">
                <td>{{ s.bucket }}%</td>
                <td class="text-right tabular-nums">{{ num(s.n) }}</td>
                <td class="text-right tabular-nums opacity-70">
                  {{ pctOf(s.n, pm.batteries.readable) }}
                </td>
              </tr>
              <tr v-if="!sohBuckets.length">
                <td colspan="3" class="text-center opacity-60">ยังไม่มีค่าที่วัดได้</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- แยกตามชนิดแบต -->
    <div class="card border border-base-300 bg-base-100">
      <div class="card-body">
        <h3 class="card-title text-base">SOH แยกตามชนิดแบตเตอรี่</h3>
        <p class="text-xs opacity-60">ค่าเฉลี่ยคิดเฉพาะก้อนที่วัดได้ค่าจริง</p>
        <div class="mt-2 overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>ชนิด</th>
                <th class="text-right">ก้อน</th>
                <th class="text-right">SOH เฉลี่ย</th>
                <th class="text-right">ต่ำกว่า 70%</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in pm.batteries.byType" :key="t.code">
                <td>{{ t.name }}</td>
                <td class="text-right tabular-nums">{{ num(t.banks) }}</td>
                <td class="text-right tabular-nums">{{ t.avgSoh === null ? '—' : `${t.avgSoh}%` }}</td>
                <td class="text-right tabular-nums" :class="t.lowSoh > 0 ? 'text-warning' : ''">
                  {{ t.lowSoh }}
                </td>
              </tr>
              <tr v-if="!pm.batteries.byType.length">
                <td colspan="4" class="text-center opacity-60">ยังไม่มีข้อมูล</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!--
    คุณภาพของข้อมูลที่วัดมา
    แถบนี้เรนเดอร์จากรายการเดียวที่บวกกันได้เท่ายอดทั้งหมดเสมอ ไม่ใช่จาก
    ตัวเลขที่หยิบมาทีละตัว — ตอนทำครั้งแรกลืมหมวด "ไม่ได้วัด" ไป 1,954 ก้อน
    แล้วไม่มีอะไรบนหน้าจอบอกว่าข้อมูลหายไป 10%
  -->
  <div class="card mt-4 border border-base-300 bg-base-100">
    <div class="card-body gap-3">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="card-title text-base">คุณภาพของข้อมูลที่วัดมา</h3>
        <span class="text-sm opacity-70">
          แบต {{ num(pm.batteries.banks) }} ก้อนในผลตรวจล่าสุด
        </span>
      </div>

      <div class="flex h-4 w-full overflow-hidden rounded-sm bg-base-200">
        <span
          v-for="m in measurement" :key="m.key" :class="m.tone"
          :style="{ width: `${(m.n / Math.max(pm.batteries.banks, 1)) * 100}%` }"
          :title="`${m.label} ${num(m.n)}`"
        />
      </div>

      <ul class="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <li v-for="m in measurement" :key="m.key" class="flex items-center gap-2">
          <span class="size-2.5 rounded-sm" :class="m.tone" />
          <span>{{ m.label }}</span>
          <span class="tabular-nums opacity-70">
            {{ num(m.n) }} ({{ pctOf(m.n, pm.batteries.banks) }})
          </span>
        </li>
      </ul>

      <p class="text-xs opacity-60">
        <b>ไม่ได้วัด</b> คือไม่มีค่า SOH และไม่มีหมายเหตุ ต่างจาก <b>วัดได้ 0</b>
        ซึ่งมีเลข 0 อยู่จริงแต่ไม่มีหมายเหตุกำกับ — ข้อมูลที่มีแยกไม่ออกว่าแบตตาย
        หรือช่างข้ามช่องไป จึงไม่ถูกนับรวมเป็น &quot;SOH ต่ำ&quot; และไม่ถูกเอาไปหารค่าเฉลี่ย
      </p>

      <p v-if="pm.cabinets.withoutBattery" class="text-xs opacity-60">
        อีก {{ num(pm.cabinets.withoutBattery) }} ตู้ที่ตรวจแล้วไม่มีแบตสักก้อน
        — ระบุเหตุผลไว้ {{ num(pm.cabinets.withoutBatteryReasonGiven) }} ตู้
        (ส่วนใหญ่เป็นตู้ 8U ที่ใช้แบตร่วมกับตู้หลัก) ที่เหลือไม่ระบุ
        จึงแยกไม่ออกว่าไม่มีจริงหรือไม่ได้กรอก
      </p>
    </div>
  </div>

  <!-- จังหวัดที่ต้องตามงาน -->
  <div class="card mt-4 border border-base-300 bg-base-100">
    <div class="card-body">
      <h3 class="card-title text-base">จังหวัดที่มีของน่าห่วง</h3>
      <p class="text-xs opacity-60">
        เรียงตามจำนวนก้อนที่มีตำหนิ เพราะเป็นความเสี่ยงที่ค่า SOH มองไม่เห็น
      </p>
      <div class="mt-2 overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>จังหวัด</th>
              <th class="text-right">ก้อนที่ตรวจ</th>
              <th class="text-right">SOH เฉลี่ย</th>
              <th class="text-right">ต่ำกว่า 70%</th>
              <th class="text-right">ตำหนิ</th>
              <th class="text-right">อ่านค่าไม่ได้</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in pm.provinceConcerns" :key="p.id" class="hover">
              <td>{{ p.name }}</td>
              <td class="text-right tabular-nums opacity-70">{{ num(p.banks) }}</td>
              <td class="text-right tabular-nums">{{ p.avgSoh === null ? '—' : `${p.avgSoh}%` }}</td>
              <td class="text-right tabular-nums" :class="p.lowSoh ? 'text-warning' : 'opacity-40'">
                {{ p.lowSoh || '—' }}
              </td>
              <td class="text-right tabular-nums" :class="p.defects ? 'text-error font-medium' : 'opacity-40'">
                {{ p.defects || '—' }}
              </td>
              <td class="text-right tabular-nums opacity-70">{{ p.unreadable || '—' }}</td>
            </tr>
            <tr v-if="!pm.provinceConcerns.length">
              <td colspan="6" class="text-center opacity-60">ยังไม่มีผลตรวจในปีงบนี้</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-1 text-xs opacity-60">
        ตัวเลขตำหนิกระจุกอยู่ที่ไม่กี่จังหวัด ข้อมูลที่มีแยกไม่ออกว่าแบตที่นั่นแย่กว่าจริง
        หรือทีมช่างที่นั่นเป็นทีมที่กรอกช่องตำหนิครบกว่าทีมอื่น
      </p>
    </div>
  </div>
</template>

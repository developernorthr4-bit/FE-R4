<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import ProgressList from '../components/charts/ProgressList.vue'
import StatTile from '../components/charts/StatTile.vue'
import { errorMessage } from '../lib/api'
import {
  ASSET_STATUS_LABEL, fiscalLabel, formatCapacity, formatThaiDate, getInventory, getPmSummary,
  measurementBreakdown, type Inventory, type PmSummary,
} from '../services/maintenance.api'

/**
 * หน้างานบำรุงรักษาเชิงป้องกัน (PM)
 *
 * มีสองส่วนที่ตอบคนละคำถามและอยู่คนละแกนเวลา จึงต้องคั่นให้ชัดบนหน้าจอ
 *   ทะเบียนทรัพย์สิน  ตอนนี้เรามีอะไรอยู่บ้าง        → ไม่ขึ้นกับปีงบ
 *   ผลการตรวจ PM     ปีงบนั้นตรวจแล้วเจออะไร        → เปลี่ยนตามปีงบที่เลือก
 *
 * ถ้าไม่คั่น คนจะเข้าใจว่าเลือกปีงบย้อนหลังแล้วจำนวนแบตที่มีจะเปลี่ยนตามไปด้วย
 * ซึ่งไม่จริง — ทะเบียนไม่มีประวัติย้อนหลังให้ดูอยู่แล้ว
 *
 * ทุกคนที่ล็อกอินดูได้ เหมือนแดชบอร์ดสรุปสัปดาห์
 */

const inv = ref<Inventory | null>(null)
const invLoading = ref(true)
const invError = ref<string | null>(null)

const pm = ref<PmSummary | null>(null)
const pmLoading = ref(true)
const pmError = ref<string | null>(null)

async function loadInventory() {
  invLoading.value = true
  invError.value = null
  try {
    inv.value = await getInventory()
  } catch (err) {
    invError.value = errorMessage(err, 'โหลดทะเบียนทรัพย์สินไม่สำเร็จ')
  } finally {
    invLoading.value = false
  }
}

async function loadPm(fy?: string) {
  pmLoading.value = true
  pmError.value = null
  try {
    pm.value = await getPmSummary(fy)
  } catch (err) {
    pmError.value = errorMessage(err, 'โหลดสรุปงาน PM ไม่สำเร็จ')
  } finally {
    pmLoading.value = false
  }
}

// สองก้อนไม่เกี่ยวกัน ยิงขนานกันไปเลย ไม่ต้องรอกัน
onMounted(() => {
  void loadInventory()
  void loadPm()
})

const num = (v: number) => v.toLocaleString()

/** สัดส่วนแบบทศนิยมหนึ่งตำแหน่ง — ตัวหารเป็น 0 ได้ตอนยังไม่มีข้อมูล */
function pctOf(part: number, whole: number): string {
  if (whole <= 0) return '—'
  return `${((part / whole) * 100).toFixed(1)}%`
}

/* ─── ทะเบียน ─────────────────────────────────────────────────────────── */

const sitesWithoutCabinet = computed(() =>
  inv.value ? inv.value.sites.total - inv.value.sites.withCabinet : 0)

/** ตัวหารของแท่ง "แบตกี่ก้อนต่อตู้" — เทียบกับกลุ่มที่ใหญ่ที่สุด ไม่ใช่ยอดรวม */
const cabBatMax = computed(() =>
  Math.max(...(inv.value?.cabinets.byBatteryCount ?? []).map((d) => d.cabinets), 1))

/**
 * ชนิดแบตที่ชำรุดมากที่สุดเทียบกับน้อยที่สุด
 *
 * คำนวณสดจากข้อมูล ไม่ฝังตัวเลขไว้ในข้อความ — วันที่ import รอบใหม่เข้ามา
 * แล้วอัตราเปลี่ยน ข้อความจะเปลี่ยนตาม ไม่ค้างอยู่กับตัวเลขของวันที่เขียนโค้ด
 *
 * ตัดชนิดที่มีน้อยกว่า 50 ก้อนออก เพราะกลุ่มเล็กชำรุดก้อนเดียวก็ได้อัตราสูงลิ่ว
 * โดยไม่ได้แปลว่ามีปัญหาจริง
 */
const faultGap = computed(() => {
  const rate = (t: { banks: number; faulty: number }) => (t.banks > 0 ? t.faulty / t.banks : 0)
  const list = (inv.value?.batteries.byType ?? []).filter((t) => t.code && t.banks >= 50)
  if (list.length < 2) return null

  const sorted = [...list].sort((a, b) => rate(b) - rate(a))
  const hi = sorted[0]
  const lo = sorted[sorted.length - 1]
  if (!hi || !lo || rate(hi) <= 0) return null

  return {
    hi, lo,
    times: rate(lo) > 0 ? Math.round(rate(hi) / rate(lo)) : null,
  }
})

const BRAND_TOP = 10
const showAllBrands = ref(false)
const brandRows = computed(() => {
  const all = inv.value?.batteries.byBrand ?? []
  return showAllBrands.value ? all : all.slice(0, BRAND_TOP)
})
const brandHidden = computed(() =>
  Math.max((inv.value?.batteries.byBrand.length ?? 0) - BRAND_TOP, 0))

/**
 * ช่องที่ว่างทั้งหมด — แสดงเป็นรายการชัด ๆ แทนที่จะซ่อนการ์ดที่ไม่มีข้อมูล
 *
 * ถ้าซ่อน ผู้ใช้จะไม่มีทางรู้ว่าระบบตอบเรื่องอายุแบตไม่ได้เพราะข้อมูลไม่มี
 * หรือเพราะยังไม่ได้ทำหน้าจอ — สองอย่างนี้ต้องทำอะไรต่อไม่เหมือนกันเลย
 */
const gaps = computed(() => {
  const i = inv.value
  if (!i) return []
  const out: { label: string; detail: string; have: number; of: number }[] = []

  if (i.cabinets.typed < i.cabinets.inStock) {
    out.push({
      label: 'ชนิดของตู้ (OUTDOOR / INDOOR / SHELTER)',
      detail: 'ระบบรองรับไว้แล้ว แต่ไฟล์ PM ต้นทางไม่มีคอลัมน์นี้ จึงยังตอบไม่ได้ว่าตู้ไหนเป็นชนิดใด',
      have: i.cabinets.typed, of: i.cabinets.inStock,
    })
  }
  if (i.cabinets.branded < i.cabinets.inStock) {
    out.push({
      label: 'ยี่ห้อของตู้',
      detail: 'เหมือนกับชนิดตู้ — ไม่มีมากับไฟล์นำเข้า',
      have: i.cabinets.branded, of: i.cabinets.inStock,
    })
  }
  if (i.batteries.withInstallDate < i.batteries.inStock) {
    out.push({
      label: 'วันติดตั้งแบตเตอรี่',
      detail: 'ไม่มีวันติดตั้งจึงคำนวณอายุการใช้งานไม่ได้ — เป็นตัวเลขที่ใช้วางแผนเปลี่ยนแบตล่วงหน้า',
      have: i.batteries.withInstallDate, of: i.batteries.inStock,
    })
  }
  if (i.batteries.withExpiryDate < i.batteries.inStock) {
    out.push({
      label: 'วันหมดอายุแบตเตอรี่',
      detail: 'ไม่มีวันหมดอายุจึงเตือนล่วงหน้าไม่ได้ว่าก้อนไหนใกล้ถึงกำหนด',
      have: i.batteries.withExpiryDate, of: i.batteries.inStock,
    })
  }
  if (i.batteries.withVoltage < i.batteries.inStock) {
    out.push({
      label: 'แรงดันของแบตเตอรี่',
      detail: 'แยกไม่ได้ว่าเป็นระบบ 12V หรือ 48V',
      have: i.batteries.withVoltage, of: i.batteries.inStock,
    })
  }
  return out
})

/* ─── ผลการตรวจ ───────────────────────────────────────────────────────── */

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
  <AppLayout>
    <PageHeader
      title="งานบำรุงรักษาเชิงป้องกัน (PM)"
      description="ทะเบียนตู้และแบตเตอรี่ที่มีอยู่ กับผลการตรวจตามปีงบประมาณ"
    />

    <!--
      ══ ส่วนที่ 1 · ทะเบียนทรัพย์สิน ═══════════════════════════════════════
      สถานะปัจจุบัน ไม่ผูกกับปีงบ — ป้ายกำกับด้านขวาบอกไว้ชัดเพื่อไม่ให้สับสน
      กับตัวเลือกปีงบของส่วนที่ 2
    -->
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-lg font-semibold tracking-tight">ทะเบียนทรัพย์สิน</h2>
      <span class="badge badge-ghost badge-sm">สถานะปัจจุบัน · ไม่ขึ้นกับปีงบ</span>
    </div>

    <div v-if="invError" role="alert" class="alert alert-error mb-4 text-sm">
      <span>{{ invError }}</span>
    </div>

    <div v-if="invLoading" class="flex justify-center py-12">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <template v-else-if="inv">
      <div class="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="สถานี" :value="num(inv.sites.total)" good-when="neutral"
          :hint="`มีตู้ในทะเบียน ${num(inv.sites.withCabinet)} · มีแบต ${num(inv.sites.withBattery)}`"
        />
        <StatTile
          label="ตู้" :value="num(inv.cabinets.inStock)" good-when="neutral"
          :hint="inv.cabinets.removed
            ? `ถอดออกแล้วอีก ${num(inv.cabinets.removed)}`
            : 'ยังไม่มีตู้ที่ถอดออก'"
        />
        <StatTile
          label="แบตเตอรี่" :value="num(inv.batteries.inStock)" good-when="neutral"
          :hint="`ก้อนที่ยังอยู่ในทะเบียน · ถอดออกแล้วอีก ${num(inv.batteries.total - inv.batteries.inStock)}`"
        />
      </div>

      <!--
        ยอดรวม qty ต้องเท่ากับจำนวนแถวเสมอ ถ้าไม่เท่าแปลว่า 1 แถวไม่ใช่ 1 ก้อน
        แล้วทุกตัวเลข "จำนวนก้อน" ในหน้านี้จะผิดหมด จึงเตือนไว้ให้เห็นทันที
      -->
      <div
        v-if="inv.batteries.qtySum !== inv.batteries.inStock" role="alert"
        class="alert alert-warning mt-3 py-2 text-sm"
      >
        <span>
          ผลรวมช่อง qty คือ {{ num(inv.batteries.qtySum) }} แต่มี
          {{ num(inv.batteries.inStock) }} แถว — แปลว่ามีแถวที่แทนแบตมากกว่าหนึ่งก้อน
          ตัวเลข &quot;จำนวนก้อน&quot; ในหน้านี้จึงต่ำกว่าความจริง
        </span>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <!-- สถานี -->
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2">
            <h3 class="card-title text-base">สถานี</h3>
            <p class="text-xs opacity-60">นับเฉพาะสถานีที่ยังไม่ถูกลบ</p>

            <ul class="mt-1 flex flex-col gap-1.5 text-sm">
              <li class="flex justify-between gap-3">
                <span>มีตู้ในทะเบียน</span>
                <span class="tabular-nums">
                  {{ num(inv.sites.withCabinet) }}
                  <span class="ml-1 opacity-60">{{ pctOf(inv.sites.withCabinet, inv.sites.total) }}</span>
                </span>
              </li>
              <li class="flex justify-between gap-3">
                <span>มีแบตเตอรี่ในทะเบียน</span>
                <span class="tabular-nums">
                  {{ num(inv.sites.withBattery) }}
                  <span class="ml-1 opacity-60">{{ pctOf(inv.sites.withBattery, inv.sites.total) }}</span>
                </span>
              </li>
              <li class="flex justify-between gap-3">
                <span class="opacity-70">ยังไม่มีตู้ในทะเบียน</span>
                <span class="tabular-nums opacity-70">{{ num(sitesWithoutCabinet) }}</span>
              </li>
            </ul>

            <p class="mt-1 text-xs opacity-60">
              สถานีที่ยังไม่มีตู้แปลว่ายังไม่เคยมีข้อมูล PM ของสถานีนั้นเข้าระบบ
              ไม่ได้แปลว่าสถานีนั้นไม่มีตู้อยู่จริง
            </p>
          </div>
        </div>

        <!-- ตู้ -->
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="card-title text-base">ตู้</h3>
              <span class="text-sm opacity-70">{{ num(inv.cabinets.inStock) }} ตู้</span>
            </div>

            <!--
              ตอบคำถาม "ตู้ประเภทอะไรบ้าง" ไม่ได้ และต้องเขียนไว้ตรงนี้ ไม่ใช่ซ่อน
              การ์ดทิ้ง — ผู้ใช้ต้องแยกออกว่า "ไม่มีข้อมูล" กับ "ยังไม่ได้ทำ" ต่างกัน
            -->
            <p v-if="!inv.cabinets.typed" class="rounded-sm bg-base-200 px-3 py-2 text-xs">
              ยังแยกชนิดตู้ไม่ได้ — ช่องชนิดและยี่ห้อว่างทั้ง {{ num(inv.cabinets.inStock) }} ตู้
              เพราะไฟล์ PM ต้นทางไม่มีคอลัมน์นั้น สิ่งที่บอกลักษณะตู้ได้จากข้อมูลที่มี
              คือจำนวนแบตที่ติดตั้งอยู่
            </p>

            <p class="mt-1 text-xs opacity-60">แบตกี่ก้อนต่อตู้</p>
            <ul class="flex flex-col gap-2">
              <li
                v-for="d in inv.cabinets.byBatteryCount" :key="d.banks"
                class="grid grid-cols-[4rem_1fr_auto] items-center gap-3"
              >
                <span class="text-sm">{{ d.banks }} ก้อน</span>
                <span class="block h-3 rounded-sm bg-base-200">
                  <span
                    class="block h-3 rounded-r-[4px] bg-primary"
                    :style="{ width: `${(d.cabinets / cabBatMax) * 100}%` }"
                  />
                </span>
                <span class="text-right text-sm tabular-nums opacity-80">
                  {{ num(d.cabinets) }}
                  <span class="ml-1 inline-block w-12 text-right opacity-60">
                    {{ pctOf(d.cabinets, inv.cabinets.inStock) }}
                  </span>
                </span>
              </li>
            </ul>

            <p class="mt-1 text-xs opacity-60">
              ตู้ที่มี 0 ก้อนไม่ได้แปลว่าไม่มีแบตเสมอไป — ตู้ 8U ใช้แบตร่วมกับตู้หลัก
              จึงไม่มีก้อนของตัวเอง
            </p>
          </div>
        </div>
      </div>

      <!-- แบตเตอรี่ · แยกชนิด -->
      <div class="card mt-4 border border-base-300 bg-base-100">
        <div class="card-body gap-2">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="card-title text-base">แบตเตอรี่ แยกตามชนิด</h3>
            <span class="text-sm opacity-70">
              {{ num(inv.batteries.inStock) }} ก้อนที่ยังอยู่ในทะเบียน
            </span>
          </div>

          <div class="mt-1 flex flex-wrap gap-1.5">
            <span
              v-for="s in inv.batteries.byStatus" :key="s.status"
              class="badge badge-sm" :class="s.status === 'faulty' ? 'badge-error' : 'badge-ghost'"
            >
              {{ ASSET_STATUS_LABEL[s.status] ?? s.status }} {{ num(s.n) }}
            </span>
          </div>

          <div class="mt-2 overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>ชนิด</th>
                  <th class="text-right">ก้อน</th>
                  <th class="text-right">สัดส่วน</th>
                  <th class="text-right">ชำรุด</th>
                  <th class="text-right">อัตราชำรุด</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in inv.batteries.byType" :key="t.code ?? 'unknown'">
                  <td>
                    {{ t.name ?? 'ไม่ระบุชนิด' }}
                    <span v-if="t.code" class="ml-1 text-xs opacity-50">{{ t.code }}</span>
                  </td>
                  <td class="text-right tabular-nums">{{ num(t.banks) }}</td>
                  <td class="text-right tabular-nums opacity-70">
                    {{ pctOf(t.banks, inv.batteries.inStock) }}
                  </td>
                  <td class="text-right tabular-nums" :class="t.faulty > 0 ? 'text-error' : 'opacity-40'">
                    {{ t.faulty || '—' }}
                  </td>
                  <td class="text-right tabular-nums" :class="t.faulty > 0 ? 'text-error font-medium' : 'opacity-40'">
                    {{ t.faulty > 0 ? pctOf(t.faulty, t.banks) : '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!--
            ข้อความสร้างสดจากข้อมูล ไม่ฝังตัวเลขไว้ — พอ import รอบใหม่เข้ามา
            แล้วอัตราเปลี่ยน ข้อความจะเปลี่ยนตาม ไม่ค้างอยู่กับตัวเลขวันที่เขียนโค้ด
          -->
          <p v-if="faultGap" class="mt-1 text-sm">
            <b>{{ faultGap.hi.name }}</b> ชำรุด {{ pctOf(faultGap.hi.faulty, faultGap.hi.banks) }}
            ({{ num(faultGap.hi.faulty) }} จาก {{ num(faultGap.hi.banks) }} ก้อน)
            เทียบกับ <b>{{ faultGap.lo.name }}</b> ที่
            {{ faultGap.lo.faulty > 0 ? pctOf(faultGap.lo.faulty, faultGap.lo.banks) : '0%' }}
            <template v-if="faultGap.times">— ต่างกันราว {{ num(faultGap.times) }} เท่า</template>
          </p>
          <p class="text-xs opacity-60">
            &quot;ชำรุด&quot; คือสถานะในทะเบียน ไม่ใช่ค่าที่วัดได้ตอนตรวจ —
            ค่า SOH อยู่ในส่วนผลการตรวจด้านล่าง
          </p>

          <p v-if="inv.batteries.untyped" class="text-xs opacity-60">
            มี {{ num(inv.batteries.untyped) }} ก้อนที่ไม่ได้ระบุชนิด นับรวมไว้ในตารางแล้ว
            เพื่อให้ยอดย่อยบวกกันได้เท่ายอดรวม
          </p>
        </div>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <!-- ยี่ห้อ -->
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="card-title text-base">ยี่ห้อแบตเตอรี่</h3>
              <span class="text-sm opacity-70">{{ inv.batteries.byBrand.length }} ยี่ห้อ</span>
            </div>

            <div class="mt-1 overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>ยี่ห้อ</th>
                    <th class="text-right">ก้อน</th>
                    <th class="text-right">สัดส่วน</th>
                    <th class="text-right">รุ่น</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="b in brandRows" :key="b.brand ?? 'unknown'">
                    <td>{{ b.brand ?? 'ไม่ระบุ' }}</td>
                    <td class="text-right tabular-nums">{{ num(b.banks) }}</td>
                    <td class="text-right tabular-nums opacity-70">
                      {{ pctOf(b.banks, inv.batteries.inStock) }}
                    </td>
                    <td class="text-right tabular-nums opacity-70">{{ b.models }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <button
              v-if="brandHidden" type="button" class="btn btn-ghost btn-xs self-start"
              @click="showAllBrands = !showAllBrands"
            >
              {{ showAllBrands ? 'ย่อ' : `แสดงอีก ${brandHidden} ยี่ห้อ` }}
            </button>
          </div>
        </div>

        <!-- ความจุ -->
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2">
            <h3 class="card-title text-base">ความจุ</h3>
            <p class="text-xs opacity-60">ค่าที่กรอกมาในไฟล์นำเข้า ไม่ได้วัดเอง</p>

            <div class="mt-1 overflow-x-auto">
              <table class="table table-sm">
                <thead>
                  <tr><th>ความจุ</th><th class="text-right">ก้อน</th><th class="text-right">สัดส่วน</th></tr>
                </thead>
                <tbody>
                  <tr v-for="cap in inv.batteries.byCapacity" :key="cap.capacityAh ?? 'unknown'">
                    <td>{{ formatCapacity(cap.capacityAh) }}</td>
                    <td class="text-right tabular-nums">{{ num(cap.banks) }}</td>
                    <td class="text-right tabular-nums opacity-70">
                      {{ pctOf(cap.banks, inv.batteries.inStock) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- แยกตามจังหวัด -->
      <div class="card mt-4 border border-base-300 bg-base-100">
        <div class="card-body">
          <h3 class="card-title text-base">ทรัพย์สินแยกตามจังหวัด</h3>
          <div class="mt-2 overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>จังหวัด</th>
                  <th class="text-right">สถานี</th>
                  <th class="text-right">ตู้</th>
                  <th class="text-right">แบตเตอรี่</th>
                  <th class="text-right">ก้อน/ตู้</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in inv.sites.byProvince" :key="p.id" class="hover">
                  <td>{{ p.name }}</td>
                  <td class="text-right tabular-nums">{{ num(p.sites) }}</td>
                  <td class="text-right tabular-nums">{{ num(p.cabinets) }}</td>
                  <td class="text-right tabular-nums">{{ num(p.batteries) }}</td>
                  <td class="text-right tabular-nums opacity-70">
                    {{ p.cabinets ? (p.batteries / p.cabinets).toFixed(1) : '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!--
        ช่องที่ยังว่าง — บอกให้รู้ว่าอะไรที่ระบบตอบไม่ได้และเพราะอะไร
        ถ้าไม่มีส่วนนี้ คนอ่านจะเดาเองว่าเป็นข้อจำกัดของโปรแกรม ทั้งที่เป็นเรื่องข้อมูล
      -->
      <div v-if="gaps.length" class="card mt-4 border border-base-300 bg-base-100">
        <div class="card-body gap-2">
          <h3 class="card-title text-base">ข้อมูลที่ยังตอบไม่ได้</h3>
          <p class="text-xs opacity-60">
            ช่องเหล่านี้มีอยู่ในระบบแล้ว แต่ยังไม่มีข้อมูลเข้ามา
            ถ้าวันหนึ่งมีไฟล์ที่มีคอลัมน์พวกนี้ ตัวเลขจะขึ้นเองโดยไม่ต้องแก้โครงสร้าง
          </p>

          <ul class="mt-1 flex flex-col gap-2.5">
            <li v-for="g in gaps" :key="g.label" class="text-sm">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <span class="font-medium">{{ g.label }}</span>
                <span class="tabular-nums opacity-70">
                  มีข้อมูล {{ num(g.have) }} จาก {{ num(g.of) }}
                  <span class="opacity-70">({{ pctOf(g.have, g.of) }})</span>
                </span>
              </div>
              <p class="text-xs opacity-60">{{ g.detail }}</p>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <!--
      ══ ส่วนที่ 2 · ผลการตรวจ PM ═══════════════════════════════════════════
      ผูกกับปีงบประมาณ ต่างจากส่วนบนที่เป็นสถานะปัจจุบัน เส้นคั่นและป้ายกำกับ
      ช่วงวันที่จึงต้องอยู่ตรงนี้ ไม่ใช่ที่หัวหน้า
    -->
    <div class="divider mb-4 mt-10" />

    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">ผลการตรวจ PM</h2>
        <p v-if="pm" class="mt-1 text-sm opacity-70">
          ปีงบ {{ fiscalLabel(pm.fiscalYear) }} ·
          {{ formatThaiDate(pm.window.start) }} – {{ formatThaiDate(pm.window.end) }}
        </p>
      </div>
      <label v-if="pm" class="form-control">
        <span class="label-text text-xs opacity-70">ปีงบประมาณ</span>
        <select
          class="select select-sm select-bordered" :value="pm.fiscalYear" :disabled="pmLoading"
          @change="loadPm(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="f in pm.fiscalYears" :key="f" :value="f">{{ fiscalLabel(f) }}</option>
        </select>
      </label>
    </div>

    <div v-if="pmError" role="alert" class="alert alert-error mb-4 text-sm">
      <span>{{ pmError }}</span>
    </div>

    <div v-if="pmLoading" class="flex justify-center py-12">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <template v-else-if="pm">
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
  </AppLayout>
</template>

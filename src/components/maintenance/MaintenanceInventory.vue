<script setup lang="ts">
import { computed, ref } from 'vue'
import StatTile from '@/components/charts/StatTile.vue'
import {
  assetStatusLabel, formatCapacity, num, pctOf, type Inventory,
} from '@/services/maintenance.api'

/**
 * ส่วนที่ 1 ของหน้า /maintenance — ทะเบียนทรัพย์สิน (สถานะปัจจุบัน ไม่ขึ้นกับปีงบ)
 * แสดงผลอย่างเดียว หน้าแม่เป็นคนโหลดและจัดการ loading/error
 */
const props = defineProps<{ inv: Inventory }>()
const inv = computed(() => props.inv)

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
</script>

<template>
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
          {{ assetStatusLabel(s.status) }} {{ num(s.n) }}
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

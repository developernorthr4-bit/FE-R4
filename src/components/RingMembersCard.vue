<script setup lang="ts">
import { computed } from 'vue'
import { SITE_GRADE_BADGE } from '../lib/sites'
import {
  ROLE_BADGE, ROLE_LABEL, sourceRows, TOPO_BADGE, TOPO_LABEL,
} from '../lib/rings'
import type { RingWithMembers } from '../services/rings.api'

/**
 * วงหนึ่งวงในมุมมองย่อ — ใช้ทั้งใน popup ของแผนที่สถานีและในหน้าข้อมูลสถานี
 *
 * จุดประสงค์เดียว: ยืนอยู่ที่สถานีหนึ่งแล้วตอบให้ได้ว่า "วงนี้ต้นทางอยู่ไหน
 * และมีใครอยู่ในวงเดียวกับฉัน" สถานีที่กำลังเปิดอยู่จะถูกไฮไลต์ไว้ในรายการ
 * เพื่อให้เห็นตำแหน่งตัวเองในวงทันทีโดยไม่ต้องไล่อ่านรหัส
 */
const props = defineProps<{
  ring: RingWithMembers
  /** สถานีที่กำลังเปิดอยู่ — ไฮไลต์ในรายการและไม่ทำเป็นลิงก์วนกลับมาที่ตัวเอง */
  currentSiteId?: string | null
}>()

/** จุดเกาะวงแม่อยู่ในรายการสมาชิกเอง (hop 0) จึงไม่ต้องขอข้อมูลเพิ่มจาก BE */
const anchorMember = computed(() => props.ring.members.find((m) => m.role === 'anchor') ?? null)

const rows = computed(() => sourceRows(
  props.ring.source,
  props.ring.topoType,
  anchorMember.value ? { siteCode: anchorMember.value.siteCode, siteId: anchorMember.value.siteId } : null,
))
</script>

<template>
  <div class="rounded-field border border-base-300 bg-base-100">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 px-2.5 py-2">
      <div class="flex flex-wrap items-center gap-1.5">
        <RouterLink :to="`/rings/${ring.id}`" class="link link-hover font-mono text-sm font-medium">
          {{ ring.ringCode }}
        </RouterLink>
        <span v-if="ring.topoType" class="badge badge-sm" :class="TOPO_BADGE[ring.topoType]">
          {{ TOPO_LABEL[ring.topoType] ?? ring.topoType }}
        </span>
      </div>
      <span class="text-xs opacity-60">{{ ring.siteCount }} สถานี</span>
    </div>

    <!-- ต้นทาง — เหตุผลหลักที่การ์ดนี้มีอยู่ -->
    <dl class="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 px-2.5 py-2 text-xs">
      <template v-for="r in rows" :key="r.label">
        <dt class="opacity-60" :title="r.hint">{{ r.label }}</dt>
        <dd class="min-w-0">
          <RouterLink
            v-if="r.value && r.siteId && r.siteId !== currentSiteId"
            :to="`/sites/${r.siteId}/edit`" class="link link-hover break-all font-mono"
          >{{ r.value }}</RouterLink>
          <span v-else-if="r.value" class="break-all font-mono">{{ r.value }}</span>
          <span v-else class="opacity-40">ไม่ระบุ (ไฟล์ต้นทางไม่มีข้อมูล)</span>
        </dd>
      </template>
    </dl>

    <p v-if="ring.warnings.noHead" class="mx-2.5 mb-2 rounded bg-warning/15 px-2 py-1 text-xs">
      ไฟล์ CPE ring ไม่ได้บอก uplink ของวงนี้ จึงไม่รู้ว่าต้นทางคือที่ไหน — ระบบไม่เดาให้
    </p>
    <p v-if="ring.warnings.dupHop" class="mx-2.5 mb-2 rounded bg-warning/15 px-2 py-1 text-xs">
      วงนี้มีเลข hop ซ้ำกันในไฟล์ต้นทาง ลำดับที่เห็นจึงอาจไม่ใช่ลำดับสายจริง
    </p>

    <!-- สมาชิกในวง -->
    <ul class="flex flex-col divide-y divide-base-300 border-t border-base-300">
      <li
        v-for="m in ring.members" :key="m.memberId"
        class="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 text-xs"
        :class="m.siteId === currentSiteId ? 'bg-primary/10 font-medium' : ''"
      >
        <span class="w-6 shrink-0 text-right font-mono opacity-60">{{ m.hopNo ?? '–' }}</span>

        <RouterLink
          v-if="m.siteId !== currentSiteId" :to="`/sites/${m.siteId}/edit`"
          class="link link-hover font-mono"
        >{{ m.siteCode }}</RouterLink>
        <span v-else class="font-mono">{{ m.siteCode }} (สถานีนี้)</span>

        <span v-if="m.siteGrade" class="badge badge-xs" :class="SITE_GRADE_BADGE[m.siteGrade] ?? 'badge-neutral'">
          {{ m.siteGrade }}
        </span>
        <span v-if="m.role" class="badge badge-xs" :class="ROLE_BADGE[m.role]">
          {{ ROLE_LABEL[m.role] ?? m.role }}
        </span>
        <span v-if="m.lat === null" class="opacity-40">ไม่มีพิกัด</span>
      </li>
    </ul>
  </div>
</template>

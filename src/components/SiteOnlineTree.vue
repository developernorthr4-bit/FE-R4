<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { errorMessage } from '../lib/api'
import {
  getOltChildren, getNodeChildren, getSiteOlts,
  LINK_STATUS_HINT, LINK_STATUS_LABEL,
  type OnlineNode, type OnlineOlt,
} from '../services/online.api'

/**
 * โครงข่ายงาน online ของสถานีนี้ — OLT → L1 → L2 → บ้านลูกค้า
 *
 * กางทีละชั้น ไม่โหลดต้นไม้ทั้งก้อน: OLT ตัวเดียวมี L1 ได้ถึง 178 ตัว
 * และ L2 อีกเจ็ดร้อยกว่า ถ้าโหลดหมดตั้งแต่เปิดหน้าคือรอเปล่า ๆ เพราะคนดู
 * กางแค่กิ่งเดียวที่กำลังตามงานอยู่
 *
 * ผลที่โหลดแล้วจำไว้ในหน่วยความจำของ component ตลอดที่ยังเปิดหน้านี้อยู่
 * พับแล้วกางใหม่จึงไม่ยิงซ้ำ แต่ออกจากหน้าไปคือทิ้งหมด ไม่ค้างเป็นแคชทั้งแอป
 *
 * รอบนี้ยังไม่มีแผนที่ตามที่ตกลงกันไว้ — พิกัดโชว์เป็นตัวเลขเฉย ๆ
 */
const props = defineProps<{ siteId: string }>()

const olts = ref<OnlineOlt[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

/** ลูกที่โหลดมาแล้ว คีย์คือ id ของ OLT หรือของโหนด */
const children = ref<Record<string, OnlineNode[]>>({})
const open = ref<Record<string, boolean>>({})
const busy = ref<Record<string, boolean>>({})
/** กิ่งที่กด "แสดงทั้งหมด" แล้ว — ก่อนหน้านั้นตัดที่ PAGE แถว */
const expanded = ref<Record<string, boolean>>({})

/** จำนวนแถวที่แสดงก่อนตัด — กันไม่ให้หน้ายาวเป็นพันแถวจากการกดครั้งเดียว */
const PAGE = 50

onMounted(async () => {
  try {
    olts.value = await getSiteOlts(props.siteId)
  } catch (err) {
    error.value = errorMessage(err, 'โหลดโครงข่าย online ไม่สำเร็จ')
  } finally {
    loading.value = false
  }
})

/**
 * กาง/พับหนึ่งกิ่ง — โหลดจริงเฉพาะครั้งแรกที่กาง
 * kind แยกเพราะ OLT กับโหนดคนละ endpoint (OLT อยู่คนละตาราง)
 */
async function toggle(kind: 'olt' | 'node', id: string) {
  if (open.value[id]) { open.value[id] = false; return }
  open.value[id] = true
  if (children.value[id] || busy.value[id]) return

  busy.value[id] = true
  try {
    children.value[id] = kind === 'olt' ? await getOltChildren(id) : await getNodeChildren(id)
  } catch (err) {
    error.value = errorMessage(err, 'โหลดข้อมูลชั้นถัดไปไม่สำเร็จ')
    open.value[id] = false
  } finally {
    busy.value[id] = false
  }
}

function shown(id: string): OnlineNode[] {
  const all = children.value[id] ?? []
  return expanded.value[id] ? all : all.slice(0, PAGE)
}

function hidden(id: string): number {
  const all = children.value[id] ?? []
  return expanded.value[id] ? 0 : Math.max(all.length - PAGE, 0)
}

function coords(n: { lat: number | null; lng: number | null }): string {
  if (n.lat === null || n.lng === null) return 'ไม่มีพิกัด'
  return `${n.lat.toFixed(5)}, ${n.lng.toFixed(5)}`
}
</script>

<template>
  <div class="card border border-base-300 bg-base-100">
    <div class="card-body gap-3 p-4">
      <p v-if="loading" class="text-sm opacity-70">กำลังโหลด…</p>

      <div v-else-if="error" class="alert alert-error text-sm">{{ error }}</div>

      <div v-else-if="!olts.length" class="text-sm opacity-70">
        <p class="font-medium opacity-100">สถานีนี้ยังไม่มี OLT ในระบบ</p>
        <p class="mt-1">
          ถ้าหน้างานมี OLT อยู่จริง แปลว่าไฟล์ต้นทางผูกมันไว้กับรหัสสถานีอื่น
          — ดูได้ที่หน้า “OLT ที่ยังไม่ผูกสถานี”
        </p>
      </div>

      <template v-else>
        <ul class="flex flex-col gap-2">
          <li v-for="olt in olts" :key="olt.id" class="rounded-lg border border-base-300">
            <!-- ชั้น OLT -->
            <div class="flex flex-wrap items-center gap-2 p-3">
              <button
                type="button"
                class="btn btn-xs btn-ghost font-mono"
                :disabled="!olt.l1Count && !olt.l2Count"
                @click="toggle('olt', olt.id)"
              >
                {{ open[olt.id] ? '▾' : '▸' }}
              </button>

              <span class="font-mono text-sm font-semibold">{{ olt.oltCode }}</span>
              <span class="badge badge-sm badge-neutral">OLT</span>

              <span class="text-xs opacity-70">
                L1 {{ olt.l1Count.toLocaleString() }} · L2 {{ olt.l2Count.toLocaleString() }}
              </span>
              <span class="ml-auto text-xs opacity-60">{{ coords(olt) }}</span>
            </div>

            <!-- ชั้น L1 (และ L2 บางตัวที่ไฟล์ไม่ได้ระบุ L1 จึงห้อยกับ OLT ตรง ๆ) -->
            <div v-if="open[olt.id]" class="border-t border-base-300 px-3 pb-3">
              <p v-if="busy[olt.id]" class="py-2 text-sm opacity-70">กำลังโหลด…</p>

              <ul v-else class="flex flex-col">
                <li v-for="n in shown(olt.id)" :key="n.id" class="border-b border-base-200 last:border-0">
                  <div class="flex flex-wrap items-center gap-2 py-2 pl-4">
                    <button
                      type="button"
                      class="btn btn-xs btn-ghost font-mono"
                      :class="{ invisible: !n.childCount }"
                      @click="toggle('node', n.id)"
                    >
                      {{ open[n.id] ? '▾' : '▸' }}
                    </button>

                    <span class="font-mono text-sm">{{ n.nodeCode }}</span>
                    <span class="badge badge-sm" :class="n.level === 'l1' ? 'badge-primary' : 'badge-ghost'">
                      {{ n.level.toUpperCase() }}
                    </span>
                    <span v-if="n.childCount" class="text-xs opacity-70">
                      ลูก {{ n.childCount.toLocaleString() }}
                    </span>
                    <span class="ml-auto text-xs opacity-60">{{ coords(n) }}</span>
                  </div>

                  <!-- ชั้น L2 -->
                  <div v-if="open[n.id]" class="pb-2 pl-10">
                    <p v-if="busy[n.id]" class="py-1 text-sm opacity-70">กำลังโหลด…</p>

                    <ul v-else class="flex flex-col">
                      <li
                        v-for="c in shown(n.id)"
                        :key="c.id"
                        class="flex flex-wrap items-center gap-2 py-1"
                      >
                        <span class="font-mono text-sm">{{ c.nodeCode }}</span>
                        <span class="badge badge-sm badge-ghost">{{ c.level.toUpperCase() }}</span>
                        <span class="ml-auto text-xs opacity-60">{{ coords(c) }}</span>
                      </li>
                    </ul>

                    <button
                      v-if="hidden(n.id)"
                      type="button"
                      class="btn btn-xs btn-ghost mt-1"
                      @click="expanded[n.id] = true"
                    >
                      แสดงอีก {{ hidden(n.id).toLocaleString() }} รายการ
                    </button>
                  </div>
                </li>
              </ul>

              <button
                v-if="hidden(olt.id)"
                type="button"
                class="btn btn-xs btn-ghost mt-2"
                @click="expanded[olt.id] = true"
              >
                แสดงอีก {{ hidden(olt.id).toLocaleString() }} รายการ
              </button>
            </div>
          </li>
        </ul>

        <!--
          OLT ที่ผูกมาผิดจะไม่โผล่ในรายการนี้อยู่แล้ว (endpoint กรองด้วย site_id)
          ป้ายนี้จึงขึ้นเฉพาะกรณีที่ข้อมูลเพี้ยน — เตือนไว้ดีกว่าเงียบ
        -->
        <p
          v-for="olt in olts.filter((o) => o.linkStatus !== 'linked')"
          :key="`warn-${olt.id}`"
          class="text-xs text-warning"
        >
          {{ olt.oltCode }} · {{ LINK_STATUS_LABEL[olt.linkStatus] }} — {{ LINK_STATUS_HINT[olt.linkStatus] }}
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { errorMessage } from '../lib/api'
import {
  getOltChildren, getNodeChildren, getSiteOlts, unlockNode, unlockOlt,
  LINK_STATUS_HINT, LINK_STATUS_LABEL,
  type MoveResult, type OnlineFocus, type OnlineNode, type OnlineOlt,
} from '../services/online.api'
import { useAuthStore } from '../stores/auth'
import OnlineMoveDialog from './OnlineMoveDialog.vue'

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
 * พิกัดโชว์เป็นตัวเลข ส่วนที่เป็นแผนที่อยู่ใน SiteOnlineMap.vue — กดที่รหัส
 * เพื่อสลับไปดูตำแหน่งของมันบนแผนที่ และรับ focus กลับมาเมื่อกดหมุดจากฝั่งโน้น
 *
 * ที่นี่แสดงโหนดที่เลิกใช้แล้วด้วย ต่างจากแผนที่ที่ไม่วาด — ต้นไม้คือประวัติของ
 * สถานี ถ้าซ่อนของเก่าไปเลย คนที่ตามหาว่า "ตู้ตัวนั้นหายไปไหน" จะหาไม่เจอ
 */
const props = defineProps<{
  siteId: string
  /** จุดที่ถูกเลือกจากแผนที่ — ต้นไม้จะกางลงไปหาให้เอง */
  focus: OnlineFocus | null
  /** รหัสสถานีนี้ — ใช้บอกในกล่องย้าย OLT ว่าตอนนี้อยู่ที่ไหน */
  siteCode?: string
  /** แก้สถานีนี้ได้ไหม (role + ขอบเขตจังหวัด) — false = ไม่มีปุ่มย้าย/ปลดล็อก */
  canEdit?: boolean
}>()

const emit = defineEmits<{ focus: [OnlineFocus] }>()

const olts = ref<OnlineOlt[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

/** ลูกที่โหลดมาแล้ว คีย์คือ id ของ OLT หรือของโหนด */
const children = ref<Record<string, OnlineNode[]>>({})
const open = ref<Record<string, boolean>>({})
const busy = ref<Record<string, boolean>>({})
/** กิ่งที่กด "แสดงทั้งหมด" แล้ว — ก่อนหน้านั้นตัดที่ PAGE แถว */
const expanded = ref<Record<string, boolean>>({})
/** แถวที่กำลังถูกชี้อยู่ — มาจากแผนที่หรือจากการกดในต้นไม้เอง */
const highlight = ref<string | null>(null)

/** จำนวนแถวที่แสดงก่อนตัด — กันไม่ให้หน้ายาวเป็นพันแถวจากการกดครั้งเดียว */
const PAGE = 50

async function loadOlts() {
  try {
    olts.value = await getSiteOlts(props.siteId)
  } catch (err) {
    error.value = errorMessage(err, 'โหลดโครงข่าย online ไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

onMounted(loadOlts)

// ─────────────────────────────────────────────────────────────────────────────
// ย้าย OLT ไปสถานีอื่น / ย้าย L2 ไป L1 อื่น (เพิ่ม 2026-10-27)
// ─────────────────────────────────────────────────────────────────────────────

const auth = useAuthStore()

/** BE เปิดให้จากหน้าแก้ไขสถานี (sites-manage) หรือหน้า OLT ลอย — ไม่มีทั้งคู่ = ปุ่มกดแล้ว 403 */
const canMove = computed(() =>
  !!props.canEdit && auth.canPage(['sites-manage', 'online-orphans']))

type MoveTarget = {
  mode: 'olt' | 'l2'
  id: string
  code: string
  currentParent: string | null
  l1Count?: number
  l2Count?: number
}

const moveTarget = ref<MoveTarget | null>(null)
const flash = ref<{ text: string; siteId?: string | null; siteCode?: string | null } | null>(null)
const unlocking = ref<string | null>(null)

/** ย้ายแล้วโครงต้นไม้เปลี่ยน — ล้างกิ่งที่โหลดไว้ทั้งหมดแล้วโหลดใหม่ ดีกว่าไล่แก้ทีละกิ่ง */
async function refresh() {
  children.value = {}
  open.value = {}
  expanded.value = {}
  await loadOlts()
}

function ticketNote(n: number): string {
  return n ? ` · Ticket ย้ายตาม ${n.toLocaleString()} ใบ` : ''
}

async function onMoved(r: MoveResult & { target: string }) {
  const t = moveTarget.value
  moveTarget.value = null
  flash.value = t?.mode === 'olt'
    ? { text: `ย้าย ${t.code} ไปสถานี ${r.target} แล้ว${ticketNote(r.tickets)}`, siteId: r.siteId, siteCode: r.siteCode }
    : { text: `ย้าย ${t?.code} ไปอยู่ใต้ ${r.target} แล้ว${ticketNote(r.tickets)}` }
  await refresh()
}

/** ปลดล็อก = ผูกกลับตามไฟล์ทันที (BE ทำให้) — OLT อาจหายจากสถานีนี้ถ้าไฟล์เขียนสถานีอื่น */
async function unlock(kind: 'olt' | 'node', id: string, code: string) {
  unlocking.value = id
  error.value = null
  try {
    const r = kind === 'olt' ? await unlockOlt(id) : await unlockNode(id)
    flash.value = kind === 'olt'
      ? {
          text: `ปลดล็อก ${code} แล้ว — ผูกตามไฟล์: ${r.siteCode ?? 'ยังไม่มีสถานีตามรหัสในไฟล์'}${ticketNote(r.tickets)}`,
          siteId: r.siteId !== props.siteId ? r.siteId : null,
          siteCode: r.siteCode,
        }
      : { text: `ปลดล็อก ${code} แล้ว — ผูกกลับตามไฟล์${ticketNote(r.tickets)}` }
    await refresh()
  } catch (err) {
    error.value = errorMessage(err, 'ปลดล็อกไม่สำเร็จ')
  } finally {
    unlocking.value = null
  }
}

/**
 * กางหนึ่งกิ่ง แล้วรอจนลูกมาถึงจริง
 * kind แยกเพราะ OLT กับโหนดคนละ endpoint (OLT อยู่คนละตาราง)
 */
async function ensureOpen(kind: 'olt' | 'node', id: string) {
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

/** กาง/พับ — โหลดจริงเฉพาะครั้งแรกที่กาง */
async function toggle(kind: 'olt' | 'node', id: string) {
  if (open.value[id]) {
    open.value[id] = false
    return
  }
  await ensureOpen(kind, id)
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

async function scrollTo(id: string) {
  await nextTick()
  document.getElementById(`online-row-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

/*
 * กดหมุดบนแผนที่แล้วต้นไม้ต้องกางลงไปถึงตัวนั้น
 *
 * ต้องคลาย expanded ของกิ่งที่คร่อมอยู่ด้วย ไม่ใช่แค่กางกิ่ง — ตัวที่ถูกชี้
 * อาจอยู่หลังแถวที่ 50 ซึ่งยังไม่ถูก render จะเลื่อนไปหาไม่เจอ
 */
watch(() => props.focus, async (f) => {
  if (!f) return
  highlight.value = f.id

  if (f.kind === 'olt') {
    await scrollTo(f.id)
    return
  }

  await ensureOpen('olt', f.oltId)
  expanded.value[f.oltId] = true

  if (f.parentId) {
    await ensureOpen('node', f.parentId)
    expanded.value[f.parentId] = true
  }

  await scrollTo(f.id)
})

function pick(target: OnlineFocus) {
  highlight.value = target.id
  emit('focus', target)
}
</script>

<template>
  <div class="card border border-base-300 bg-base-100">
    <div class="card-body gap-3 p-4">
      <div v-if="flash" role="status" class="alert alert-success py-2 text-sm">
        <span>
          {{ flash.text }}
          <RouterLink v-if="flash.siteId" :to="`/sites/${flash.siteId}/edit`" class="link font-medium">
            เปิดหน้า {{ flash.siteCode }}
          </RouterLink>
        </span>
        <button type="button" class="btn btn-xs btn-ghost" @click="flash = null">ปิด</button>
      </div>

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
            <div
              :id="`online-row-${olt.id}`"
              class="flex flex-wrap items-center gap-2 rounded-lg p-3"
              :class="{ 'bg-base-200 ring-1 ring-primary': highlight === olt.id }"
            >
              <button
                type="button"
                class="btn btn-xs btn-ghost font-mono"
                :disabled="!olt.l1Count && !olt.l2Count"
                @click="toggle('olt', olt.id)"
              >
                {{ open[olt.id] ? '▾' : '▸' }}
              </button>

              <button
                type="button"
                class="link-hover link font-mono text-sm font-semibold"
                title="ดูบนแผนที่"
                @click="pick({ id: olt.id, kind: 'olt', oltId: olt.id, parentId: null })"
              >
                {{ olt.oltCode }}
              </button>
              <span class="badge badge-sm badge-neutral">OLT</span>

              <span class="text-xs opacity-70">
                L1 {{ olt.l1Count.toLocaleString() }} · L2 {{ olt.l2Count.toLocaleString() }}
              </span>
              <span
                v-if="olt.manualLock" class="badge badge-sm badge-info badge-outline"
                :title="`ย้ายสถานีด้วยมือ — ไฟล์ระบุ ${olt.parentSiteCode ?? '(ไม่ระบุ)'} · import จะไม่ทับ`"
              >ย้ายด้วยมือ · ไฟล์ระบุ {{ olt.parentSiteCode ?? '—' }}</span>
              <span class="ml-auto text-xs opacity-60">{{ coords(olt) }}</span>
              <template v-if="canMove">
                <button
                  type="button" class="btn btn-xs btn-ghost"
                  @click="moveTarget = { mode: 'olt', id: olt.id, code: olt.oltCode, currentParent: siteCode ?? null, l1Count: olt.l1Count, l2Count: olt.l2Count }"
                >
                  ย้ายสถานี
                </button>
                <button
                  v-if="olt.manualLock" type="button" class="btn btn-xs btn-ghost"
                  :disabled="unlocking === olt.id"
                  title="ให้ไฟล์เป็นตัวตั้งอีกครั้ง — ผูกกลับตามรหัสในไฟล์ทันที"
                  @click="unlock('olt', olt.id, olt.oltCode)"
                >
                  ปลดล็อก
                </button>
              </template>
            </div>

            <!-- ชั้น L1 (และ L2 บางตัวที่ไฟล์ไม่ได้ระบุ L1 จึงห้อยกับ OLT ตรง ๆ) -->
            <div v-if="open[olt.id]" class="border-t border-base-300 px-3 pb-3">
              <p v-if="busy[olt.id]" class="py-2 text-sm opacity-70">กำลังโหลด…</p>

              <ul v-else class="flex flex-col">
                <li v-for="n in shown(olt.id)" :key="n.id" class="border-b border-base-200 last:border-0">
                  <div
                    :id="`online-row-${n.id}`"
                    class="flex flex-wrap items-center gap-2 rounded-lg py-2 pl-4"
                    :class="{ 'bg-base-200 ring-1 ring-primary': highlight === n.id }"
                  >
                    <button
                      type="button"
                      class="btn btn-xs btn-ghost font-mono"
                      :class="{ invisible: !n.childCount }"
                      @click="toggle('node', n.id)"
                    >
                      {{ open[n.id] ? '▾' : '▸' }}
                    </button>

                    <button
                      type="button"
                      class="link-hover link font-mono text-sm"
                      title="ดูบนแผนที่"
                      @click="pick({ id: n.id, kind: 'node', oltId: olt.id, parentId: null })"
                    >
                      {{ n.nodeCode }}
                    </button>
                    <span class="badge badge-sm" :class="n.level === 'l1' ? 'badge-primary' : 'badge-ghost'">
                      {{ n.level.toUpperCase() }}
                    </span>
                    <span v-if="!n.active" class="badge badge-sm badge-warning">เลิกใช้งาน</span>
                    <span v-if="n.childCount" class="text-xs opacity-70">
                      ลูก {{ n.childCount.toLocaleString() }}
                    </span>
                    <span
                      v-if="n.manualLock" class="badge badge-sm badge-info badge-outline"
                      :title="`ย้ายด้วยมือ — ไฟล์ระบุ L1 ${n.parentNodeCode ?? '(ไม่ระบุ)'} · import จะไม่ทับ`"
                    >ย้ายด้วยมือ</span>
                    <span v-if="n.active" class="ml-auto text-xs opacity-60">{{ coords(n) }}</span>
                    <template v-if="canMove && n.level === 'l2'">
                      <button
                        type="button" class="btn btn-xs btn-ghost" :class="{ 'ml-auto': !n.active }"
                        @click="moveTarget = { mode: 'l2', id: n.id, code: n.nodeCode, currentParent: null }"
                      >
                        ย้ายไป L1 อื่น
                      </button>
                      <button
                        v-if="n.manualLock" type="button" class="btn btn-xs btn-ghost"
                        :disabled="unlocking === n.id" @click="unlock('node', n.id, n.nodeCode)"
                      >
                        ปลดล็อก
                      </button>
                    </template>
                  </div>

                  <!-- ชั้น L2 -->
                  <div v-if="open[n.id]" class="pb-2 pl-10">
                    <p v-if="busy[n.id]" class="py-1 text-sm opacity-70">กำลังโหลด…</p>

                    <ul v-else class="flex flex-col">
                      <li
                        v-for="c in shown(n.id)"
                        :id="`online-row-${c.id}`"
                        :key="c.id"
                        class="flex flex-wrap items-center gap-2 rounded-lg py-1"
                        :class="{ 'bg-base-200 ring-1 ring-primary': highlight === c.id }"
                      >
                        <button
                          type="button"
                          class="link-hover link font-mono text-sm"
                          title="ดูบนแผนที่"
                          @click="pick({ id: c.id, kind: 'node', oltId: olt.id, parentId: n.id })"
                        >
                          {{ c.nodeCode }}
                        </button>
                        <span class="badge badge-sm badge-ghost">{{ c.level.toUpperCase() }}</span>
                        <span v-if="!c.active" class="badge badge-sm badge-warning">เลิกใช้งาน</span>
                        <span
                          v-if="c.manualLock" class="badge badge-sm badge-info badge-outline"
                          :title="`ย้ายด้วยมือ — ไฟล์ระบุ L1 ${c.parentNodeCode ?? '(ไม่ระบุ)'} · import จะไม่ทับ`"
                        >ย้ายด้วยมือ</span>
                        <span v-if="c.active" class="ml-auto text-xs opacity-60">{{ coords(c) }}</span>
                        <template v-if="canMove">
                          <button
                            type="button" class="btn btn-xs btn-ghost" :class="{ 'ml-auto': !c.active }"
                            @click="moveTarget = { mode: 'l2', id: c.id, code: c.nodeCode, currentParent: n.nodeCode }"
                          >
                            ย้ายไป L1 อื่น
                          </button>
                          <button
                            v-if="c.manualLock" type="button" class="btn btn-xs btn-ghost"
                            :disabled="unlocking === c.id" @click="unlock('node', c.id, c.nodeCode)"
                          >
                            ปลดล็อก
                          </button>
                        </template>
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

    <OnlineMoveDialog
      v-if="moveTarget"
      :mode="moveTarget.mode"
      :id="moveTarget.id"
      :code="moveTarget.code"
      :current-parent="moveTarget.currentParent"
      :l1-count="moveTarget.l1Count"
      :l2-count="moveTarget.l2Count"
      @close="moveTarget = null"
      @moved="onMoved"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { errorMessage } from '../../lib/api'
import {
  addTopologyCpe, addTopologyNode, deactivateTopologyCpe, deactivateTopologyNode, listManualTopology,
  type ManualCpe, type ManualNode,
} from '../../services/rings.api'
import { searchSites, type SiteLite } from '../../services/sites.api'

/**
 * เพิ่ม CPE / โหนดชั้นบนด้วยมือ + รายการที่เพิ่มด้วยมือ (dev/admin) — เฟส 1
 *
 * ของที่เพิ่มยังไม่อยู่ในวงและยังไม่ขึ้นแผนที่รวม จนกว่าจะต่อเส้น (เฟส 2)
 * พิกัดบนแผนที่ = พิกัดสถานีที่เลือก
 * ปิดใช้งานได้เฉพาะของที่เพิ่มด้วยมือซึ่งยังไม่มีเส้นต่อ (BE ตรวจซ้ำ)
 */
const emit = defineEmits<{ close: [] }>()

type Tab = 'cpe' | 'node' | 'list'
const tab = ref<Tab>('cpe')

// ---- ค้นสถานี (ทุกจังหวัด) ----
const term = ref('')
const results = ref<SiteLite[]>([])
const searching = ref(false)
const site = ref<SiteLite | null>(null)
let timer: number | null = null
let seq = 0

watch(term, (q) => {
  if (timer) clearTimeout(timer)
  if (!q.trim() || site.value) {
    results.value = []
    searching.value = false
    return
  }
  searching.value = true
  const mine = ++seq
  timer = window.setTimeout(async () => {
    try {
      const rows = await searchSites(q.trim(), 0, 10)
      if (mine === seq) results.value = rows
    } catch (err) {
      if (mine === seq) error.value = errorMessage(err, 'ค้นหาสถานีไม่สำเร็จ')
    } finally {
      if (mine === seq) searching.value = false
    }
  }, 300)
})
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

function pickSite(s: SiteLite) {
  site.value = s
  results.value = []
  term.value = ''
  if (tab.value === 'cpe' && !cpeName.value.trim()) cpeName.value = `CPE-${s.siteCode}`
}

// ---- ฟอร์ม ----
const cpeName = ref('')
const mgmtIp = ref('')
const neType = ref('')
const nodeCode = ref('')
const level = ref<'rn' | 'pn' | 'dn'>('dn')
const reason = ref('')
const saving = ref(false)
const error = ref<string | null>(null)
const done = ref<string | null>(null)

const NAME_RE = /^[A-Z0-9][A-Z0-9 _\-.()/#]{1,127}$/
const SITE_TOKEN = /^[A-Z]{3}[A-Z0-9]\d{3}$/
const clean = (v: string) => v.trim().replace(/\s+/g, ' ').toUpperCase()
const tokenOf = (name: string) => name.split(/[-_()\s]+/).find((t) => SITE_TOKEN.test(t)) ?? null

const name = computed(() => clean(tab.value === 'cpe' ? cpeName.value : nodeCode.value))
const nameError = computed(() => (name.value && !NAME_RE.test(name.value)
  ? 'ยาว 2–128 ตัว ขึ้นต้นด้วยตัวอักษรหรือตัวเลข' : null))

/** เตือนอย่างเดียว ไม่บล็อก — ชื่อที่ไม่มีรหัสสถานีก็บันทึกได้ เพราะตำแหน่งใช้สถานีที่เลือก */
const warnings = computed(() => {
  const out: string[] = []
  const token = tokenOf(name.value)
  if (site.value && token && token !== site.value.siteCode) {
    out.push(`ชื่อมีรหัส ${token} แต่เลือกสถานี ${site.value.siteCode} — ตำแหน่งบนแผนที่จะใช้ ${site.value.siteCode}`)
  }
  if (tab.value === 'node' && name.value && !name.value.startsWith(level.value.toUpperCase())) {
    out.push(`ชื่อไม่ได้ขึ้นต้นด้วย ${level.value.toUpperCase()} — ระบบใช้ระดับที่เลือกไว้`)
  }
  return out
})

const canSave = computed(() => !!site.value && !!name.value && !nameError.value
  && reason.value.trim().length >= 3 && !saving.value)

function resetForm() {
  site.value = null
  term.value = ''
  cpeName.value = ''
  mgmtIp.value = ''
  neType.value = ''
  nodeCode.value = ''
  reason.value = ''
}

watch(tab, () => {
  error.value = null
  done.value = null
  if (tab.value === 'list') loadList()
})

async function save() {
  if (!canSave.value || !site.value) return
  saving.value = true
  error.value = null
  done.value = null
  try {
    if (tab.value === 'cpe') {
      const r = await addTopologyCpe({
        cpeName: name.value, siteId: site.value.id, reason: reason.value.trim(),
        mgmtIp: mgmtIp.value.trim() || undefined, neType: neType.value.trim() || undefined,
      })
      done.value = `เพิ่ม ${r.cpeName} ที่ ${r.siteCode} แล้ว`
    } else {
      const r = await addTopologyNode({
        nodeCode: name.value, level: level.value, siteId: site.value.id, reason: reason.value.trim(),
      })
      done.value = `เพิ่มโหนด ${r.nodeCode} ที่ ${r.siteCode} แล้ว`
    }
    resetForm()
  } catch (err) {
    error.value = errorMessage(err, 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

// ---- รายการที่เพิ่มด้วยมือ ----
const cpes = ref<ManualCpe[]>([])
const nodes = ref<ManualNode[]>([])
const listLoading = ref(false)
/** แถวที่กำลังกรอกเหตุผลปิดใช้งาน: 'c:<id>' หรือ 'n:<id>' */
const closing = ref<string | null>(null)
const closeReason = ref('')

async function loadList() {
  listLoading.value = true
  try {
    const res = await listManualTopology()
    cpes.value = res.cpes
    nodes.value = res.nodes
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายการไม่สำเร็จ')
  } finally {
    listLoading.value = false
  }
}

function startClose(key: string) {
  closing.value = key
  closeReason.value = ''
  error.value = null
}

async function confirmClose() {
  const key = closing.value
  if (!key || closeReason.value.trim().length < 3) return
  saving.value = true
  error.value = null
  try {
    const [kind, id] = [key.slice(0, 1), key.slice(2)]
    if (kind === 'c') await deactivateTopologyCpe(id, closeReason.value.trim())
    else await deactivateTopologyNode(Number(id), closeReason.value.trim())
    closing.value = null
    await loadList()
  } catch (err) {
    error.value = errorMessage(err, 'ปิดใช้งานไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

const LEVEL_LABEL: Record<string, string> = { rn: 'RN', pn: 'PN', dn: 'DN', an: 'AN' }
</script>

<template>
  <div class="modal modal-open" @click.self="!saving && emit('close')">
    <div class="modal-box max-w-2xl">
      <h3 class="text-lg font-semibold">เพิ่มอุปกรณ์ / โหนดด้วยมือ</h3>
      <p class="mt-1 text-xs opacity-60">
        ของที่เพิ่มจะยังไม่อยู่ในวงและยังไม่ขึ้นแผนที่ จนกว่าจะต่อเส้น (ยังไม่เปิดให้ทำ)
        ตำแหน่งบนแผนที่ใช้พิกัดของสถานีที่เลือก
      </p>

      <div role="tablist" class="tabs tabs-boxed mt-3 w-fit">
        <button type="button" role="tab" class="tab" :class="{ 'tab-active': tab === 'cpe' }" @click="tab = 'cpe'">CPE</button>
        <button type="button" role="tab" class="tab" :class="{ 'tab-active': tab === 'node' }" @click="tab = 'node'">โหนด RN/PN/DN</button>
        <button type="button" role="tab" class="tab" :class="{ 'tab-active': tab === 'list' }" @click="tab = 'list'">ที่เพิ่มด้วยมือ</button>
      </div>

      <!-- ══ ฟอร์มเพิ่ม ══ -->
      <template v-if="tab !== 'list'">
        <div class="mt-4">
          <span class="label-text text-xs opacity-70">สถานี</span>
          <div v-if="site" class="mt-1 flex items-center gap-2">
            <span class="badge badge-lg whitespace-nowrap badge-primary badge-outline">{{ site.siteCode }}</span>
            <span v-if="site.siteName" class="text-sm opacity-70">{{ site.siteName }}</span>
            <button type="button" class="btn btn-xs btn-ghost" :disabled="saving" @click="site = null">เปลี่ยน</button>
          </div>
          <div v-else class="relative mt-1">
            <input
              v-model="term" type="search" placeholder="พิมพ์รหัสสถานี เช่น CMI0072"
              class="input input-sm input-bordered w-full" autofocus
            />
            <span v-if="searching" class="loading loading-spinner loading-xs absolute right-3 top-2 opacity-60" />
            <ul v-if="results.length" class="menu absolute z-10 mt-1 w-full rounded-box bg-base-100 p-1 shadow-lg">
              <li v-for="s in results" :key="s.id">
                <button type="button" @click="pickSite(s)">
                  <b>{{ s.siteCode }}</b>
                  <span v-if="s.siteName" class="opacity-60">{{ s.siteName }}</span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        <template v-if="tab === 'cpe'">
          <label class="form-control mt-3">
            <span class="label-text text-xs opacity-70">ชื่อ CPE</span>
            <input
              v-model="cpeName" type="text" maxlength="128" placeholder="CPE-CMI0072"
              class="input input-sm input-bordered font-mono uppercase" :class="{ 'input-error': nameError }"
            />
          </label>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <label class="form-control">
              <span class="label-text text-xs opacity-70">IP (ถ้ามี)</span>
              <input v-model="mgmtIp" type="text" maxlength="45" class="input input-sm input-bordered font-mono" />
            </label>
            <label class="form-control">
              <span class="label-text text-xs opacity-70">ชนิดอุปกรณ์ (ถ้ามี)</span>
              <input v-model="neType" type="text" maxlength="64" class="input input-sm input-bordered" />
            </label>
          </div>
        </template>

        <template v-else>
          <div class="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr]">
            <label class="form-control">
              <span class="label-text text-xs opacity-70">ระดับ</span>
              <select v-model="level" class="select select-sm select-bordered">
                <option value="rn">RN (ภาค)</option>
                <option value="pn">PN (จังหวัด)</option>
                <option value="dn">DN (อำเภอ)</option>
              </select>
            </label>
            <label class="form-control">
              <span class="label-text text-xs opacity-70">ชื่อโหนด (พิมพ์เต็ม)</span>
              <input
                v-model="nodeCode" type="text" maxlength="128" placeholder="DN-CMI0072-2"
                class="input input-sm input-bordered font-mono uppercase" :class="{ 'input-error': nameError }"
              />
            </label>
          </div>
        </template>

        <p v-if="nameError" class="mt-1 text-xs text-error">{{ nameError }}</p>
        <p v-for="w in warnings" :key="w" class="mt-1 text-xs text-warning">{{ w }}</p>

        <label class="form-control mt-3">
          <span class="label-text text-xs opacity-70">เหตุผล (บังคับ)</span>
          <textarea v-model="reason" rows="2" maxlength="1000" class="textarea textarea-bordered text-sm" />
        </label>
      </template>

      <!-- ══ รายการที่เพิ่มด้วยมือ ══ -->
      <template v-else>
        <div v-if="listLoading" class="mt-4 flex justify-center">
          <span class="loading loading-spinner opacity-60" />
        </div>
        <template v-else>
          <p v-if="!cpes.length && !nodes.length" class="mt-4 text-sm opacity-60">ยังไม่มีของที่เพิ่มด้วยมือ</p>
          <div v-else class="mt-3 max-h-[50vh] overflow-auto">
            <table class="table table-sm">
              <thead>
                <tr><th>ชนิด</th><th>ชื่อ</th><th>สถานี</th><th>สถานะ</th><th /></tr>
              </thead>
              <tbody>
                <template v-for="d in cpes" :key="`c:${d.id}`">
                  <tr :class="{ 'opacity-50': d.status === 'removed' }">
                    <td class="whitespace-nowrap">CPE</td>
                    <td class="font-mono text-xs">{{ d.cpeName }}</td>
                    <td class="whitespace-nowrap font-mono text-xs">{{ d.siteCode }}</td>
                    <td class="whitespace-nowrap text-xs">
                      <template v-if="d.status === 'removed'">ปิดใช้งาน</template>
                      <template v-else>{{ d.linkCount }} เส้น · {{ d.ringCount }} วง</template>
                    </td>
                    <td class="text-right">
                      <button
                        v-if="d.status !== 'removed'" type="button" class="btn btn-ghost btn-xs whitespace-nowrap"
                        :disabled="saving || d.linkCount > 0 || d.ringCount > 0"
                        :title="d.linkCount || d.ringCount ? 'ยังมีเส้นต่ออยู่' : ''"
                        @click="startClose(`c:${d.id}`)"
                      >ปิดใช้งาน</button>
                    </td>
                  </tr>
                  <tr v-if="closing === `c:${d.id}`">
                    <td colspan="5">
                      <div class="flex gap-2">
                        <input v-model="closeReason" type="text" placeholder="เหตุผลที่ปิดใช้งาน" class="input input-xs input-bordered flex-1" />
                        <button type="button" class="btn btn-error btn-xs" :disabled="saving || closeReason.trim().length < 3" @click="confirmClose">ยืนยัน</button>
                        <button type="button" class="btn btn-ghost btn-xs" @click="closing = null">ยกเลิก</button>
                      </div>
                    </td>
                  </tr>
                </template>
                <template v-for="n in nodes" :key="`n:${n.id}`">
                  <tr :class="{ 'opacity-50': !n.isActive }">
                    <td class="whitespace-nowrap">{{ LEVEL_LABEL[n.nodeType ?? ''] ?? 'โหนด' }}</td>
                    <td class="font-mono text-xs">{{ n.nodeCode }}</td>
                    <td class="whitespace-nowrap font-mono text-xs">{{ n.siteCode ?? '—' }}</td>
                    <td class="whitespace-nowrap text-xs">
                      <template v-if="!n.isActive">ปิดใช้งาน</template>
                      <template v-else>{{ n.linkCount }} เส้น · ใช้ใน {{ n.useCount }} วง</template>
                    </td>
                    <td class="text-right">
                      <button
                        v-if="n.isActive" type="button" class="btn btn-ghost btn-xs whitespace-nowrap"
                        :disabled="saving || n.linkCount > 0 || n.useCount > 0"
                        @click="startClose(`n:${n.id}`)"
                      >ปิดใช้งาน</button>
                    </td>
                  </tr>
                  <tr v-if="closing === `n:${n.id}`">
                    <td colspan="5">
                      <div class="flex gap-2">
                        <input v-model="closeReason" type="text" placeholder="เหตุผลที่ปิดใช้งาน" class="input input-xs input-bordered flex-1" />
                        <button type="button" class="btn btn-error btn-xs" :disabled="saving || closeReason.trim().length < 3" @click="confirmClose">ยืนยัน</button>
                        <button type="button" class="btn btn-ghost btn-xs" @click="closing = null">ยกเลิก</button>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>
      </template>

      <div v-if="error" role="alert" class="alert alert-error mt-3 text-sm">{{ error }}</div>
      <div v-if="done" role="status" class="alert alert-success mt-3 text-sm">{{ done }}</div>

      <div class="modal-action">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="emit('close')">ปิด</button>
        <button v-if="tab !== 'list'" type="button" class="btn btn-primary btn-sm" :disabled="!canSave" @click="save">
          <span v-if="saving" class="loading loading-spinner loading-xs" />
          บันทึก
        </button>
      </div>
    </div>
  </div>
</template>

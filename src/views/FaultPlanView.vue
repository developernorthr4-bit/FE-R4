<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import { formatDate, formatDateTime } from '../lib/events'
import {
  claimFaults, exportMyTrip, googleMapsDirLinks, haversineM, listFaults, myClaims, orderByNearest, releaseClaim, RESULT_BADGE, RESULT_LABEL,
  teamClaims, updateClaim, type FaultClaim, type FaultRow, type TeamRow,
} from '../services/faults.api'
import { loadProvinces, type Province } from '../services/provinces.api'
import { useAuthStore } from '../stores/auth'

/**
 * แผนเดินทาง — 3 แท็บ
 *   ของฉัน        จุดที่จองไว้ จัดกลุ่มตามวัน = ทริป · เรียงเส้นทาง · เปิด Google Maps · ส่งออก
 *   ยังไม่มีคนจอง  จุดที่ยังไม่ตรวจและไม่มีใครจอง กรองจังหวัด จองจากตรงนี้ได้
 *   ทั้งทีม        ใครจองกี่จุด เลยกำหนดกี่จุด
 */
type Tab = 'mine' | 'unclaimed' | 'team'
const auth = useAuthStore()
const canClaim = computed(() => auth.can('editor'))
const tab = ref<Tab>(canClaim.value ? 'mine' : 'unclaimed')
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

/* ---------- ของฉัน ---------- */
const mine = ref<FaultClaim[]>([])
const mineOpen = ref(0)
const mineLimit = ref(50)
const today = ref('')
const withDone = ref(false)
const mineLoading = ref(false)
const myPos = ref<[number, number] | null>(null)
const gpsBusy = ref(false)

async function loadMine() {
  mineLoading.value = true
  error.value = null
  try {
    const r = await myClaims(withDone.value)
    mine.value = r.claims
    mineOpen.value = r.open
    mineLimit.value = r.limit
    today.value = r.today
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายการของฉันไม่สำเร็จ')
  } finally {
    mineLoading.value = false
  }
}
watch(withDone, loadMine)

/** จัดกลุ่มตามวัน — เรียง "ใกล้สุดก่อน" จากตำแหน่งฉัน (ถ้ามี) ในแต่ละวัน */
const trips = computed(() => {
  const byDate = new Map<string, FaultClaim[]>()
  for (const c of mine.value) {
    const k = c.plannedDate
    if (!byDate.has(k)) byDate.set(k, [])
    byDate.get(k)!.push(c)
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => {
    const ordered = orderByNearest(items, myPos.value)
    let legM = 0
    let prev = myPos.value
    for (const c of ordered) {
      if (c.lat === null || c.lng === null) continue
      if (prev) legM += haversineM(prev, [c.lat, c.lng])
      prev = [c.lat, c.lng]
    }
    return {
      date, items: ordered, legM,
      overdue: items.some((c) => c.overdue), done: items.filter((c) => c.doneAt).length,
      links: googleMapsDirLinks(ordered.filter((c) => !c.doneAt), myPos.value),
    }
  })
})
const dateLabel = (d: string) => {
  if (d === today.value) return 'วันนี้'
  const diff = Math.round((Date.parse(d) - Date.parse(today.value)) / 86_400_000)
  if (diff === 1) return 'พรุ่งนี้'
  if (diff === -1) return 'เมื่อวาน'
  return formatDate(d)
}

function locate() {
  if (!('geolocation' in navigator)) { error.value = 'เบราว์เซอร์นี้ไม่มีตำแหน่ง'; return }
  gpsBusy.value = true
  navigator.geolocation.getCurrentPosition(
    (p) => { gpsBusy.value = false; myPos.value = [p.coords.latitude, p.coords.longitude] },
    () => { gpsBusy.value = false; error.value = 'อ่านตำแหน่ง GPS ไม่ได้' },
    { enableHighAccuracy: true, timeout: 10_000 },
  )
}

const editing = ref<{ claim: FaultClaim; date: string; note: string } | null>(null)
const saving = ref(false)
async function saveEdit() {
  const e = editing.value
  if (!e || saving.value) return
  saving.value = true
  try {
    await updateClaim(e.claim.id, { plannedDate: e.date, note: e.note.trim() || null })
    editing.value = null
    await loadMine()
  } catch (err) {
    error.value = errorMessage(err, 'แก้การจองไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}
async function release(c: FaultClaim) {
  if (!window.confirm(`ปล่อยจอง ${c.cmNo}? จุดนี้จะกลับไปให้คนอื่นจองได้`)) return
  try {
    await releaseClaim(c.id)
    notice.value = `ปล่อยจอง ${c.cmNo} แล้ว`
    await Promise.all([loadMine(), tab.value === 'unclaimed' ? loadUnclaimed() : Promise.resolve()])
  } catch (err) {
    error.value = errorMessage(err, 'ปล่อยจองไม่สำเร็จ')
  }
}
async function releaseTrip(date: string, items: FaultClaim[]) {
  const open = items.filter((c) => !c.doneAt)
  if (!open.length || !window.confirm(`ปล่อยจองทั้งวัน ${dateLabel(date)} (${open.length} จุด)?`)) return
  try {
    for (const c of open) await releaseClaim(c.id)
    notice.value = `ปล่อยจอง ${open.length} จุดแล้ว`
    await loadMine()
  } catch (err) {
    error.value = errorMessage(err, 'ปล่อยจองไม่สำเร็จ')
    await loadMine()
  }
}
const exporting = ref(false)
async function exportTrip(date?: string) {
  exporting.value = true
  try { await exportMyTrip(date) } catch (err) { error.value = errorMessage(err, 'ส่งออกไม่สำเร็จ') } finally { exporting.value = false }
}

/* ---------- ยังไม่มีคนจอง ---------- */
const PAGE = 50
const provinces = ref<Province[]>([])
const uf = reactive({ province: '' as number | '', q: '', offset: 0 })
const unclaimed = ref<FaultRow[]>([])
const unclaimedTotal = ref(0)
const unclaimedLoading = ref(false)
const picked = reactive(new Set<string>())

async function loadUnclaimed() {
  unclaimedLoading.value = true
  error.value = null
  try {
    const r = await listFaults({ audit: 'none', claim: 'none', geo: '1', province: uf.province, q: uf.q, limit: PAGE, offset: uf.offset })
    unclaimed.value = r.faults
    unclaimedTotal.value = r.total
  } catch (err) {
    error.value = errorMessage(err, 'โหลดรายการไม่สำเร็จ')
  } finally {
    unclaimedLoading.value = false
  }
}
watch(() => [uf.province, uf.q, uf.offset], () => { if (tab.value === 'unclaimed') void loadUnclaimed() })
function togglePick(id: string) { if (picked.has(id)) picked.delete(id); else picked.add(id) }

const claimBox = ref<{ ids: string[]; date: string; note: string } | null>(null)
const claiming = ref(false)
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE') }
function openClaim(ids: string[]) { if (ids.length) claimBox.value = { ids, date: tomorrow(), note: '' } }
async function submitClaim() {
  const c = claimBox.value
  if (!c || claiming.value) return
  claiming.value = true
  error.value = null
  try {
    const r = await claimFaults(c.ids, c.date, c.note)
    notice.value = `จองแล้ว ${r.claimed} จุด${r.skipped.length ? ` · ข้าม ${r.skipped.length} (${r.skipped.map((s) => s.reason).join(', ')})` : ''} — ค้าง ${r.open}/${r.limit}`
    claimBox.value = null
    picked.clear()
    await Promise.all([loadUnclaimed(), loadMine()])
  } catch (err) {
    error.value = errorMessage(err, 'จองไม่สำเร็จ')
  } finally {
    claiming.value = false
  }
}

/* ---------- ทั้งทีม ---------- */
const team = ref<TeamRow[]>([])
const teamLoading = ref(false)
async function loadTeam() {
  teamLoading.value = true
  try { team.value = (await teamClaims()).team } catch (err) { error.value = errorMessage(err, 'โหลดภาพรวมทีมไม่สำเร็จ') } finally { teamLoading.value = false }
}

watch(tab, (t) => {
  if (t === 'unclaimed' && !unclaimed.value.length) void loadUnclaimed()
  if (t === 'team') void loadTeam()
}, { immediate: true })

onMounted(async () => {
  if (canClaim.value) void loadMine()
  try { provinces.value = await loadProvinces() } catch { /* ตัวกรองจังหวัดไม่มีก็ใช้ได้ */ }
})
</script>

<template>
  <AppLayout>
    <PageHeader title="แผนเดินทาง (จองจุดซ่อม)" description="จุดที่จองไว้ว่าจะไป จัดกลุ่มตามวัน — เรียงเส้นทาง เปิดนำทาง และส่งออกให้ทีม">
      <template #actions>
        <RouterLink to="/faults/map" class="btn btn-ghost btn-sm">แผนที่</RouterLink>
        <RouterLink to="/faults" class="btn btn-ghost btn-sm">รายการ</RouterLink>
      </template>
    </PageHeader>

    <div role="tablist" class="tabs tabs-boxed mb-4 w-fit">
      <button v-if="canClaim" role="tab" class="tab" :class="{ 'tab-active': tab === 'mine' }" @click="tab = 'mine'">ของฉัน <span v-if="mineOpen" class="badge badge-sm ml-1">{{ mineOpen }}</span></button>
      <button role="tab" class="tab" :class="{ 'tab-active': tab === 'unclaimed' }" @click="tab = 'unclaimed'">ยังไม่มีคนจอง</button>
      <button role="tab" class="tab" :class="{ 'tab-active': tab === 'team' }" @click="tab = 'team'">ทั้งทีม</button>
    </div>

    <div v-if="notice" role="status" class="alert alert-success mb-4 text-sm"><span>{{ notice }}</span><button type="button" class="btn btn-ghost btn-xs" @click="notice = null">✕</button></div>
    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm"><span>{{ error }}</span></div>

    <!-- ══ ของฉัน ══ -->
    <template v-if="tab === 'mine'">
      <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span class="opacity-70">จองค้าง {{ mineOpen }} / {{ mineLimit }} จุด</span>
        <button type="button" class="btn btn-xs" :disabled="gpsBusy" @click="locate"><span v-if="gpsBusy" class="loading loading-spinner loading-xs" />📍 {{ myPos ? 'อัปเดตตำแหน่งฉัน' : 'ใช้ตำแหน่งฉันเรียงเส้นทาง' }}</button>
        <label class="flex cursor-pointer items-center gap-1 text-xs"><input v-model="withDone" type="checkbox" class="checkbox checkbox-xs">แสดงที่ทำเสร็จ (30 วัน)</label>
        <button type="button" class="btn btn-xs ml-auto" :disabled="exporting || !mine.length" @click="exportTrip()">ส่งออกทั้งหมด</button>
      </div>

      <div v-if="mineLoading && !mine.length" class="mt-10 flex justify-center"><span class="loading loading-spinner loading-lg opacity-60" /></div>
      <div v-else-if="!trips.length" class="card border border-base-300 bg-base-100"><div class="card-body text-sm opacity-70">ยังไม่ได้จองจุดไหน — ไปเลือกจาก <RouterLink to="/faults/map" class="link link-primary">แผนที่</RouterLink> หรือแท็บ "ยังไม่มีคนจอง"</div></div>

      <div v-for="t in trips" :key="t.date" class="card mb-3 border border-base-300 bg-base-100">
        <div class="card-body gap-2 p-4">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-sm font-semibold">{{ dateLabel(t.date) }} <span class="font-normal opacity-60">{{ formatDate(t.date) }}</span></h2>
            <span class="badge badge-sm badge-ghost">{{ t.items.length }} จุด<template v-if="t.done"> · เสร็จ {{ t.done }}</template></span>
            <span v-if="t.overdue" class="badge badge-sm badge-error">เลยกำหนด</span>
            <span v-if="myPos && t.legM" class="text-xs opacity-60">≈ {{ (t.legM / 1000).toFixed(0) }} กม. (เส้นตรง)</span>
            <div class="ml-auto flex flex-wrap gap-1">
              <a v-for="(l, i) in t.links" :key="l" :href="l" target="_blank" rel="noopener" class="btn btn-xs btn-primary">🧭 นำทาง{{ t.links.length > 1 ? ` ช่วง ${i + 1}` : '' }}</a>
              <button type="button" class="btn btn-xs" :disabled="exporting" @click="exportTrip(t.date)">Excel</button>
              <button type="button" class="btn btn-xs btn-ghost text-error" @click="releaseTrip(t.date, t.items)">ปล่อยทั้งวัน</button>
            </div>
          </div>
          <ol class="divide-y divide-base-200">
            <li v-for="(c, i) in t.items" :key="c.id" class="flex flex-wrap items-center gap-2 py-1.5 text-sm" :class="{ 'opacity-50': c.doneAt }">
              <span class="w-5 text-right font-mono text-xs opacity-50">{{ i + 1 }}</span>
              <RouterLink :to="`/faults/${c.faultId}`" class="link link-primary font-mono text-xs">{{ c.cmNo }}</RouterLink>
              <span class="font-mono text-xs">{{ c.siteCode ?? '—' }}</span>
              <span class="text-xs opacity-70">{{ c.provinceName }}</span>
              <span class="max-w-64 truncate text-xs opacity-70" :title="c.subRootCause ?? ''">{{ c.rootCauseKey }}</span>
              <span v-if="c.note" class="text-xs italic opacity-60">"{{ c.note }}"</span>
              <span v-if="c.lat === null" class="badge badge-xs badge-warning">ไม่มีพิกัด</span>
              <span v-if="c.auditResult" class="badge badge-xs" :class="RESULT_BADGE[c.auditResult]">{{ RESULT_LABEL[c.auditResult] }}</span>
              <div class="ml-auto flex gap-1">
                <a v-if="c.lat !== null" :href="`https://www.google.com/maps?q=${c.lat},${c.lng}`" target="_blank" rel="noopener" class="btn btn-ghost btn-xs">แผนที่</a>
                <template v-if="!c.doneAt">
                  <RouterLink :to="`/faults/${c.faultId}`" class="btn btn-xs">ลงข้อมูล</RouterLink>
                  <button type="button" class="btn btn-ghost btn-xs" @click="editing = { claim: c, date: c.plannedDate, note: c.note ?? '' }">เลื่อน</button>
                  <button type="button" class="btn btn-ghost btn-xs text-error" @click="release(c)">ปล่อย</button>
                </template>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </template>

    <!-- ══ ยังไม่มีคนจอง ══ -->
    <template v-else-if="tab === 'unclaimed'">
      <div class="mb-3 flex flex-wrap items-end gap-2">
        <label class="form-control">
          <span class="label-text text-xs opacity-70">จังหวัด</span>
          <select v-model="uf.province" class="select select-sm select-bordered" @change="uf.offset = 0">
            <option value="">ทุกจังหวัด</option>
            <option v-for="p in provinces" :key="p.id" :value="p.id">{{ p.nameTh }}</option>
          </select>
        </label>
        <label class="form-control">
          <span class="label-text text-xs opacity-70">ค้นหา</span>
          <input v-model="uf.q" type="search" placeholder="CM · สถานี" class="input input-sm input-bordered" @input="uf.offset = 0">
        </label>
        <span class="text-xs opacity-60">เฉพาะจุดที่ยังไม่ตรวจ ไม่มีใครจอง และมีพิกัด — {{ unclaimedTotal.toLocaleString() }} จุด</span>
        <button v-if="canClaim" type="button" class="btn btn-sm btn-primary ml-auto" :disabled="!picked.size" @click="openClaim([...picked])">จอง {{ picked.size || '' }} จุดที่เลือก</button>
      </div>
      <div v-if="unclaimedLoading" class="mt-10 flex justify-center"><span class="loading loading-spinner loading-lg opacity-60" /></div>
      <div v-else class="card overflow-x-auto border border-base-300 bg-base-100">
        <table class="table table-sm">
          <thead><tr><th v-if="canClaim" /><th>CM</th><th>ปิดงาน</th><th>สถานี</th><th>จังหวัด</th><th>สาเหตุ</th><th /></tr></thead>
          <tbody>
            <tr v-for="r in unclaimed" :key="r.id" class="hover">
              <td v-if="canClaim"><input type="checkbox" class="checkbox checkbox-xs" :checked="picked.has(r.id)" @change="togglePick(r.id)"></td>
              <td><RouterLink :to="`/faults/${r.id}`" class="link link-primary font-mono text-xs">{{ r.cmNo }}</RouterLink></td>
              <td class="whitespace-nowrap text-xs">{{ formatDateTime(r.completeAt) }}</td>
              <td class="font-mono text-xs">{{ r.siteCode ?? '—' }}</td>
              <td class="text-xs">{{ r.provinceName ?? '—' }}</td>
              <td class="max-w-64 truncate text-xs" :title="r.subRootCause ?? ''">{{ r.rootCauseKey }}<span v-if="r.subRootCause" class="opacity-60"> · {{ r.subRootCause }}</span></td>
              <td class="text-right"><button v-if="canClaim" type="button" class="btn btn-xs" @click="openClaim([r.id])">จอง</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-3 flex items-center justify-between text-sm">
        <span class="opacity-70">หน้า {{ Math.floor(uf.offset / PAGE) + 1 }} จาก {{ Math.max(1, Math.ceil(unclaimedTotal / PAGE)) }}</span>
        <div class="join">
          <button type="button" class="btn btn-sm join-item" :disabled="uf.offset === 0" @click="uf.offset = Math.max(uf.offset - PAGE, 0)">ก่อนหน้า</button>
          <button type="button" class="btn btn-sm join-item" :disabled="uf.offset + PAGE >= unclaimedTotal" @click="uf.offset += PAGE">ถัดไป</button>
        </div>
      </div>
    </template>

    <!-- ══ ทั้งทีม ══ -->
    <template v-else>
      <div v-if="teamLoading" class="mt-10 flex justify-center"><span class="loading loading-spinner loading-lg opacity-60" /></div>
      <div v-else-if="!team.length" class="card border border-base-300 bg-base-100"><div class="card-body text-sm opacity-70">ยังไม่มีใครจอง</div></div>
      <div v-else class="card overflow-x-auto border border-base-300 bg-base-100">
        <table class="table table-sm">
          <thead><tr><th>ผู้ตรวจ</th><th class="text-right">จองค้าง</th><th class="text-right">เลยกำหนด</th><th>ทริปถัดไป</th><th class="text-right">ทำเสร็จ 30 วัน</th></tr></thead>
          <tbody>
            <tr v-for="t in team" :key="t.userId" :class="{ 'font-semibold': t.userId === auth.user?.id }">
              <td>{{ t.userName }}<span v-if="t.userId === auth.user?.id" class="ml-1 text-xs opacity-60">(ฉัน)</span></td>
              <td class="text-right">{{ t.open }}</td>
              <td class="text-right" :class="t.overdue ? 'text-error' : 'opacity-40'">{{ t.overdue }}</td>
              <td class="text-xs">{{ t.nextDate ? formatDate(t.nextDate) : '—' }}</td>
              <td class="text-right">{{ t.done30 }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-xs opacity-60">เลยกำหนด = จองไว้แต่เลยวันที่วางแผนมาเกิน 7 วันและยังไม่ลงผล — ผู้บันทึกข้อมูลขึ้นไปปล่อยจองของคนอื่นได้จากหน้าจุดนั้น</p>
    </template>

    <!-- เลื่อนวัน -->
    <div v-if="editing" class="modal modal-open" @click.self="editing = null">
      <div class="modal-box">
        <h3 class="text-lg font-semibold">เลื่อน {{ editing.claim.cmNo }}</h3>
        <div class="mt-3 grid gap-3">
          <label class="form-control"><span class="label-text text-xs opacity-70">วันที่จะไป</span><input v-model="editing.date" type="date" class="input input-sm input-bordered w-full"></label>
          <label class="form-control"><span class="label-text text-xs opacity-70">โน้ต</span><input v-model="editing.note" type="text" maxlength="500" class="input input-sm input-bordered w-full"></label>
        </div>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" :disabled="saving" @click="editing = null">ยกเลิก</button>
          <button type="button" class="btn btn-primary" :disabled="saving || !editing.date" @click="saveEdit"><span v-if="saving" class="loading loading-spinner loading-xs" />บันทึก</button>
        </div>
      </div>
    </div>

    <!-- จอง -->
    <div v-if="claimBox" class="modal modal-open" @click.self="claimBox = null">
      <div class="modal-box">
        <h3 class="text-lg font-semibold">จอง {{ claimBox.ids.length }} จุด</h3>
        <div class="mt-3 grid gap-3">
          <label class="form-control"><span class="label-text text-xs opacity-70">วันที่จะไป *</span><input v-model="claimBox.date" type="date" class="input input-sm input-bordered w-full"></label>
          <label class="form-control"><span class="label-text text-xs opacity-70">โน้ต</span><input v-model="claimBox.note" type="text" maxlength="500" class="input input-sm input-bordered w-full"></label>
        </div>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" :disabled="claiming" @click="claimBox = null">ยกเลิก</button>
          <button type="button" class="btn btn-primary" :disabled="claiming || !claimBox.date" @click="submitClaim"><span v-if="claiming" class="loading loading-spinner loading-xs" />จอง</button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

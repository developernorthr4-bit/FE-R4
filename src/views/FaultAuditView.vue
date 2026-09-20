<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import { formatDate, formatDateTime } from '../lib/events'
import { resizeImage } from '../lib/image-resize'
import {
  claimFaults, deleteAudit, deleteFaultPhoto, getFault, loadFaultLookups, releaseClaim, RESULT_BADGE, RESULT_COLOR, RESULT_LABEL, saveAudit,
  uploadFaultPhoto, type AuditInput, type FaultDetail, type FaultLookups, type FaultPhoto,
} from '../services/faults.api'
import { useAuthStore } from '../stores/auth'

/**
 * หน้าจุดซ่อม 1 CM — ข้อมูลจากไฟล์ NOC (อ่านอย่างเดียว) + ฟอร์มผลตรวจ + รูป
 * ผลตรวจมีได้ผลเดียว บันทึกซ้ำ = แก้ทับ · ต้องบันทึกผลก่อนจึงแนบรูปได้ (รูปห้อยกับผล)
 */
const route = useRoute()
const auth = useAuthStore()
const faultId = computed(() => String(route.params.id))

const detail = ref<FaultDetail | null>(null)
const lookups = ref<FaultLookups | null>(null)
const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)
const gpsBusy = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const uploading = ref<{ done: number; total: number } | null>(null)
const lightbox = ref<FaultPhoto | null>(null)
const confirmDelete = ref(false)

const fault = computed(() => detail.value?.fault ?? null)
const audit = computed(() => detail.value?.audit ?? null)
const claim = computed(() => detail.value?.claim ?? null)
const photos = computed(() => detail.value?.photos ?? [])
const canAudit = computed(() => detail.value?.can.audit ?? false)

const today = new Date().toLocaleDateString('sv-SE')
const form = reactive<AuditInput>({ result: '', solutionId: '', repairLengthM: null, note: '', auditDate: today, lat: null, lng: null })

function fillForm() {
  const a = audit.value
  Object.assign(form, a
    ? { result: a.result, solutionId: a.solutionId ?? '', repairLengthM: a.repairLengthM, note: a.note ?? '', auditDate: a.auditDate, lat: a.lat, lng: a.lng }
    : { result: '', solutionId: '', repairLengthM: null, note: '', auditDate: today, lat: null, lng: null })
}

async function load() {
  loading.value = true
  error.value = null
  try {
    ;[detail.value, lookups.value] = await Promise.all([getFault(faultId.value), loadFaultLookups()])
    fillForm()
  } catch (err) {
    error.value = errorMessage(err, 'โหลดจุดซ่อมไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function save() {
  if (!form.result) { error.value = 'เลือกผลตรวจก่อน'; return }
  if (form.result === 'not_pass' && !form.solutionId) { error.value = 'ไม่ผ่านต้องระบุวิธีซ่อม'; return }
  saving.value = true
  error.value = null
  notice.value = null
  try {
    detail.value = await saveAudit(faultId.value, form)
    fillForm()
    notice.value = 'บันทึกผลตรวจแล้ว'
    drawMap()
  } catch (err) {
    error.value = errorMessage(err, 'บันทึกผลตรวจไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

async function removeAudit() {
  deleting.value = true
  try {
    await deleteAudit(faultId.value)
    confirmDelete.value = false
    await load()
    notice.value = 'ลบผลตรวจแล้ว'
    drawMap()
  } catch (err) {
    error.value = errorMessage(err, 'ลบผลตรวจไม่สำเร็จ')
  } finally {
    deleting.value = false
  }
}

function useGps() {
  if (!navigator.geolocation) { error.value = 'เบราว์เซอร์นี้ไม่รองรับ GPS'; return }
  gpsBusy.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      form.lat = Number(pos.coords.latitude.toFixed(6))
      form.lng = Number(pos.coords.longitude.toFixed(6))
      gpsBusy.value = false
      drawMap()
    },
    () => { error.value = 'อ่านตำแหน่ง GPS ไม่ได้'; gpsBusy.value = false },
    { enableHighAccuracy: true, timeout: 10_000 },
  )
}
function clearGps() { form.lat = null; form.lng = null; drawMap() }

/* ---------- การจอง ---------- */
const claimBox = ref<{ date: string; note: string } | null>(null)
const claimBusy = ref(false)
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE') }
async function submitClaim() {
  const c = claimBox.value
  if (!c || claimBusy.value) return
  claimBusy.value = true
  error.value = null
  try {
    const r = await claimFaults([faultId.value], c.date, c.note)
    if (r.skipped.length) error.value = `จองไม่ได้ — ${r.skipped[0]!.reason}`
    else notice.value = r.moved ? 'เลื่อนวันที่จะไปแล้ว' : `จองแล้ว — ค้าง ${r.open}/${r.limit} จุด`
    claimBox.value = null
    detail.value = await getFault(faultId.value)
  } catch (err) {
    error.value = errorMessage(err, 'จองไม่สำเร็จ')
  } finally {
    claimBusy.value = false
  }
}
async function release() {
  const c = claim.value
  if (!c || !window.confirm(`ปล่อยจองของ ${c.userName}?`)) return
  claimBusy.value = true
  try {
    await releaseClaim(c.id)
    notice.value = 'ปล่อยจองแล้ว'
    detail.value = await getFault(faultId.value)
  } catch (err) {
    error.value = errorMessage(err, 'ปล่อยจองไม่สำเร็จ')
  } finally {
    claimBusy.value = false
  }
}

/* ---------- รูป ---------- */
async function onFiles(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length || !detail.value) return
  uploading.value = { done: 0, total: files.length }
  error.value = null
  for (const f of files) {
    try {
      const r = await resizeImage(f)
      const photo = await uploadFaultPhoto(faultId.value, r.blob, {
        width: r.width, height: r.height, takenAt: f.lastModified ? new Date(f.lastModified).toISOString() : null,
      })
      detail.value.photos.push(photo)
    } catch (err) {
      error.value = errorMessage(err, `อัปโหลด ${f.name} ไม่สำเร็จ`)
    }
    uploading.value.done++
  }
  uploading.value = null
}

async function removePhoto(p: FaultPhoto) {
  if (!detail.value || !window.confirm('ลบรูปนี้?')) return
  try {
    await deleteFaultPhoto(faultId.value, p.id)
    detail.value.photos = detail.value.photos.filter((x) => x.id !== p.id)
  } catch (err) {
    error.value = errorMessage(err, 'ลบรูปไม่สำเร็จ')
  }
}

/* ---------- แผนที่เล็ก — จุดจากไฟล์ (สีตามผล) + จุดที่ผู้ตรวจยืน ---------- */
const el = ref<HTMLDivElement | null>(null)
const map = shallowRef<L.Map | null>(null)
const layer = shallowRef<L.LayerGroup | null>(null)
const renderer = shallowRef<L.Canvas | null>(null)

function initMap() {
  if (!el.value || map.value) return
  const m = L.map(el.value, { preferCanvas: true, minZoom: 5, maxZoom: 19, zoomAnimationThreshold: 2 })
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m)
  renderer.value = L.canvas({ padding: 0.3 })
  layer.value = L.layerGroup().addTo(m)
  map.value = m
  drawMap()
}

function drawMap() {
  const m = map.value
  const g = layer.value
  if (!m || !g) return
  g.clearLayers()
  const rend = renderer.value ?? undefined
  const pts: [number, number][] = []
  const f = fault.value
  if (f?.lat !== null && f?.lat !== undefined && f.lng !== null) {
    const color = RESULT_COLOR[form.result || 'none']
    L.circleMarker([f.lat, f.lng], { radius: 9, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 0.95, renderer: rend })
      .bindTooltip(`จุดซ่อมจากไฟล์ (${f.locSource === 'arrive' ? 'Arrive' : 'Complete'} Location)`, { direction: 'top', offset: [0, -8] })
      .addTo(g)
    pts.push([f.lat, f.lng])
  }
  if (form.lat !== null && form.lng !== null) {
    L.circleMarker([form.lat, form.lng], { radius: 7, color: '#111827', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.95, renderer: rend })
      .bindTooltip('จุดที่ผู้ตรวจยืน', { direction: 'top', offset: [0, -8] })
      .addTo(g)
    pts.push([form.lat, form.lng])
    if (pts.length === 2) L.polyline(pts, { color: '#3b82f6', weight: 2, dashArray: '4 4', interactive: false, renderer: rend }).addTo(g)
  }
  if (pts.length === 1) m.setView(pts[0]!, 15, { animate: false })
  else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.3), { animate: false })
  else m.setView([18.79, 99.0], 7, { animate: false })
}

watch(loading, async (v) => { if (!v) { await nextTick(); initMap(); map.value?.invalidateSize() } })
watch(() => form.result, drawMap)
onBeforeUnmount(() => { map.value?.remove(); map.value = null })

const gmaps = computed(() => (fault.value?.lat !== null && fault.value?.lat !== undefined ? `https://www.google.com/maps?q=${fault.value.lat},${fault.value.lng}` : null))
</script>

<template>
  <AppLayout>
    <PageHeader :title="fault?.cmNo ?? 'จุดซ่อม'" :description="fault ? `${fault.siteCode ?? '—'} · ${fault.provinceName ?? fault.provinceCode ?? '—'} · ปิดงาน ${formatDateTime(fault.completeAt)}` : ''">
      <template #actions>
        <RouterLink to="/faults" class="btn btn-ghost btn-sm">← รายการ</RouterLink>
        <RouterLink to="/faults/map" class="btn btn-ghost btn-sm">แผนที่</RouterLink>
        <span v-if="audit" class="badge" :class="RESULT_BADGE[audit.result]">{{ RESULT_LABEL[audit.result] }}</span>
        <span v-else-if="fault" class="badge badge-ghost">ยังไม่ตรวจ</span>
      </template>
    </PageHeader>

    <div v-if="notice" role="status" class="alert alert-success mb-4 text-sm"><span>{{ notice }}</span></div>
    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm"><span>{{ error }}</span></div>

    <div v-if="loading" class="mt-10 flex justify-center"><span class="loading loading-spinner loading-lg opacity-60" /></div>

    <div v-else-if="fault" class="grid gap-4 lg:grid-cols-5">
      <!-- ══ ซ้าย: ข้อมูลจากไฟล์ NOC ══ -->
      <div class="grid content-start gap-4 lg:col-span-2">
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2 p-4 text-sm">
            <h2 class="text-sm font-semibold">งานซ่อมเดิม (จากไฟล์ NOC · ชีต {{ fault.sourceSheet }})</h2>
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt class="opacity-60">Severity</dt><dd>{{ fault.severity ?? '—' }}</dd>
              <dt class="opacity-60">INC / TT</dt><dd class="break-all font-mono text-xs">{{ fault.incNo ?? '—' }}<br>{{ fault.ttNo ?? '—' }}</dd>
              <dt class="opacity-60">สถานี</dt><dd><span class="font-mono">{{ fault.siteCode ?? '—' }}</span><span v-if="fault.siteName" class="ml-1 opacity-70">{{ fault.siteName }}</span></dd>
              <dt class="opacity-60">CI</dt><dd class="font-mono text-xs">{{ fault.ciName ?? '—' }}</dd>
              <dt class="opacity-60">Root cause</dt><dd>{{ fault.rootCause ?? '—' }}</dd>
              <dt class="opacity-60">Sub cause</dt><dd>{{ fault.subRootCause ?? '—' }}</dd>
              <dt class="opacity-60">ช่างทำอะไร</dt><dd>{{ fault.completeSolution ?? '—' }}</dd>
              <dt class="opacity-60">รายละเอียด</dt><dd class="whitespace-pre-wrap">{{ fault.completeDesc ?? '—' }}</dd>
              <dt class="opacity-60">ช่าง (FME)</dt><dd class="break-all text-xs">{{ fault.fme ?? '—' }}</dd>
              <dt class="opacity-60">เกิดเหตุ</dt><dd>{{ formatDateTime(fault.firstOccurAt) }}</dd>
              <dt class="opacity-60">ถึงหน้างาน</dt><dd>{{ formatDateTime(fault.arriveAt) }}</dd>
              <dt class="opacity-60">ปิดงาน</dt><dd>{{ formatDateTime(fault.completeAt) }}</dd>
              <dt class="opacity-60">พิกัด</dt>
              <dd>
                <template v-if="fault.lat !== null">
                  <span class="font-mono text-xs">{{ fault.lat }}, {{ fault.lng }}</span>
                  <span class="ml-1 text-xs opacity-60">({{ fault.locSource === 'arrive' ? 'Arrive' : 'Complete' }} Location)</span>
                  <a v-if="gmaps" :href="gmaps" target="_blank" rel="noopener" class="link link-primary ml-2 text-xs">Google Maps</a>
                </template>
                <span v-else class="opacity-50">ไม่มีในไฟล์</span>
              </dd>
              <template v-if="fault.itemName">
                <dt class="opacity-60">อะไหล่</dt><dd class="text-xs">{{ fault.itemName }}<span v-if="fault.serialNo"> · S/N {{ fault.serialNo }}</span></dd>
              </template>
              <dt class="opacity-60">Subject</dt><dd class="break-words text-xs opacity-80">{{ fault.subject ?? '—' }}</dd>
            </dl>
          </div>
        </div>
      </div>

      <!-- ══ ขวา: การจอง + แผนที่ + ผลตรวจ + รูป ══ -->
      <div class="grid content-start gap-4 lg:col-span-3">
        <div v-if="!audit" class="card border border-base-300 bg-base-100">
          <div class="card-body flex-row flex-wrap items-center gap-3 p-4 text-sm">
            <template v-if="claim">
              <span class="size-2.5 rounded-full" :style="{ background: claim.userId === auth.user?.id ? RESULT_COLOR.mine : RESULT_COLOR.others }" />
              <span><b>{{ claim.userId === auth.user?.id ? 'ฉัน' : claim.userName }}</b> จองไว้ · จะไป {{ formatDate(claim.plannedDate) }}<span v-if="claim.note" class="opacity-70"> · "{{ claim.note }}"</span></span>
              <span v-if="claim.overdue" class="badge badge-sm badge-error">เลยกำหนด</span>
              <div v-if="canAudit" class="ml-auto flex gap-1">
                <button v-if="claim.userId === auth.user?.id" type="button" class="btn btn-xs" :disabled="claimBusy" @click="claimBox = { date: claim.plannedDate, note: claim.note ?? '' }">เลื่อนวัน</button>
                <button type="button" class="btn btn-xs btn-ghost text-error" :disabled="claimBusy" @click="release">ปล่อยจอง</button>
              </div>
            </template>
            <template v-else>
              <span class="size-2.5 rounded-full" :style="{ background: RESULT_COLOR.none }" />
              <span class="opacity-70">ยังไม่มีใครจองจุดนี้</span>
              <button v-if="canAudit" type="button" class="btn btn-xs btn-primary ml-auto" @click="claimBox = { date: tomorrow(), note: '' }">จองว่าจะไป</button>
            </template>
          </div>
        </div>

        <div class="card border border-base-300 bg-base-100">
          <div class="card-body p-2">
            <!-- 🪤 ห้ามผูก :class กับ div ที่ Leaflet ใช้ — ครอบด้วย div นี้แทน -->
            <div class="h-64 w-full overflow-hidden rounded">
              <div ref="el" class="h-full w-full" />
            </div>
          </div>
        </div>

        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-3 p-4">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold">ผลตรวจ (Audit)</h2>
              <span v-if="audit" class="text-xs opacity-60">โดย {{ audit.auditorName }} · {{ formatDateTime(audit.updatedAt) }}</span>
            </div>
            <p v-if="!canAudit" class="text-xs opacity-60">บันทึกผลได้เฉพาะผู้บันทึกข้อมูลขึ้นไป</p>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="form-control sm:col-span-2">
                <span class="label-text text-xs opacity-70">ผล *</span>
                <div class="join">
                  <button
                    v-for="(label, r) in RESULT_LABEL" :key="r" type="button" class="btn btn-sm join-item"
                    :class="form.result === r ? (r === 'pass' ? 'btn-success' : r === 'not_pass' ? 'btn-error' : 'btn-warning') : ''"
                    :disabled="!canAudit" @click="form.result = r"
                  >
                    {{ label }}
                  </button>
                </div>
              </label>
              <label class="form-control">
                <span class="label-text text-xs opacity-70">วันที่ตรวจ *</span>
                <input v-model="form.auditDate" type="date" class="input input-sm input-bordered w-full" :disabled="!canAudit">
              </label>
              <label class="form-control">
                <span class="label-text text-xs opacity-70">วิธีซ่อม {{ form.result === 'not_pass' ? '*' : '' }}</span>
                <select v-model="form.solutionId" class="select select-sm select-bordered w-full" :disabled="!canAudit || form.result !== 'not_pass'">
                  <option value="">— เลือก —</option>
                  <option v-for="s in lookups?.solutions" :key="s.id" :value="s.id">{{ s.nameTh }}</option>
                </select>
              </label>
              <label class="form-control">
                <span class="label-text text-xs opacity-70">ระยะที่ต้องซ่อม (เมตร)</span>
                <input v-model.number="form.repairLengthM" type="number" min="0" step="1" class="input input-sm input-bordered w-full" :disabled="!canAudit || form.result !== 'not_pass'" placeholder="เช่น 120">
              </label>
              <div class="form-control">
                <span class="label-text text-xs opacity-70">พิกัดที่ผู้ตรวจยืน</span>
                <div class="flex items-center gap-2 text-xs">
                  <span v-if="form.lat !== null" class="font-mono">{{ form.lat }}, {{ form.lng }}</span>
                  <span v-else class="opacity-50">ยังไม่ระบุ</span>
                  <button type="button" class="btn btn-ghost btn-xs" :disabled="!canAudit || gpsBusy" @click="useGps"><span v-if="gpsBusy" class="loading loading-spinner loading-xs" />ใช้ GPS</button>
                  <button v-if="form.lat !== null" type="button" class="btn btn-ghost btn-xs" :disabled="!canAudit" @click="clearGps">ล้าง</button>
                </div>
              </div>
              <label class="form-control sm:col-span-2">
                <span class="label-text text-xs opacity-70">หมายเหตุ</span>
                <textarea v-model="form.note" rows="3" class="textarea textarea-bordered textarea-sm w-full" :disabled="!canAudit" placeholder="สิ่งที่เจอหน้างาน สภาพจุดซ่อม สิ่งที่ต้องทำ" />
              </label>
            </div>

            <div v-if="canAudit" class="flex justify-end gap-2">
              <button v-if="audit" type="button" class="btn btn-ghost btn-sm text-error" :disabled="saving" @click="confirmDelete = true">ลบผลตรวจ</button>
              <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="save">
                <span v-if="saving" class="loading loading-spinner loading-xs" />{{ audit ? 'บันทึกทับ' : 'บันทึกผลตรวจ' }}
              </button>
            </div>
          </div>
        </div>

        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-3 p-4">
            <h2 class="text-sm font-semibold">รูปประกอบ ({{ photos.length }}/10)</h2>
            <p v-if="!audit" class="text-xs opacity-60">บันทึกผลตรวจก่อน แล้วจึงแนบรูปได้</p>
            <div class="flex flex-wrap gap-2">
              <button v-for="ph in photos" :key="ph.id" type="button" @click="lightbox = ph">
                <img v-if="ph.url" :src="ph.url" class="size-20 rounded object-cover" loading="lazy" alt="">
                <span v-else class="flex size-20 items-center justify-center rounded bg-base-200 text-xs opacity-60">ไม่มีที่เก็บ</span>
              </button>
              <label v-if="canAudit && audit && photos.length < 10" class="flex size-20 cursor-pointer items-center justify-center rounded border border-dashed border-base-300 text-xs opacity-70 hover:bg-base-200">
                <template v-if="uploading">{{ uploading.done }}/{{ uploading.total }}</template>
                <template v-else>+ รูป</template>
                <input type="file" accept="image/*" capture="environment" multiple class="hidden" :disabled="!!uploading" @change="onFiles">
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- จอง / เลื่อนวัน -->
    <div v-if="claimBox" class="modal modal-open" @click.self="claimBox = null">
      <div class="modal-box">
        <h3 class="text-lg font-semibold">{{ claim ? 'เลื่อนวันที่จะไป' : 'จองจุดนี้' }}</h3>
        <div class="mt-3 grid gap-3">
          <label class="form-control"><span class="label-text text-xs opacity-70">วันที่จะไป *</span><input v-model="claimBox.date" type="date" class="input input-sm input-bordered w-full"></label>
          <label class="form-control"><span class="label-text text-xs opacity-70">โน้ต</span><input v-model="claimBox.note" type="text" maxlength="500" class="input input-sm input-bordered w-full"></label>
        </div>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" :disabled="claimBusy" @click="claimBox = null">ยกเลิก</button>
          <button type="button" class="btn btn-primary" :disabled="claimBusy || !claimBox.date" @click="submitClaim"><span v-if="claimBusy" class="loading loading-spinner loading-xs" />บันทึก</button>
        </div>
      </div>
    </div>

    <!-- ดูรูปใหญ่ -->
    <div v-if="lightbox" class="modal modal-open" @click.self="lightbox = null">
      <div class="modal-box max-w-4xl p-2">
        <img v-if="lightbox.url" :src="lightbox.url" class="max-h-[80vh] w-full rounded object-contain" alt="">
        <div class="mt-2 flex items-center gap-2 px-2 pb-1 text-xs opacity-70">
          <span v-if="lightbox.takenAt">ถ่าย {{ formatDateTime(lightbox.takenAt) }}</span>
          <span>{{ (lightbox.sizeBytes / 1024).toFixed(0) }} KB<template v-if="lightbox.width"> · {{ lightbox.width }}×{{ lightbox.height }}</template></span>
          <button v-if="canAudit" type="button" class="btn btn-ghost btn-xs ml-auto text-error" @click="removePhoto(lightbox); lightbox = null">ลบรูป</button>
          <button type="button" class="btn btn-ghost btn-xs" @click="lightbox = null">ปิด</button>
        </div>
      </div>
    </div>

    <!-- ยืนยันลบผลตรวจ -->
    <div v-if="confirmDelete && audit" class="modal modal-open" @click.self="confirmDelete = false">
      <div class="modal-box">
        <h3 class="text-lg font-semibold">ลบผลตรวจของ {{ fault?.cmNo }}?</h3>
        <div role="alert" class="alert alert-warning mt-4 text-sm"><span>ลบแล้วหายถาวร รวมรูป {{ photos.length }} รูป — ข้อมูล CM จากไฟล์ยังอยู่</span></div>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost" :disabled="deleting" @click="confirmDelete = false">ยกเลิก</button>
          <button type="button" class="btn btn-error" :disabled="deleting" @click="removeAudit"><span v-if="deleting" class="loading loading-spinner loading-xs" />ลบถาวร</button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

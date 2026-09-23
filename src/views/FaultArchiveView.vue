<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import { formatDateTime } from '../lib/events'
import { exportArchive, getArchivePreview, runArchive, type ArchivePreview } from '../services/faults.api'
import { useFlashStore } from '../stores/flash'

/**
 * archive จุดซ่อม CM — กฎ: ซ่อมเสร็จเกิน 12 เดือน ลบออกจากระบบทั้งหมด (ผลตรวจ รูป การจอง ตามไปด้วย)
 *
 * เหตุผลคือโควตา Supabase free 500 MB — ไฟล์ NOC เดือนละ ~11k แถว เก็บตลอดไปไม่ไหว
 * ทำด้วยมือเป็น 2 ขั้นโดยตั้งใจ: ต้องโหลด xlsx ของชุดที่จะลบให้เสร็จก่อน ปุ่มลบถึงจะเปิด
 * และตอนลบต้องส่งจำนวนที่เห็นตอนพรีวิวไปด้วย ถ้าระหว่างนั้นมีคนนำเข้าเพิ่ม BE จะปฏิเสธ
 */
const router = useRouter()
const flash = useFlashStore()

const before = ref('')
const preview = ref<ArchivePreview | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const downloading = ref(false)
/** โหลดไฟล์ของวันตัดนี้สำเร็จแล้ว — ปุ่มลบเปิดเฉพาะเมื่อตรงกับ before ปัจจุบัน */
const downloadedFor = ref<string | null>(null)
const deleting = ref(false)
const confirmText = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    preview.value = await getArchivePreview(before.value || undefined)
    before.value = preview.value.before
  } catch (err) {
    preview.value = null
    error.value = errorMessage(err, 'โหลดข้อมูลไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(before, () => { downloadedFor.value = null; confirmText.value = '' })

async function download() {
  if (!preview.value) return
  downloading.value = true
  error.value = null
  try {
    await exportArchive(preview.value.before)
    downloadedFor.value = preview.value.before
  } catch (err) {
    error.value = errorMessage(err, 'ดาวน์โหลดไม่สำเร็จ')
  } finally {
    downloading.value = false
  }
}

async function remove() {
  const p = preview.value
  if (!p || downloadedFor.value !== p.before || confirmText.value !== 'ลบ') return
  if (!window.confirm(`ลบ CM ${p.total.toLocaleString()} แถว (ผลตรวจ ${p.audited.toLocaleString()} · รูป ${p.photos.toLocaleString()} ไฟล์) ที่ซ่อมเสร็จก่อน ${p.before} ออกจากระบบถาวร?\n\nกู้คืนได้ทางเดียวคือนำเข้าไฟล์ NOC เดือนนั้นใหม่ (ผลตรวจกับรูปไม่กลับมา)`)) return
  deleting.value = true
  error.value = null
  try {
    const r = await runArchive(p.before, p.total)
    flash.set(`archive แล้ว — ลบ CM ${r.deleted.toLocaleString()} แถว · รูป ${r.photos.toLocaleString()} ไฟล์ (ซ่อมเสร็จก่อน ${r.before})`)
    router.push('/faults')
  } catch (err) {
    error.value = errorMessage(err, 'ลบไม่สำเร็จ')
    await load()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <AppLayout>
    <PageHeader title="Archive จุดซ่อมเก่า" description="ลบ CM ที่ซ่อมเสร็จเกิน 12 เดือนออกจากระบบ เพื่อรักษาพื้นที่ฐานข้อมูล (Supabase free 500 MB)">
      <template #actions>
        <RouterLink to="/faults" class="btn btn-ghost btn-sm">← รายการ</RouterLink>
      </template>
    </PageHeader>

    <div role="alert" class="alert alert-warning mb-4 text-sm">
      <div>
        <p class="font-semibold">กฎที่ตกลงไว้ (2026-09-22): CM ที่ซ่อมเสร็จเกิน {{ preview?.months ?? 12 }} เดือน ลบทั้งหมด — รวมผลตรวจ รูปประกอบ และการจอง</p>
        <p class="text-xs opacity-80">ก่อนลบต้องโหลดไฟล์ xlsx ของชุดนั้นเก็บไว้เอง — ระบบไม่เก็บสำเนา · ถ้าพบว่าข้อมูลเก่าหายไปจากหน้ารายการ ให้ดูที่ "ครั้งล่าสุด" ด้านล่างก่อน</p>
      </div>
    </div>

    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm"><span>{{ error }}</span></div>

    <div class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-end gap-3">
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ลบ CM ที่ซ่อมเสร็จก่อนวันที่</span>
            <input v-model="before" type="date" class="input input-bordered input-sm" :max="preview?.defaultBefore" :disabled="loading || deleting" @change="load">
          </label>
          <p class="text-xs opacity-60 pb-2">ค่าเริ่มต้น = วันนี้ − {{ preview?.months ?? 12 }} เดือน ({{ preview?.defaultBefore ?? '…' }}) · เลือกใหม่กว่านี้ไม่ได้</p>
        </div>

        <div v-if="loading" class="flex items-center gap-2 text-sm"><span class="loading loading-spinner loading-sm" />กำลังนับ…</div>
        <div v-else-if="preview" class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="stat rounded-box border border-base-300 p-3"><div class="stat-title text-xs">CM ที่จะลบ</div><div class="stat-value text-xl">{{ preview.total.toLocaleString() }}</div></div>
          <div class="stat rounded-box border border-base-300 p-3"><div class="stat-title text-xs">มีผลตรวจ</div><div class="stat-value text-xl">{{ preview.audited.toLocaleString() }}</div></div>
          <div class="stat rounded-box border border-base-300 p-3"><div class="stat-title text-xs">รูปที่จะลบจาก Storage</div><div class="stat-value text-xl">{{ preview.photos.toLocaleString() }}</div></div>
          <div class="stat rounded-box border border-base-300 p-3"><div class="stat-title text-xs">จองค้างอยู่</div><div class="stat-value text-xl" :class="preview.claims ? 'text-warning' : ''">{{ preview.claims.toLocaleString() }}</div></div>
        </div>
        <p v-if="preview?.claims" class="text-xs text-warning">มีจุดที่ยังมีคนจองอยู่ในชุดนี้ — การจองจะถูกลบไปด้วย บอกทีมก่อน</p>
      </div>
    </div>

    <div v-if="preview && preview.total > 0" class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body gap-4 p-4">
        <div class="flex flex-wrap items-center gap-3">
          <span class="badge badge-neutral">1</span>
          <span class="text-sm">โหลด xlsx ของทั้งชุด ({{ preview.total.toLocaleString() }} แถว — ใช้เวลาเป็นนาที ไม่มีเพดาน 10,000)</span>
          <button type="button" class="btn btn-sm" :disabled="downloading || deleting" @click="download">
            <span v-if="downloading" class="loading loading-spinner loading-xs" />ดาวน์โหลด
          </button>
          <span v-if="downloadedFor === preview.before" class="badge badge-success badge-sm">โหลดแล้ว</span>
        </div>
        <div class="flex flex-wrap items-center gap-3" :class="downloadedFor === preview.before ? '' : 'opacity-40'">
          <span class="badge badge-neutral">2</span>
          <span class="text-sm">พิมพ์ <b>ลบ</b> เพื่อยืนยัน แล้วกดลบ</span>
          <input v-model="confirmText" type="text" class="input input-bordered input-sm w-24" :disabled="downloadedFor !== preview.before || deleting" placeholder="ลบ">
          <button type="button" class="btn btn-error btn-sm" :disabled="downloadedFor !== preview.before || confirmText !== 'ลบ' || deleting" @click="remove">
            <span v-if="deleting" class="loading loading-spinner loading-xs" />ลบ {{ preview.total.toLocaleString() }} แถวออกจากระบบ
          </button>
        </div>
        <p v-if="deleting" class="text-xs opacity-70">กำลังลบทีละ 500 แถว (ลบรูปใน Storage ก่อน) — อย่าปิดหน้านี้</p>
      </div>
    </div>
    <div v-else-if="preview && !loading" class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body p-4 text-sm opacity-70">ไม่มี CM ที่ซ่อมเสร็จก่อน {{ preview.before }} — ยังไม่ต้องทำอะไร</div>
    </div>

    <div class="card border border-base-300 bg-base-100">
      <div class="card-body p-4 text-sm">
        <h2 class="font-semibold">ครั้งล่าสุด</h2>
        <p v-if="preview?.last">
          {{ formatDateTime(preview.last.at) }} — ลบ CM ที่ซ่อมเสร็จก่อน <b>{{ preview.last.before }}</b> จำนวน <b>{{ preview.last.deleted.toLocaleString() }}</b> แถว · รูป {{ preview.last.photos.toLocaleString() }} ไฟล์ · โดย {{ preview.last.by }}
        </p>
        <p v-else class="opacity-60">ยังไม่เคย archive</p>
      </div>
    </div>
  </AppLayout>
</template>

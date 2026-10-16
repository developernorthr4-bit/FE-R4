<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import { formatDateTime } from '../lib/events'
import {
  exportTicketArchive, getTicketArchivePreview, runTicketArchive, type TicketArchivePreview,
} from '../services/tickets.api'
import { useFlashStore } from '../stores/flash'

/**
 * archive Ticket — กฎ (ผู้ใช้ตัดสิน 2026-10-15): ปิดงานเกิน 12 เดือน ลบออกจากระบบ
 *
 * เหตุผลคือโควตา Supabase free 500 MB — `tickets` เป็นตารางใหญ่สุดในฐาน (59 MB)
 * โตเดือนละ ~38,000 ใบ ≈ 18 MB เก็บตลอดไปไม่ไหว
 *
 * ทำด้วยมือ 2 ขั้นแบบเดียวกับ /faults/archive: ต้องโหลด xlsx ของชุดที่จะลบให้เสร็จก่อน
 * ปุ่มลบถึงจะเปิด แล้วตอนลบส่งจำนวนที่เห็นตอนพรีวิวไปด้วย ถ้ามีคนนำเข้าเพิ่มระหว่างนั้น BE ปฏิเสธ
 * ต่างจากจุดซ่อม CM ที่ผลตรวจกับรูปกู้ไม่ได้เลย — Ticket กู้ได้ด้วยการนำเข้าไฟล์ NOC เดือนนั้นใหม่
 */
const router = useRouter()
const flash = useFlashStore()

const before = ref('')
const preview = ref<TicketArchivePreview | null>(null)
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
    preview.value = await getTicketArchivePreview(before.value || undefined)
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
    await exportTicketArchive(preview.value.before)
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
  const cm = p.cmAffected ? `\n\nงานซ่อม CM ${p.cmAffected.toLocaleString()} รายการที่อ้างใบในชุดนี้ จะขึ้นว่า "อ้างถึงใบที่ยังไม่มีในระบบ"` : ''
  if (!window.confirm(`ลบ Ticket ${p.total.toLocaleString()} ใบ ที่ปิดงานก่อน ${p.before} ออกจากระบบถาวร?\n\nกู้คืนได้ทางเดียวคือนำเข้าไฟล์ NOC ของเดือนนั้นใหม่${cm}`)) return
  deleting.value = true
  error.value = null
  try {
    const r = await runTicketArchive(p.before, p.total)
    flash.set(`archive แล้ว — ลบ Ticket ${r.deleted.toLocaleString()} ใบ ที่ปิดงานก่อน ${r.before}${r.vacuumed ? '' : ' (vacuum ไม่สำเร็จ — ดู log ของ BE)'}`)
    router.push('/tickets')
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
    <PageHeader title="Archive Ticket เก่า" description="ลบ Ticket ที่ปิดงานเกิน 12 เดือนออกจากระบบ เพื่อรักษาพื้นที่ฐานข้อมูล (Supabase free 500 MB)">
      <template #actions>
        <RouterLink to="/tickets" class="btn btn-ghost btn-sm">← รายการ</RouterLink>
      </template>
    </PageHeader>

    <div role="alert" class="alert alert-warning mb-4 text-sm">
      <div>
        <p class="font-semibold">กฎที่ตกลงไว้ (2026-10-15): Ticket ที่ปิดงานเกิน {{ preview?.months ?? 12 }} เดือน ลบทั้งหมด</p>
        <p class="text-xs opacity-80">
          ก่อนลบต้องโหลดไฟล์ xlsx ของชุดนั้นเก็บไว้เอง — ระบบไม่เก็บสำเนา (แต่กู้ได้ด้วยการนำเข้าไฟล์ NOC ของเดือนนั้นใหม่) ·
          วันตัดใช้ <b>วันที่ปิดงาน</b> ไม่ใช่วันที่แจ้ง · ใบที่ไม่มีวันปิดไม่ถูกแตะ
        </p>
      </div>
    </div>

    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm"><span>{{ error }}</span></div>

    <div class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-end gap-3">
          <label class="form-control">
            <span class="label-text text-xs opacity-70">ลบ Ticket ที่ปิดงานก่อนวันที่</span>
            <input v-model="before" type="date" class="input input-bordered input-sm" :max="preview?.defaultBefore" :disabled="loading || deleting" @change="load">
          </label>
          <p class="text-xs opacity-60 pb-2">ค่าเริ่มต้น = วันนี้ − {{ preview?.months ?? 12 }} เดือน ({{ preview?.defaultBefore ?? '…' }}) · เลือกใหม่กว่านี้ไม่ได้</p>
        </div>

        <div v-if="loading" class="flex items-center gap-2 text-sm"><span class="loading loading-spinner loading-sm" />กำลังนับ…</div>
        <div v-else-if="preview" class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="stat rounded-box border border-base-300 p-3"><div class="stat-title text-xs">Ticket ที่จะลบ</div><div class="stat-value text-xl">{{ preview.total.toLocaleString() }}</div></div>
          <div class="stat rounded-box border border-base-300 p-3"><div class="stat-title text-xs">ซ่อม CM ที่จะเสียการผูก</div><div class="stat-value text-xl" :class="preview.cmAffected ? 'text-warning' : ''">{{ preview.cmAffected.toLocaleString() }}</div></div>
          <div class="stat rounded-box border border-base-300 p-3"><div class="stat-title text-xs">ไม่มีวันปิด (ไม่ถูกลบ)</div><div class="stat-value text-xl">{{ preview.noClosedDate.toLocaleString() }}</div></div>
          <div class="stat rounded-box border border-base-300 p-3"><div class="stat-title text-xs">ปิดงานเก่าสุดในระบบ</div><div class="stat-value text-base pt-2">{{ preview.oldestClosed ?? '—' }}</div></div>
        </div>
        <p v-if="preview?.cmAffected" class="text-xs text-warning">
          งานซ่อม CM ที่อ้างใบในชุดนี้จะยังอยู่ แต่หน้าตรวจจุดซ่อมจะขึ้นว่า "อ้างถึงใบที่ยังไม่มีในระบบ" แทนรายละเอียดใบ
        </p>
      </div>
    </div>

    <div v-if="preview && preview.total > 0" class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body gap-4 p-4">
        <div class="flex flex-wrap items-center gap-3">
          <span class="badge badge-neutral">1</span>
          <span class="text-sm">โหลด xlsx ของทั้งชุด ({{ preview.total.toLocaleString() }} ใบ — ใช้เวลาเป็นนาที ไม่มีเพดาน 200 แถวแบบหน้ารายการ)</span>
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
            <span v-if="deleting" class="loading loading-spinner loading-xs" />ลบ {{ preview.total.toLocaleString() }} ใบออกจากระบบ
          </button>
        </div>
        <p v-if="deleting" class="text-xs opacity-70">กำลังลบทีละ 500 ใบ แล้วจัดระเบียบตาราง (vacuum) — อย่าปิดหน้านี้</p>
      </div>
    </div>
    <div v-else-if="preview && !loading" class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body p-4 text-sm opacity-70">
        ไม่มี Ticket ที่ปิดงานก่อน {{ preview.before }} — ยังไม่ต้องทำอะไร
        <span v-if="preview.oldestClosed"> (ใบที่ปิดเก่าสุดในระบบคือ {{ preview.oldestClosed }})</span>
      </div>
    </div>

    <div class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body p-4 text-sm">
        <h2 class="font-semibold">ครั้งล่าสุด</h2>
        <p v-if="preview?.last">
          {{ formatDateTime(preview.last.at) }} — ลบ Ticket ที่ปิดงานก่อน <b>{{ preview.last.before }}</b>
          จำนวน <b>{{ preview.last.deleted.toLocaleString() }}</b> ใบ · โดย {{ preview.last.by }}
          <span v-if="!preview.last.vacuumed" class="text-warning"> · vacuum ไม่สำเร็จ</span>
        </p>
        <p v-else class="opacity-60">ยังไม่เคย archive</p>
      </div>
    </div>

    <div class="card border border-base-300 bg-base-100">
      <div class="card-body p-4 text-xs opacity-70">
        <h2 class="text-sm font-semibold opacity-100">ขนาดไฟล์ฐานข้อมูลจะยังไม่ลดหลังลบ — ตั้งใจให้เป็นแบบนั้น</h2>
        <p>
          การลบทิ้งที่ว่างไว้ในตาราง ไม่ได้คืนให้ระบบปฏิบัติการ (มีแต่ <code>VACUUM FULL</code> ที่คืน แต่มันล็อกตารางทั้งตัวจนอ่านไม่ได้)
          ระบบจึงรันแค่ <code>vacuum (analyze)</code> ธรรมดาต่อท้ายให้ Postgres รู้ว่าที่ว่างอยู่ไหน
        </p>
        <p>
          เพราะนำเข้าเดือนละ ~38,000 ใบ และลบเดือนละ ~38,000 ใบเท่ากัน ที่ว่างจากการลบจะถูกเดือนถัดไปเขียนทับพอดี
          ตารางจะนิ่งอยู่ที่ประมาณ 12 เดือนแล้วหยุดโต ซึ่งคือเป้าหมายจริงของการ archive
        </p>
      </div>
    </div>
  </AppLayout>
</template>

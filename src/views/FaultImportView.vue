<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import {
  FAULT_HEADERS, finishImport, sendImportRows, startImport, type FaultImportRow,
} from '../services/faults.api'
import { useFlashStore } from '../stores/flash'

/**
 * นำเข้า Faults Point.xlsx จากเบราว์เซอร์
 *
 * เบราว์เซอร์อ่านไฟล์เองด้วย SheetJS (ไฟล์ 3 เดือน 25 MB — Render free RAM 512 MB
 * รับทั้งก้อนมาแกะไม่ไหว) ดึงเฉพาะคอลัมน์ที่ใช้ แล้วส่ง JSON ทีละ 500 แถว
 * BE upsert ตามเลข CM — เดือนหน้าเอาไฟล์ใหม่มาวางที่หน้านี้ซ้ำได้เลย
 *
 * SheetJS โหลดแบบ dynamic import — บันเดิลใหญ่ (~400 KB) ไม่ควรติดไปทุกหน้า
 */
type SheetPreview = { name: string; rows: FaultImportRow[]; noLocation: number; noCm: number }

const router = useRouter()
const flash = useFlashStore()

const file = ref<File | null>(null)
const parsing = ref(false)
const sheets = ref<SheetPreview[]>([])
const skippedSheets = ref<string[]>([])
const error = ref<string | null>(null)

const importing = ref(false)
const progress = ref({ sent: 0, total: 0 })
const result = ref<{ inserted: number; updated: number; skipped: number; noLocation: number } | null>(null)

const totalRows = computed(() => sheets.value.reduce((n, s) => n + s.rows.length, 0))
const cmSet = computed(() => {
  const set = new Set<string>()
  for (const s of sheets.value) for (const r of s.rows) if (r.cm) set.add(r.cm.trim())
  return set
})

const LOC_RE = /lat=\s*-?\d+(?:\.\d+)?\s*,\s*lng=\s*-?\d+(?:\.\d+)?/i
const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  const s = String(v).trim()
  return s === '' ? null : s
}

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const f = input.files?.[0] ?? null
  input.value = ''
  file.value = f
  sheets.value = []
  skippedSheets.value = []
  result.value = null
  error.value = null
  if (!f) return
  parsing.value = true
  try {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false, dense: true })
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name]
      if (!ws) continue
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null })
      const header = (aoa[0] ?? []).map((h) => (h === null ? null : String(h).trim()))
      const idx: Partial<Record<keyof FaultImportRow, number>> = {}
      header.forEach((h, i) => {
        const key = h ? FAULT_HEADERS[h] : undefined
        if (key && idx[key] === undefined) idx[key] = i
      })
      if (idx.cm === undefined) { skippedSheets.value.push(name); continue }
      const rows: FaultImportRow[] = []
      let noLocation = 0
      let noCm = 0
      for (let i = 1; i < aoa.length; i++) {
        const cells = aoa[i] ?? []
        const pick = (k: keyof FaultImportRow) => (idx[k] === undefined ? null : str(cells[idx[k]!]))
        const row: FaultImportRow = {
          sheet: name, rowNo: i + 1,
          cm: pick('cm'), inc: pick('inc'), tt: pick('tt'), severity: pick('severity'), region: pick('region'),
          province: pick('province'), site: pick('site'), fme: pick('fme'), activityGroup: pick('activityGroup'),
          ciName: pick('ciName'), subject: pick('subject'), descriptionCm: pick('descriptionCm'),
          rootCause: pick('rootCause'), subRootCause: pick('subRootCause'), completeSolution: pick('completeSolution'),
          completeDesc: pick('completeDesc'), firstOccurTime: pick('firstOccurTime'), createTime: pick('createTime'),
          departTime: pick('departTime'), arriveTime: pick('arriveTime'), leaveTime: pick('leaveTime'),
          completeTime: pick('completeTime'), completeLocation: pick('completeLocation'), arriveLocation: pick('arriveLocation'),
          item: pick('item'), itemCode: pick('itemCode'), sn: pick('sn'),
        }
        // แถวว่างท้ายชีต (ทุกช่อง null) ข้ามเงียบ ๆ
        if (!row.cm && !row.site && !row.inc) continue
        if (!row.cm) noCm++
        if (!LOC_RE.test(row.completeLocation ?? '') && !LOC_RE.test(row.arriveLocation ?? '')) noLocation++
        rows.push(row)
      }
      sheets.value.push({ name, rows, noLocation, noCm })
    }
    if (!sheets.value.length) error.value = 'ไม่พบชีตที่มีคอลัมน์ "CM" ในไฟล์นี้'
  } catch (err) {
    error.value = errorMessage(err, 'อ่านไฟล์ไม่สำเร็จ — ต้องเป็น .xlsx')
  } finally {
    parsing.value = false
  }
}

async function run() {
  if (!file.value || !totalRows.value || importing.value) return
  importing.value = true
  error.value = null
  result.value = null
  const sum = { inserted: 0, updated: 0, skipped: 0, noLocation: 0 }
  let batchId: string | null = null
  let ok = true
  try {
    const started = await startImport(file.value.name)
    batchId = started.batchId
    const all = sheets.value.flatMap((s) => s.rows)
    progress.value = { sent: 0, total: all.length }
    for (let i = 0; i < all.length; i += started.chunk) {
      const part = all.slice(i, i + started.chunk)
      const r = await sendImportRows(batchId, part)
      sum.inserted += r.inserted; sum.updated += r.updated; sum.skipped += r.skipped; sum.noLocation += r.noLocation
      progress.value.sent = Math.min(i + part.length, all.length)
    }
    result.value = sum
  } catch (err) {
    ok = false
    error.value = errorMessage(err, `นำเข้าไม่สำเร็จ — ส่งไปแล้ว ${progress.value.sent.toLocaleString()} จาก ${progress.value.total.toLocaleString()} แถว (แถวที่ส่งแล้วบันทึกอยู่ในระบบ กดนำเข้าซ้ำได้ ไม่ซ้ำแถว)`)
  } finally {
    if (batchId) {
      try { await finishImport(batchId, { totalRows: progress.value.total, ...sum, ok }) } catch { /* batch ค้างสถานะ validating ไม่กระทบข้อมูล */ }
    }
    importing.value = false
  }
  if (ok) {
    flash.set(`นำเข้า ${file.value.name} แล้ว — ใหม่ ${sum.inserted.toLocaleString()} · อัปเดต ${sum.updated.toLocaleString()} · ไม่มีพิกัด ${sum.noLocation.toLocaleString()}`)
    router.push('/faults')
  }
}
</script>

<template>
  <AppLayout>
    <PageHeader title="นำเข้าไฟล์จุดซ่อม" description="เลือกไฟล์ Faults Point.xlsx จาก NOC — ระบบอ่านทุกชีตที่มีคอลัมน์ CM แล้วเพิ่ม/อัปเดตตามเลข CM ผลตรวจที่บันทึกไว้แล้วไม่ถูกแตะ">
      <template #actions>
        <RouterLink to="/faults" class="btn btn-ghost btn-sm">← รายการ</RouterLink>
      </template>
    </PageHeader>

    <div class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body gap-3 p-4">
        <label class="form-control">
          <span class="label-text text-xs opacity-70">ไฟล์ .xlsx</span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="file-input file-input-bordered file-input-sm w-full max-w-md" :disabled="parsing || importing" @change="onFile">
        </label>
        <p class="text-xs opacity-60">
          ไฟล์อ่านในเบราว์เซอร์ของคุณเอง ส่งเฉพาะคอลัมน์ที่ใช้ (ไม่ส่ง Summary Worklog) ทีละ 500 แถว · ไฟล์ 3 เดือน ~34,000 แถว ใช้เวลาราว 1–2 นาที
        </p>
        <div v-if="parsing" class="flex items-center gap-2 text-sm"><span class="loading loading-spinner loading-sm" />กำลังอ่านไฟล์…</div>
      </div>
    </div>

    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm"><span>{{ error }}</span></div>

    <div v-if="sheets.length" class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body gap-3 p-4">
        <h2 class="text-sm font-semibold">พรีวิว — {{ file?.name }}</h2>
        <table class="table table-sm">
          <thead>
            <tr><th>ชีต</th><th class="text-right">แถว</th><th class="text-right">ไม่มีพิกัด</th><th class="text-right">ไม่มีเลข CM (จะข้าม)</th></tr>
          </thead>
          <tbody>
            <tr v-for="s in sheets" :key="s.name">
              <td>{{ s.name }}</td>
              <td class="text-right">{{ s.rows.length.toLocaleString() }}</td>
              <td class="text-right">{{ s.noLocation.toLocaleString() }}</td>
              <td class="text-right">{{ s.noCm.toLocaleString() }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="font-semibold"><td>รวม</td><td class="text-right">{{ totalRows.toLocaleString() }}</td><td colspan="2" class="text-right text-xs font-normal opacity-60">CM ไม่ซ้ำ {{ cmSet.size.toLocaleString() }}</td></tr>
          </tfoot>
        </table>
        <p v-if="skippedSheets.length" class="text-xs text-warning">ข้ามชีตที่ไม่มีคอลัมน์ CM: {{ skippedSheets.join(', ') }}</p>

        <div v-if="importing" class="mt-2">
          <progress class="progress progress-primary w-full" :value="progress.sent" :max="progress.total" />
          <p class="mt-1 text-xs opacity-70">ส่งแล้ว {{ progress.sent.toLocaleString() }} / {{ progress.total.toLocaleString() }} แถว — อย่าปิดหน้านี้</p>
        </div>

        <div class="mt-2 flex justify-end gap-2">
          <button type="button" class="btn btn-primary" :disabled="importing || !totalRows" @click="run">
            <span v-if="importing" class="loading loading-spinner loading-xs" />นำเข้า {{ totalRows.toLocaleString() }} แถว
          </button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

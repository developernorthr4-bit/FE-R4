<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import { SITE_GRADE_BADGE } from '../lib/sites'
import {
  finishGradeImport, getGradeSummary, sendGradeRows, startGradeImport,
  type GradeImportRow, type GradeSummary,
} from '../services/sites.api'
import { useFlashStore } from '../stores/flash'

/**
 * นำเข้าเกรดสถานีจาก Site Grading.xlsx (admin+)
 *
 * เบราว์เซอร์อ่านไฟล์เองด้วย SheetJS แล้วส่ง JSON ทีละ 1,000 แถว — แบบเดียวกับ
 * หน้านำเข้าจุดซ่อม เหตุผลเดียวกัน: Render free ไม่ต้องแบกไฟล์และ RAM
 *
 * สิ่งที่เกิดขึ้นฝั่ง BE (ย้ำไว้บนหน้าจอด้วย เพราะเป็นการเขียนทับข้อมูลจริง)
 *   • สถานีที่มีอยู่ → แก้เฉพาะช่องเกรด ไม่แตะคอลัมน์อื่น
 *   • รหัสที่ไม่มีใน DB → สร้างสถานีใหม่แบบ "ไม่มีพิกัด" รอเติมทีหลัง
 *   • สถานีที่ไม่อยู่ในไฟล์ → ปล่อยเกรดว่างไว้ ไม่ถือว่าเกรดต่ำสุด
 */
const CHUNK_FALLBACK = 1000

const router = useRouter()
const flash = useFlashStore()

const file = ref<File | null>(null)
const parsing = ref(false)
const rows = ref<GradeImportRow[]>([])
const badRows = ref(0)
const error = ref<string | null>(null)

const before = ref<GradeSummary | null>(null)
const importing = ref(false)
const progress = ref({ sent: 0, total: 0 })
const result = ref<{ updated: number; unchanged: number; created: number; skipped: number; noProvince: string[] } | null>(null)

/** สรุปเกรดในไฟล์ที่เพิ่งอ่าน — ให้เห็นก่อนกดว่ากำลังจะนำเข้าอะไร */
const tally = computed(() => {
  const m = new Map<string, number>()
  for (const r of rows.value) {
    const g = (r.grade ?? '').trim().toUpperCase()
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
})

onMounted(async () => {
  try {
    before.value = await getGradeSummary()
  } catch (err) {
    error.value = errorMessage(err, 'อ่านสรุปเกรดปัจจุบันไม่สำเร็จ')
  }
})

/** หัวคอลัมน์ที่รับ — เทียบแบบไม่สนตัวพิมพ์ ช่องว่าง หรือขีดล่าง */
const HEADERS: Record<string, keyof GradeImportRow> = {
  '7digit': 'code', sitecode: 'code', site: 'code',
  finalprovince: 'province', province: 'province',
  sitegrade: 'grade', grade: 'grade',
}
const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const f = input.files?.[0] ?? null
  input.value = ''
  file.value = f
  rows.value = []
  badRows.value = 0
  result.value = null
  error.value = null
  if (!f) return

  parsing.value = true
  try {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false, dense: true })
    const name = wb.SheetNames[0]
    const ws = name ? wb.Sheets[name] : undefined
    if (!ws) { error.value = 'ไฟล์นี้ไม่มีชีตข้อมูล'; return }

    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null })
    const header = (aoa[0] ?? []).map((h) => (h === null ? '' : normHeader(String(h))))
    const idx: Partial<Record<keyof GradeImportRow, number>> = {}
    header.forEach((h, i) => {
      const key = HEADERS[h]
      if (key && idx[key] === undefined) idx[key] = i
    })
    if (idx.code === undefined || idx.grade === undefined) {
      error.value = 'ไม่พบคอลัมน์ "7_Digit" และ "Site Grade" ในชีตแรกของไฟล์'
      return
    }

    const out: GradeImportRow[] = []
    for (let i = 1; i < aoa.length; i++) {
      const cells = aoa[i] ?? []
      const pick = (k: keyof GradeImportRow) => {
        const at = idx[k]
        if (at === undefined) return null
        const v = cells[at]
        return v === null || v === undefined ? null : String(v).trim() || null
      }
      const row: GradeImportRow = { code: pick('code'), province: pick('province'), grade: pick('grade') }
      if (!row.code && !row.grade) continue // แถวว่างท้ายชีต
      if (!row.code || !row.grade) { badRows.value++; continue }
      out.push(row)
    }
    rows.value = out
    if (!out.length) error.value = 'อ่านไฟล์ได้ แต่ไม่มีแถวที่มีทั้งรหัสสถานีและเกรด'
  } catch (err) {
    error.value = errorMessage(err, 'อ่านไฟล์ไม่สำเร็จ — ต้องเป็น .xlsx')
  } finally {
    parsing.value = false
  }
}

async function run() {
  if (!file.value || !rows.value.length || importing.value) return
  importing.value = true
  error.value = null
  result.value = null
  const sum = { updated: 0, unchanged: 0, created: 0, skipped: 0, noProvince: [] as string[] }
  let batchId: string | null = null
  let ok = true
  try {
    const started = await startGradeImport(file.value.name)
    batchId = started.batchId
    const chunk = started.chunk || CHUNK_FALLBACK
    progress.value = { sent: 0, total: rows.value.length }
    for (let i = 0; i < rows.value.length; i += chunk) {
      const part = rows.value.slice(i, i + chunk)
      const r = await sendGradeRows(batchId, part)
      sum.updated += r.updated
      sum.unchanged += r.unchanged
      sum.created += r.created
      sum.skipped += r.skipped
      for (const c of r.noProvince) if (sum.noProvince.length < 50) sum.noProvince.push(c)
      progress.value.sent = Math.min(i + part.length, rows.value.length)
    }
    result.value = sum
  } catch (err) {
    ok = false
    error.value = errorMessage(err, `นำเข้าไม่สำเร็จ — ส่งไปแล้ว ${progress.value.sent.toLocaleString()} จาก ${progress.value.total.toLocaleString()} แถว (ที่ส่งไปแล้วบันทึกอยู่ในระบบ กดซ้ำได้ ไม่ทำข้อมูลซ้ำ)`)
  } finally {
    if (batchId) {
      try { await finishGradeImport(batchId, { totalRows: progress.value.total, ...sum, ok }) } catch { /* batch ค้างสถานะ ไม่กระทบข้อมูล */ }
    }
    importing.value = false
  }
  if (ok) {
    before.value = await getGradeSummary().catch(() => before.value)
    flash.set(`นำเข้าเกรดแล้ว — แก้ ${sum.updated.toLocaleString()} · สร้างใหม่ ${sum.created.toLocaleString()} · เท่าเดิม ${sum.unchanged.toLocaleString()}`)
  }
}
</script>

<template>
  <AppLayout>
    <PageHeader title="นำเข้าเกรดสถานี" description="ไฟล์ Site Grading จากส่วนกลาง — อัปเดตเฉพาะช่องเกรด ไม่แตะข้อมูลอื่นของสถานี">
      <template #actions>
        <RouterLink to="/sites/manage" class="btn btn-ghost btn-sm">← จัดการสถานี</RouterLink>
      </template>
    </PageHeader>

    <div role="alert" class="alert alert-info mb-4 text-sm">
      <div>
        <p class="font-semibold">สิ่งที่จะเกิดขึ้น</p>
        <ul class="ml-4 list-disc text-xs opacity-90">
          <li>สถานีที่มีอยู่แล้ว — แก้<b>เฉพาะช่องเกรด</b> พิกัด ตู้ แบต และทุกอย่างที่กรอกไว้ไม่ถูกแตะ</li>
          <li>รหัสที่ยังไม่มีในระบบ — สร้างสถานีใหม่แบบ <b>ไม่มีพิกัด</b> (กรองดูได้ที่หน้าจัดการสถานี → "ไม่มีพิกัด") แล้วค่อยเติมข้อมูลทีหลัง</li>
          <li>สถานีที่ไม่อยู่ในไฟล์ — ปล่อยเกรดว่างไว้ ไม่ถือว่าเกรดต่ำสุด</li>
        </ul>
      </div>
    </div>

    <div v-if="before" class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body gap-2 p-4">
        <h2 class="text-sm font-semibold">ตอนนี้ในระบบ ({{ before.total.toLocaleString() }} สถานี)</h2>
        <div class="flex flex-wrap gap-2">
          <span v-for="g in before.grades" :key="String(g.grade)" class="badge" :class="g.grade ? (SITE_GRADE_BADGE[g.grade] ?? 'badge-neutral') : 'badge-outline'">
            {{ g.grade ?? 'ยังไม่มีเกรด' }} · {{ g.n.toLocaleString() }}
          </span>
        </div>
        <p class="text-xs opacity-60">ไม่มีพิกัด {{ before.noGeo.toLocaleString() }} สถานี</p>
      </div>
    </div>

    <div class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body gap-3 p-4">
        <label class="form-control">
          <span class="label-text text-xs opacity-70">ไฟล์ .xlsx (อ่านชีตแรก ต้องมีคอลัมน์ 7_Digit และ Site Grade)</span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="file-input file-input-bordered file-input-sm w-full max-w-md" :disabled="parsing || importing" @change="onFile">
        </label>
        <div v-if="parsing" class="flex items-center gap-2 text-sm"><span class="loading loading-spinner loading-sm" />กำลังอ่านไฟล์…</div>
      </div>
    </div>

    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm"><span>{{ error }}</span></div>

    <div v-if="rows.length" class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body gap-3 p-4">
        <h2 class="text-sm font-semibold">พรีวิว — {{ file?.name }}</h2>
        <p class="text-sm">อ่านได้ <b>{{ rows.length.toLocaleString() }}</b> แถว<span v-if="badRows"> · ข้าม {{ badRows.toLocaleString() }} แถวที่ไม่มีรหัสหรือไม่มีเกรด</span></p>
        <div class="flex flex-wrap gap-2">
          <span v-for="[g, n] in tally" :key="g" class="badge" :class="SITE_GRADE_BADGE[g] ?? 'badge-neutral'">{{ g }} · {{ n.toLocaleString() }}</span>
        </div>

        <div v-if="importing">
          <progress class="progress progress-primary w-full" :value="progress.sent" :max="progress.total" />
          <p class="mt-1 text-xs opacity-70">ส่งแล้ว {{ progress.sent.toLocaleString() }} / {{ progress.total.toLocaleString() }} แถว — อย่าปิดหน้านี้</p>
        </div>

        <div class="flex justify-end">
          <button type="button" class="btn btn-primary" :disabled="importing || !rows.length" @click="run">
            <span v-if="importing" class="loading loading-spinner loading-xs" />นำเข้า {{ rows.length.toLocaleString() }} แถว
          </button>
        </div>
      </div>
    </div>

    <div v-if="result" class="card border border-base-300 bg-base-100">
      <div class="card-body gap-2 p-4 text-sm">
        <h2 class="font-semibold">ผลการนำเข้า</h2>
        <p>
          แก้เกรด <b>{{ result.updated.toLocaleString() }}</b> ·
          สร้างสถานีใหม่ (ไม่มีพิกัด) <b>{{ result.created.toLocaleString() }}</b> ·
          เท่าเดิม {{ result.unchanged.toLocaleString() }} ·
          ข้าม {{ result.skipped.toLocaleString() }}
        </p>
        <p v-if="result.noProvince.length" class="text-warning text-xs">
          แปลชื่อจังหวัดไม่ออกจึงสร้างไม่ได้ {{ result.noProvince.length }} รหัส: {{ result.noProvince.join(', ') }}
        </p>
        <div class="flex gap-2">
          <RouterLink to="/sites/manage?geo=0" class="btn btn-sm">ดูสถานีที่ยังไม่มีพิกัด</RouterLink>
          <button type="button" class="btn btn-ghost btn-sm" @click="router.push('/sites/manage')">ไปหน้าจัดการสถานี</button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

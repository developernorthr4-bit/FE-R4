<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import { errorMessage } from '../lib/api'
import {
  finishTicketImport, LEVEL_LABEL, LINK_LEVELS, loadTicketLookups, preferRow, sendTicketRows, startTicketImport,
  TICKET_DATE_KEYS, TICKET_HEADERS, type LinkLevel, type TicketImportRow,
} from '../services/tickets.api'
import { useFlashStore } from '../stores/flash'

/**
 * นำเข้าไฟล์ Ticket Online / Ticket Mobile จากเบราว์เซอร์
 *
 * เบราว์เซอร์อ่านไฟล์เองด้วย SheetJS (ไฟล์ Mobile 35 MB / 124k แถว — Render free RAM 512 MB
 * รับทั้งก้อนไม่ไหว) ดึงเฉพาะคอลัมน์ที่ตกลงกันไว้ แล้วตัดเลขซ้ำ "ทั้งชุด" ก่อนส่ง
 * — ไฟล์ Mobile มี Ticket Online อยู่แล้ว เลือกสองไฟล์พร้อมกันได้ ใบที่อยู่ทั้งสองไฟล์ส่งครั้งเดียว
 *
 * BE เขียนเฉพาะใบที่ค่าเปลี่ยนจริง — ไฟล์สะสมเอามาวางซ้ำทุกเดือนได้โดยตารางไม่บวม
 * SheetJS โหลดแบบ dynamic import — บันเดิลใหญ่ (~400 KB) ไม่ควรติดไปทุกหน้า
 */
type FilePreview = {
  name: string
  rows: number
  unique: number
  noTicket: number
  firstOpened: string | null
  lastOpened: string | null
}

const router = useRouter()
const flash = useFlashStore()

const parsing = ref(false)
const files = ref<FilePreview[]>([])
const merged = ref<Map<string, TicketImportRow>>(new Map())
const error = ref<string | null>(null)

const importing = ref(false)
const progress = ref({ sent: 0, total: 0 })
const result = ref<{ inserted: number; updated: number; unchanged: number; skipped: number; byLevel: Record<LinkLevel, number> } | null>(null)

const totalUnique = computed(() => merged.value.size)
const overlap = computed(() => files.value.reduce((n, f) => n + f.unique, 0) - totalUnique.value)

/** เลข serial ของ Excel → 'YYYY-MM-DD HH:mm:ss' แบบไม่ผ่าน timezone ของเครื่อง (ไฟล์เป็นเวลาไทยอยู่แล้ว) */
function serialToText(n: number): string {
  const d = new Date(Math.round((n - 25569) * 86400) * 1000)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

function cellValue(v: unknown, isDate: boolean): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return isDate ? serialToText(v) : String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  const s = String(v).trim()
  return s === '' ? null : s
}

async function onFiles(ev: Event) {
  const input = ev.target as HTMLInputElement
  const list = [...(input.files ?? [])]
  input.value = ''
  files.value = []
  merged.value = new Map()
  result.value = null
  error.value = null
  if (!list.length) return
  parsing.value = true
  try {
    const XLSX = await import('xlsx')
    const all = new Map<string, TicketImportRow>()
    for (const f of list) {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', dense: true })
      const ws = wb.Sheets[wb.SheetNames[0] ?? '']
      if (!ws) continue
      // raw: true → วันที่ได้เป็นเลข serial (ไม่ใช่ข้อความตามรูปแบบเซลล์ที่แต่ละไฟล์ตั้งไม่เหมือนกัน)
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
      const header = (aoa[0] ?? []).map((h) => (h === null ? null : String(h).trim()))
      const idx: [number, keyof TicketImportRow][] = []
      header.forEach((h, i) => { const k = h ? TICKET_HEADERS[h] : undefined; if (k) idx.push([i, k]) })
      if (!idx.some(([, k]) => k === 'ticketNo')) {
        error.value = `${f.name}: ไม่พบคอลัมน์ TICKETID ในชีตแรก`
        continue
      }
      const dateKeys = new Set(TICKET_DATE_KEYS)
      const seen = new Set<string>()
      let rows = 0
      let noTicket = 0
      let first: string | null = null
      let last: string | null = null
      for (let i = 1; i < aoa.length; i++) {
        const cells = aoa[i] ?? []
        const r = Object.fromEntries(Object.values(TICKET_HEADERS).map((k) => [k, null])) as TicketImportRow
        for (const [c, k] of idx) r[k] = cellValue(cells[c], dateKeys.has(k))
        if (Object.values(r).every((v) => v === null)) continue
        rows++
        const no = r.ticketNo?.toUpperCase()
        if (!no) { noTicket++; continue }
        seen.add(no)
        if (r.openedAt) {
          if (!first || r.openedAt < first) first = r.openedAt
          if (!last || r.openedAt > last) last = r.openedAt
        }
        const prev = all.get(no)
        all.set(no, prev ? preferRow(prev, r) : r)
      }
      files.value.push({ name: f.name, rows, unique: seen.size, noTicket, firstOpened: first, lastOpened: last })
    }
    merged.value = all
    if (!all.size && !error.value) error.value = 'ไม่พบแถวที่มีเลข Ticket'
  } catch (err) {
    error.value = errorMessage(err, 'อ่านไฟล์ไม่สำเร็จ — ต้องเป็น .xlsx')
  } finally {
    parsing.value = false
  }
}

async function run() {
  if (!totalUnique.value || importing.value) return
  importing.value = true
  error.value = null
  result.value = null
  const sum = { inserted: 0, updated: 0, unchanged: 0, skipped: 0, byLevel: { site: 0, olt: 0, l1: 0, l2: 0, none: 0 } as Record<LinkLevel, number> }
  let batchId: string | null = null
  let ok = true
  try {
    const started = await startTicketImport(files.value.map((f) => f.name).join(' + '))
    batchId = started.batchId
    const all = [...merged.value.values()]
    progress.value = { sent: 0, total: all.length }
    for (let i = 0; i < all.length; i += started.chunk) {
      const part = all.slice(i, i + started.chunk)
      const r = await sendTicketRows(batchId, part)
      sum.inserted += r.inserted; sum.updated += r.updated; sum.unchanged += r.unchanged; sum.skipped += r.skipped
      for (const l of LINK_LEVELS) sum.byLevel[l] += r.byLevel[l] ?? 0
      progress.value.sent = Math.min(i + part.length, all.length)
    }
    result.value = sum
  } catch (err) {
    ok = false
    error.value = errorMessage(err, `นำเข้าไม่สำเร็จ — ส่งไปแล้ว ${progress.value.sent.toLocaleString()} จาก ${progress.value.total.toLocaleString()} ใบ (ใบที่ส่งแล้วบันทึกอยู่ในระบบ กดนำเข้าซ้ำได้ ไม่ซ้ำใบ)`)
  } finally {
    if (batchId) {
      try {
        await finishTicketImport(batchId, {
          totalRows: progress.value.total, inserted: sum.inserted, updated: sum.updated, unchanged: sum.unchanged,
          skipped: sum.skipped, unlinked: sum.byLevel.none, ok,
        })
      } catch { /* batch ค้างสถานะ validating ไม่กระทบข้อมูล */ }
    }
    importing.value = false
  }
  if (ok) {
    await loadTicketLookups(true).catch(() => null)
    flash.set(`นำเข้า Ticket แล้ว — ใหม่ ${sum.inserted.toLocaleString()} · อัปเดต ${sum.updated.toLocaleString()} · ไม่เปลี่ยน ${sum.unchanged.toLocaleString()} · จับคู่ไม่ได้ ${sum.byLevel.none.toLocaleString()}`)
    router.push('/tickets')
  }
}

const day = (s: string | null) => (s ? s.slice(0, 10) : '—')
</script>

<template>
  <AppLayout>
    <PageHeader title="นำเข้า Ticket" description="ไฟล์ Ticket Online และ/หรือ Ticket Mobile จาก NOC — เลือกได้หลายไฟล์พร้อมกัน ใบที่อยู่ทั้งสองไฟล์นับครั้งเดียว ใบที่ค่าไม่เปลี่ยนจะไม่ถูกเขียนซ้ำ">
      <template #actions>
        <RouterLink to="/tickets" class="btn btn-ghost btn-sm">← รายการ</RouterLink>
      </template>
    </PageHeader>

    <div class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body gap-3 p-4">
        <label class="form-control">
          <span class="label-text text-xs opacity-70">ไฟล์ .xlsx (เลือกได้หลายไฟล์)</span>
          <input type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="file-input file-input-bordered file-input-sm w-full max-w-md" :disabled="parsing || importing" @change="onFiles">
        </label>
        <p class="text-xs opacity-60">
          ไฟล์อ่านในเบราว์เซอร์ของคุณเอง ส่งเฉพาะคอลัมน์ที่เก็บ ทีละ 1,000 ใบ · ไฟล์ Mobile ~35 MB ใช้เวลาอ่านราว 20–40 วินาที แล้วส่งอีกหลายนาที
        </p>
        <div v-if="parsing" class="flex items-center gap-2 text-sm"><span class="loading loading-spinner loading-sm" />กำลังอ่านไฟล์…</div>
      </div>
    </div>

    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm"><span>{{ error }}</span></div>

    <div v-if="files.length" class="card mb-4 border border-base-300 bg-base-100">
      <div class="card-body gap-3 p-4">
        <h2 class="text-sm font-semibold">พรีวิว</h2>
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr><th>ไฟล์</th><th class="text-right">แถว</th><th class="text-right">เลข Ticket ไม่ซ้ำ</th><th class="text-right">ไม่มีเลข (ข้าม)</th><th>เปิดตั้งแต่</th><th>ถึง</th></tr>
            </thead>
            <tbody>
              <tr v-for="f in files" :key="f.name">
                <td class="max-w-64 truncate" :title="f.name">{{ f.name }}</td>
                <td class="text-right">{{ f.rows.toLocaleString() }}</td>
                <td class="text-right">{{ f.unique.toLocaleString() }}</td>
                <td class="text-right">{{ f.noTicket.toLocaleString() }}</td>
                <td>{{ day(f.firstOpened) }}</td>
                <td>{{ day(f.lastOpened) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="font-semibold">
                <td>จะส่ง</td>
                <td />
                <td class="text-right">{{ totalUnique.toLocaleString() }}</td>
                <td colspan="3" class="text-xs font-normal opacity-60">
                  <template v-if="overlap > 0">อยู่หลายไฟล์ {{ overlap.toLocaleString() }} ใบ — ส่งครั้งเดียว</template>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div v-if="importing" class="mt-2">
          <progress class="progress progress-primary w-full" :value="progress.sent" :max="progress.total" />
          <p class="mt-1 text-xs opacity-70">ส่งแล้ว {{ progress.sent.toLocaleString() }} / {{ progress.total.toLocaleString() }} ใบ — อย่าปิดหน้านี้</p>
        </div>

        <div v-if="result" class="text-sm">
          ใหม่ {{ result.inserted.toLocaleString() }} · อัปเดต {{ result.updated.toLocaleString() }} · ไม่เปลี่ยน {{ result.unchanged.toLocaleString() }}
          <span class="opacity-70">· จับคู่:
            <template v-for="l in LINK_LEVELS" :key="l"> {{ LEVEL_LABEL[l] }} {{ result.byLevel[l].toLocaleString() }}</template>
          </span>
        </div>

        <div class="mt-2 flex justify-end gap-2">
          <button type="button" class="btn btn-primary" :disabled="importing || parsing || !totalUnique" @click="run">
            <span v-if="importing" class="loading loading-spinner loading-xs" />นำเข้า {{ totalUnique.toLocaleString() }} ใบ
          </button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

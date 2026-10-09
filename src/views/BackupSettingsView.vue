<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import { errorMessage } from '../lib/api'
import { BACKUP_FORMULA, BACKUP_FORMULA_NOTES } from '../lib/backup'
import { formatDateTime } from '../lib/events'
import {
  getBackupRules, getBackupRulesHistory, saveBackupRules, type BackupRules, type BackupRulesChange,
} from '../services/backup.api'

/**
 * ตั้งเกณฑ์ชั่วโมงสำรองไฟ — dev เท่านั้น (ผู้ใช้ตัดสิน 2026-10-09)
 * เก็บใน app_settings.backup_rules · ทุกครั้งที่บันทึก BE เขียน audit_log ให้ → ประวัติด้านล่าง
 * หน้าจอแสดง DoD เป็น % แต่ส่งให้ BE เป็นสัดส่วน 0–1
 */

type GradeRow = { grade: string; hours: number }

const grades = ref<GradeRow[]>([])
const dod = ref({ LITHIUM: 90, VRLA: 80, other: 80 })
const maxLoadA = ref(300)
const history = ref<BackupRulesChange[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

function fill(r: BackupRules) {
  grades.value = Object.entries(r.targets).map(([grade, hours]) => ({ grade, hours }))
  dod.value = {
    LITHIUM: Math.round(r.dod.LITHIUM * 1000) / 10,
    VRLA: Math.round(r.dod.VRLA * 1000) / 10,
    other: Math.round(r.dod.other * 1000) / 10,
  }
  maxLoadA.value = r.maxLoadA
}

async function load() {
  error.value = null
  try {
    const [r, h] = await Promise.all([getBackupRules(), getBackupRulesHistory()])
    fill(r)
    history.value = h
  } catch (err) {
    error.value = errorMessage(err, 'โหลดค่าตั้งไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}
onMounted(load)

function addGrade() {
  grades.value.push({ grade: '', hours: 2 })
}

async function save() {
  saving.value = true
  error.value = null
  notice.value = null
  try {
    const targets: Record<string, number> = {}
    for (const g of grades.value) {
      const key = g.grade.trim().toUpperCase()
      if (!key) continue
      if (key in targets) throw new Error(`เกรด ${key} ซ้ำ`)
      targets[key] = Number(g.hours)
    }
    const res = await saveBackupRules({
      targets,
      dod: { LITHIUM: dod.value.LITHIUM / 100, VRLA: dod.value.VRLA / 100, other: dod.value.other / 100 },
      maxLoadA: Number(maxLoadA.value),
    })
    notice.value = res.changed ? 'บันทึกแล้ว — รายงานทุกหน้าใช้เกณฑ์ใหม่ทันที' : 'ค่าเหมือนเดิม ไม่มีอะไรเปลี่ยน'
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

/** สรุปค่าตั้งหนึ่งชุดเป็นบรรทัดเดียว — ใช้ในตารางประวัติ */
function brief(r: BackupRules | null): string {
  if (!r) return '(ค่าเริ่มต้น)'
  const t = Object.entries(r.targets).map(([g, h]) => `${g} ${h}`).join(' · ')
  return `${t} ชม. | DoD ${Math.round(r.dod.LITHIUM * 100)}/${Math.round(r.dod.VRLA * 100)}/${Math.round(r.dod.other * 100)}% | ≤${r.maxLoadA} A`
}
</script>

<template>
  <AppLayout>
    <PageHeader title="เกณฑ์ชั่วโมงสำรองไฟ" description="เป้าหมายตามเกรดสถานี และค่าที่ใช้ในสูตรคำนวณ — มีผลกับทุกหน้าทันทีที่บันทึก">
      <template #actions>
        <RouterLink to="/sites/backup" class="btn btn-ghost btn-sm">ดูรายงาน</RouterLink>
        <RouterLink to="/settings" class="btn btn-ghost btn-sm">← ตั้งค่าระบบ</RouterLink>
      </template>
    </PageHeader>

    <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm">{{ error }}</div>
    <div v-if="notice" role="status" class="alert alert-success mb-4 text-sm">{{ notice }}</div>

    <div v-if="loading" class="mt-10 flex justify-center"><span class="loading loading-spinner loading-lg opacity-60" /></div>

    <div v-else class="grid gap-4 lg:grid-cols-2">
      <!-- สูตร -->
      <section class="card border border-base-300 bg-base-100 lg:col-span-2">
        <div class="card-body gap-2 p-4 text-sm">
          <h2 class="font-semibold">สูตรคำนวณ</h2>
          <p class="font-mono">{{ BACKUP_FORMULA }}</p>
          <ul class="list-disc pl-5 text-xs text-base-content/70">
            <li v-for="n in BACKUP_FORMULA_NOTES" :key="n">{{ n }}</li>
          </ul>
          <p class="text-xs text-base-content/70">
            ตัวอย่าง: ลิเทียม 100 Ah × 4 ก้อน · SOH 98% · DoD 90% · Load 53 A →
            4 × 100 × 0.98 × 0.9 = 352.8 Ah ÷ 53 A = <b>6.7 ชม.</b> (เกรด A เป้า 4 ชม. = ผ่าน)
          </p>
        </div>
      </section>

      <!-- เป้าตามเกรด -->
      <section class="card border border-base-300 bg-base-100">
        <div class="card-body gap-3 p-4">
          <h2 class="font-semibold">เป้าหมายตามเกรด</h2>
          <p class="text-xs text-base-content/60">ชั่วโมงสำรองขั้นต่ำ — ถึงเป้า = ผ่าน · เกรดที่ไม่มีในตารางนี้จะไม่ถูกตัดสิน</p>
          <div v-for="(g, i) in grades" :key="i" class="flex items-center gap-2">
            <input v-model="g.grade" type="text" maxlength="4" placeholder="เกรด" class="input input-bordered input-sm w-20 font-mono uppercase" :disabled="saving">
            <input v-model.number="g.hours" type="number" min="0.5" max="72" step="0.5" class="input input-bordered input-sm w-24 text-right" :disabled="saving">
            <span class="text-sm">ชม.</span>
            <button type="button" class="btn btn-ghost btn-xs text-error" :disabled="saving" @click="grades.splice(i, 1)">ลบ</button>
          </div>
          <button type="button" class="btn btn-ghost btn-sm w-fit" :disabled="saving" @click="addGrade">+ เพิ่มเกรด</button>
        </div>
      </section>

      <!-- DoD + เพดาน -->
      <section class="card border border-base-300 bg-base-100">
        <div class="card-body gap-3 p-4">
          <h2 class="font-semibold">DoD ตามชนิดแบต</h2>
          <p class="text-xs text-base-content/60">สัดส่วนความจุที่ดึงมาใช้ได้จริงก่อนระบบตัด (Depth of Discharge)</p>
          <label v-for="(label, k) in { LITHIUM: 'ลิเทียม', VRLA: 'VRLA (ตะกั่วกรด)', other: 'ไม่ระบุชนิด' }" :key="k" class="flex items-center gap-2">
            <span class="w-36 text-sm">{{ label }}</span>
            <input v-model.number="dod[k]" type="number" min="1" max="100" step="1" class="input input-bordered input-sm w-24 text-right" :disabled="saving">
            <span class="text-sm">%</span>
          </label>

          <h2 class="mt-2 font-semibold">เพดาน Load</h2>
          <p class="text-xs text-base-content/60">load ที่สูงกว่านี้ถือว่ากรอกผิด — แสดงชั่วโมงแต่ไม่ตัดสินผ่าน/ไม่ผ่าน</p>
          <label class="flex items-center gap-2">
            <input v-model.number="maxLoadA" type="number" min="1" max="10000" step="10" class="input input-bordered input-sm w-28 text-right" :disabled="saving">
            <span class="text-sm">A</span>
          </label>
        </div>
      </section>

      <div class="flex justify-end lg:col-span-2">
        <BaseButton :loading="saving" @click="save">บันทึกเกณฑ์</BaseButton>
      </div>

      <!-- ประวัติ -->
      <section class="card border border-base-300 bg-base-100 lg:col-span-2">
        <div class="card-body gap-2 p-4">
          <h2 class="font-semibold">ประวัติการแก้ (20 ครั้งล่าสุด)</h2>
          <p class="text-xs text-base-content/60">เก็บใน audit_log — ถ้าตั้งลบ audit อัตโนมัติไว้ ประวัติเก่ากว่ารอบนั้นจะหายไป</p>
          <p v-if="!history.length" class="text-sm text-base-content/60">ยังไม่เคยแก้ — ใช้ค่าเริ่มต้น (A+ 8 · A 4 · B 3 · C 2 ชม.)</p>
          <div v-else class="overflow-x-auto">
            <table class="table table-xs">
              <thead><tr><th>เมื่อ</th><th>โดย</th><th>ก่อน</th><th>หลัง</th></tr></thead>
              <tbody>
                <tr v-for="h in history" :key="h.changedAt">
                  <td class="whitespace-nowrap">{{ formatDateTime(h.changedAt) }}</td>
                  <td>{{ h.byName ?? '—' }}</td>
                  <td class="font-mono text-xs opacity-70">{{ brief(h.before) }}</td>
                  <td class="font-mono text-xs">{{ brief(h.after) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </AppLayout>
</template>

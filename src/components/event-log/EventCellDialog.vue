<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { Star } from 'lucide-vue-next'
import { errorMessage } from '@/lib/api'
import { cellText } from '@/lib/event-log'
import { formatDateTime } from '@/lib/format'
import { formatDowDay } from '@/lib/iso-week'
import { saveEventCells, type EventCell, type EventProvince, type SaveCellsResult } from '@/services/event-log.api'

/**
 * แก้ 1 ช่อง (จังหวัด × วัน) — บันทึกเอง แล้วส่งผลกลับให้ตาราง
 *
 * สถานะเริ่มที่ค่าที่บันทึกไว้ · พอแก้ข้อความจะกลับเป็น "อัตโนมัติ" (ระบบดูจากข้อความ)
 * ไม่งั้นช่องที่เติม "ปกติ" ไว้แล้วมาพิมพ์เหตุทับ จะยังนับเป็นปกติ
 */
const props = defineProps<{
  province: EventProvince
  date: string
  cell: EventCell | null
  /** ข้อความที่วางมาช่องเดียว — ใส่ให้ก่อนแต่ยังไม่บันทึก */
  initialText?: string
  yesterday: EventCell | null
  canWrite: boolean
  hasNext: boolean
}>()
const emit = defineEmits<{ close: []; saved: [result: SaveCellsResult]; next: [] }>()

type Mode = 'auto' | 'normal' | 'event'
const MODES: { key: Mode; label: string }[] = [
  { key: 'auto', label: 'อัตโนมัติ' }, { key: 'normal', label: 'ปกติ' }, { key: 'event', label: 'มีเหตุ' },
]

const base = ref<EventCell | null>(props.cell)
const text = ref(props.initialText ?? cellText(props.cell))
const mode = ref<Mode>(props.initialText !== undefined || !props.cell ? 'auto' : props.cell.isNormal ? 'normal' : 'event')
const star = ref(props.cell?.isHighlight ?? false)
const saving = ref(false)
const error = ref<string | null>(null)
/** มีคนแก้ก่อนหน้า — ให้เลือกว่าจะใช้ของใคร */
const conflict = ref(false)
const area = ref<HTMLTextAreaElement | null>(null)
const root = ref<HTMLElement | null>(null)

onMounted(async () => {
  await nextTick()
  // อ่านอย่างเดียวก็ต้องมีโฟกัสในกล่อง ไม่งั้นกด Esc ปิดไม่ได้
  if (!props.canWrite) { root.value?.focus(); return }
  area.value?.focus()
  area.value?.setSelectionRange(text.value.length, text.value.length)
})

const initialMode = (c: EventCell | null): Mode => (!c ? 'auto' : c.isNormal ? 'normal' : 'event')
const dirty = computed(() =>
  text.value.trim() !== cellText(base.value).trim()
  || star.value !== (base.value?.isHighlight ?? false)
  || (!!base.value && mode.value !== 'auto' && mode.value !== initialMode(base.value)))

function setText(t: string) {
  text.value = t
  mode.value = 'auto'
  area.value?.focus()
}

async function save(goNext = false) {
  if (saving.value) return
  if (!dirty.value && !conflict.value) { finish(goNext); return }
  saving.value = true
  error.value = null
  try {
    const result = await saveEventCells([{
      provinceId: props.province.id, date: props.date, text: text.value,
      ...(mode.value === 'auto' ? {} : { isNormal: mode.value === 'normal' }),
      isHighlight: star.value,
      rev: base.value?.rev ?? null,
    }])
    emit('saved', result)
    if (result.conflicts.length) {
      base.value = result.cells[0] ?? null
      conflict.value = true
      return
    }
    finish(goNext)
  } catch (err) {
    error.value = errorMessage(err, 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

function finish(goNext: boolean) {
  if (goNext && props.hasNext) emit('next')
  else emit('close')
}

/** ใช้ข้อความล่าสุดของอีกคน ทิ้งของที่พิมพ์ */
function takeTheirs() {
  text.value = cellText(base.value)
  star.value = base.value?.isHighlight ?? false
  mode.value = initialMode(base.value)
  conflict.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !saving.value && (!dirty.value || !props.canWrite)) { emit('close'); return }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && props.canWrite) { e.preventDefault(); void save(!e.shiftKey) }
}

/** มีของที่ยังไม่บันทึก = กดพื้นหลังไม่ปิด กันพิมพ์หาย */
function onBackdrop() {
  if (!saving.value && (!dirty.value || !props.canWrite)) emit('close')
}
</script>

<template>
  <div ref="root" class="modal modal-open" role="dialog" aria-modal="true" tabindex="-1" @click.self="onBackdrop" @keydown="onKey">
    <div class="modal-box max-w-xl">
      <h3 class="text-lg font-semibold">{{ province.code }} {{ province.nameTh }} · {{ formatDowDay(date) }}</h3>
      <p v-if="base" class="mt-0.5 text-xs opacity-60">
        {{ base.source === 'import' ? 'นำเข้าจากไฟล์' : `บันทึกล่าสุดโดย ${base.updatedBy ?? '—'}` }} · {{ formatDateTime(base.updatedAt) }}
      </p>

      <template v-if="canWrite">
        <div v-if="conflict" role="alert" class="mt-3 rounded-lg border border-warning bg-warning/10 p-3 text-sm">
          <p class="font-medium">มีคนแก้ช่องนี้ก่อนหน้า ยังไม่ได้บันทึกของคุณ</p>
          <p class="mt-1 whitespace-pre-line">ข้อความล่าสุด: {{ base ? cellText(base) : '(ว่าง — ถูกล้างไปแล้ว)' }}</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm" @click="takeTheirs">ใช้ข้อความล่าสุด</button>
            <button type="button" class="btn btn-warning btn-sm" :disabled="saving" @click="save()">เขียนทับด้วยของฉัน</button>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm" @click="setText('ปกติ')">ปกติ</button>
          <button
            type="button" class="btn btn-sm" :disabled="!yesterday"
            :title="yesterday ? cellText(yesterday) : 'เมื่อวานยังไม่ได้บันทึก'" @click="setText(cellText(yesterday))"
          >
            คัดลอกจากเมื่อวาน
          </button>
          <button type="button" class="btn btn-ghost btn-sm" :disabled="!text" @click="setText('')">ล้างช่อง</button>
        </div>

        <textarea
          ref="area" v-model="text" rows="6" maxlength="4000" class="textarea textarea-bordered mt-3 w-full"
          aria-label="ข้อความ Event" placeholder="พิมพ์ว่า ปกติ หรือเล่าเหตุที่เกิด เช่น SA2 รถชนเสาไฟที่… กระทบ 6 site 4 ชั่วโมง"
          @input="mode = 'auto'"
        />

        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div class="join" role="group" aria-label="นับเป็น">
            <button
              v-for="m in MODES" :key="m.key" type="button" class="btn btn-xs join-item"
              :class="mode === m.key ? 'btn-primary' : 'btn-outline'" :aria-pressed="mode === m.key" @click="mode = m.key"
            >
              {{ m.label }}
            </button>
          </div>
          <label class="flex cursor-pointer items-center gap-2 text-sm">
            <input v-model="star" type="checkbox" class="checkbox checkbox-sm" :disabled="mode === 'normal'" />
            <Star class="size-4" :class="star ? 'fill-current text-error' : 'opacity-50'" aria-hidden="true" /> เหตุเด่นของสัปดาห์
          </label>
        </div>
        <p class="mt-1 text-xs opacity-60">
          อัตโนมัติ: ขึ้นต้นด้วย "ปกติ" นับเป็นปกติ (ยกเว้นพูดถึง SA/NSA) ข้อความอื่นนับเป็นมีเหตุ · เว้นว่าง = ยังไม่บันทึก
        </p>

        <div v-if="error" role="alert" class="alert alert-error mt-3 text-sm">{{ error }}</div>

        <div class="modal-action flex-wrap">
          <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="emit('close')">ยกเลิก</button>
          <button type="button" class="btn btn-sm" :disabled="saving || conflict" title="Ctrl+Shift+Enter" @click="save()">บันทึก</button>
          <button
            v-if="hasNext" type="button" class="btn btn-primary btn-sm" :disabled="saving || conflict" title="Ctrl+Enter"
            @click="save(true)"
          >
            <span v-if="saving" class="loading loading-spinner loading-xs" />
            บันทึกแล้วไปจังหวัดถัดไป
          </button>
        </div>
      </template>

      <template v-else>
        <p class="mt-4 text-sm whitespace-pre-line">{{ base ? cellText(base) : 'ยังไม่บันทึก' }}</p>
        <div class="modal-action">
          <button type="button" class="btn btn-sm" @click="emit('close')">ปิด</button>
        </div>
      </template>
    </div>
  </div>
</template>

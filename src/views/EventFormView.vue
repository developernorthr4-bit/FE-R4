<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import SitePicker from '../components/SitePicker.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseField from '../components/ui/BaseField.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import { errorMessage } from '../lib/api'
import {
  formatDateTime, formatDuration, fromLocalInput, STATUS_BADGE, STATUS_LABEL, toLocalInput,
  type EventStatus, type EventUpdate, type Lookups,
} from '../lib/events'
import {
  addEventUpdate, createEvent, getEvent, loadLookups, updateEvent,
} from '../services/events.api'
import { getSitesByIds, type SiteLite } from '../services/sites.api'
import { useAuthStore } from '../stores/auth'

/**
 * ฟอร์มบันทึก/แก้ไขเหตุการณ์ ใช้ไฟล์เดียวทั้งสองโหมด
 *
 * โหมดแก้ไขมีไทม์ไลน์ต่อท้ายให้เพิ่มความคืบหน้า ซึ่งเป็นวัตถุดิบของ narrative
 * ในรายงานสัปดาห์ — เขียนตอนเกิดเหตุแล้วเก็บได้จริง ดีกว่าไล่ถามย้อนหลังตอนสิ้นสัปดาห์
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const id = computed(() => (route.params.id as string | undefined) ?? null)
const isNew = computed(() => id.value === null)
const canWrite = computed(() => auth.can('editor'))
const readOnly = computed(() => !canWrite.value || saving.value)

/** วันนี้ตามเขตเวลาไทย — ค่าตั้งต้นของช่องวันที่ */
function todayTh(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const form = reactive({
  eventDate: todayTh(),
  provinceId: '',
  title: '',
  description: '',
  eventTypeId: '',
  rootCauseId: '',
  severityId: '',
  startedAt: '',
  restoredAt: '',
  status: 'open' as EventStatus,
  isServiceAffecting: true,
  impactSummary: '',
})

const lookups = ref<Lookups | null>(null)
const sitesPicked = ref<SiteLite[]>([])
const updates = ref<EventUpdate[]>([])
const eventNo = ref<string | null>(null)
const durationMin = ref<number | null>(null)

const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

onMounted(async () => {
  try {
    lookups.value = await loadLookups()

    if (isNew.value) {
      // ถ้าผู้ใช้ดูแลจังหวัดเดียว เลือกให้เลย — คนหน้างานกรอกจังหวัดตัวเองซ้ำ ๆ อยู่แล้ว
      const scope = auth.user?.provinceScope
      if (scope?.length === 1) form.provinceId = String(scope[0])
      return
    }

    const data = await getEvent(id.value!)
    const e = data.event
    eventNo.value = e.eventNo
    durationMin.value = e.durationMin
    Object.assign(form, {
      eventDate: e.eventDate,
      provinceId: String(e.provinceId),
      title: e.title,
      description: e.description ?? '',
      eventTypeId: e.eventTypeId ? String(e.eventTypeId) : '',
      rootCauseId: e.rootCauseId ? String(e.rootCauseId) : '',
      severityId: e.severityId ? String(e.severityId) : '',
      startedAt: toLocalInput(e.startedAt),
      restoredAt: toLocalInput(e.restoredAt),
      status: e.status,
      isServiceAffecting: e.isServiceAffecting,
      impactSummary: e.impactSummary ?? '',
    })
    updates.value = data.updates

    if (data.sites.length) {
      sitesPicked.value = await getSitesByIds(data.sites.map((s) => s.siteId))
    }
  } catch (err) {
    error.value = errorMessage(err, 'โหลดข้อมูลไม่สำเร็จ')
  } finally {
    loading.value = false
  }
})

/** เปลี่ยนจังหวัดแล้วสถานีที่เลือกไว้จะข้ามจังหวัดทันที ต้องล้าง — BE ปฏิเสธอยู่แล้วแต่บอกก่อนดีกว่า */
function onProvinceChange() {
  if (sitesPicked.value.length) {
    sitesPicked.value = []
    notice.value = 'เปลี่ยนจังหวัดแล้ว รายการสถานีที่เลือกไว้ถูกล้าง'
  }
}

async function handleSubmit() {
  error.value = null
  notice.value = null
  if (!form.provinceId) {
    error.value = 'กรุณาเลือกจังหวัด'
    return
  }

  const payload = {
    eventDate: form.eventDate,
    provinceId: Number(form.provinceId),
    title: form.title,
    description: form.description.trim() || null,
    eventTypeId: form.eventTypeId ? Number(form.eventTypeId) : null,
    rootCauseId: form.rootCauseId ? Number(form.rootCauseId) : null,
    severityId: form.severityId ? Number(form.severityId) : null,
    startedAt: fromLocalInput(form.startedAt),
    restoredAt: fromLocalInput(form.restoredAt),
    status: form.status,
    isServiceAffecting: form.isServiceAffecting,
    impactSummary: form.impactSummary.trim() || null,
    siteIds: sitesPicked.value.map((s) => s.id),
  }

  saving.value = true
  try {
    if (isNew.value) {
      const created = await createEvent(payload)
      await router.replace(`/events/${created.id}`)
      // reload หน้าเดิมด้วย id ใหม่ ให้ไทม์ไลน์กับเลขที่โผล่ขึ้นมา
      window.location.reload()
    } else {
      const updated = await updateEvent(id.value!, payload)
      durationMin.value = updated.durationMin
      notice.value = 'บันทึกการแก้ไขแล้ว'
    }
  } catch (err) {
    error.value = errorMessage(err, 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

// ── ไทม์ไลน์ ──
const note = ref('')
const noteStatus = ref<EventStatus | ''>('')
const addingNote = ref(false)

async function addNote() {
  if (!note.value.trim()) return
  addingNote.value = true
  error.value = null
  try {
    const created = await addEventUpdate(id.value!, note.value.trim(), noteStatus.value || undefined)
    updates.value = [created, ...updates.value]
    if (noteStatus.value) form.status = noteStatus.value
    note.value = ''
    noteStatus.value = ''
  } catch (err) {
    error.value = errorMessage(err, 'เพิ่มบันทึกไม่สำเร็จ')
  } finally {
    addingNote.value = false
  }
}
</script>

<template>
  <AppLayout>
    <div v-if="loading" class="flex justify-center py-20">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <template v-else>
      <PageHeader
        :title="isNew ? 'บันทึกเหตุการณ์' : `เหตุการณ์ ${eventNo}`"
        :description="isNew
          ? 'ระบบออกเลขที่ให้อัตโนมัติหลังบันทึก'
          : `ระยะเวลา ${formatDuration(durationMin)}`"
      >
        <template #actions>
          <RouterLink to="/events" class="btn btn-ghost">กลับรายการ</RouterLink>
        </template>
      </PageHeader>

      <div v-if="!canWrite" role="alert" class="alert alert-info mb-4 text-sm">
        <span>บัญชีของคุณเป็นสิทธิ์อ่านอย่างเดียว แก้ไขข้อมูลไม่ได้</span>
      </div>
      <div v-if="notice" role="status" class="alert alert-success mb-4 text-sm">
        <span>{{ notice }}</span>
      </div>
      <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm">
        <span>{{ error }}</span>
      </div>

      <form novalidate class="card border border-base-300 bg-base-100" @submit.prevent="handleSubmit">
        <div class="card-body gap-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <BaseField
              v-model="form.eventDate" label="วันที่เกิดเหตุ" type="date" required
              :max="todayTh()" :disabled="readOnly"
            />
            <BaseSelect
              v-model="form.provinceId" label="จังหวัด" required :disabled="readOnly"
              @change="onProvinceChange"
            >
              <option value="">— เลือกจังหวัด —</option>
              <option v-for="p in lookups?.provinces" :key="p.id" :value="String(p.id)">
                {{ p.nameTh }}
              </option>
            </BaseSelect>
          </div>

          <BaseField
            v-model="form.title" label="หัวข้อ" required :disabled="readOnly"
            hint="สรุปสั้น ๆ ว่าเกิดอะไรขึ้น เช่น สายไฟเบอร์ขาดช่วง อ.แม่ริม"
          />

          <div class="grid gap-4 sm:grid-cols-3">
            <BaseSelect v-model="form.eventTypeId" label="ประเภทเหตุการณ์" :disabled="readOnly">
              <option value="">— ยังไม่ระบุ —</option>
              <option v-for="t in lookups?.eventTypes" :key="t.id" :value="String(t.id)">
                {{ t.nameTh }}
              </option>
            </BaseSelect>
            <BaseSelect v-model="form.rootCauseId" label="สาเหตุ" :disabled="readOnly">
              <option value="">— ยังไม่ทราบ —</option>
              <option v-for="rc in lookups?.rootCauses" :key="rc.id" :value="String(rc.id)">
                {{ rc.nameTh }}
              </option>
            </BaseSelect>
            <BaseSelect v-model="form.severityId" label="ระดับความรุนแรง" :disabled="readOnly">
              <option value="">— ยังไม่ระบุ —</option>
              <option v-for="s in lookups?.severities" :key="s.id" :value="String(s.id)">
                {{ s.nameTh }}
              </option>
            </BaseSelect>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <BaseField
              v-model="form.startedAt" label="เวลาเริ่มเหตุการณ์" type="datetime-local"
              :disabled="readOnly"
            />
            <BaseField
              v-model="form.restoredAt" label="เวลากู้คืน" type="datetime-local"
              :disabled="readOnly" hint="จำเป็นเมื่อสถานะเป็น แก้ไขแล้ว"
            />
            <BaseSelect v-model="form.status" label="สถานะ" :disabled="readOnly">
              <option v-for="(label, s) in STATUS_LABEL" :key="s" :value="s">{{ label }}</option>
            </BaseSelect>
          </div>

          <label class="label cursor-pointer justify-start gap-2">
            <input
              v-model="form.isServiceAffecting" type="checkbox"
              class="checkbox checkbox-sm" :disabled="readOnly"
            />
            <span class="label-text">กระทบการให้บริการลูกค้า</span>
          </label>

          <BaseTextarea v-model="form.description" label="รายละเอียด" :rows="4" :disabled="readOnly" />
          <BaseTextarea
            v-model="form.impactSummary" label="สรุปผลกระทบ" :rows="2" :disabled="readOnly"
            hint="ข้อความนี้ถูกใช้ประกอบรายงานสัปดาห์"
          />

          <div class="form-control">
            <label class="label"><span class="label-text font-medium">สถานีที่ได้รับผลกระทบ</span></label>
            <SitePicker
              v-model="sitesPicked"
              :province-id="form.provinceId ? Number(form.provinceId) : null"
              :disabled="readOnly"
            />
          </div>

          <div v-if="canWrite" class="card-actions mt-2 justify-end">
            <button type="button" class="btn btn-ghost" :disabled="saving" @click="router.push('/events')">
              ยกเลิก
            </button>
            <BaseButton type="submit" :loading="saving">
              {{ isNew ? 'บันทึกเหตุการณ์' : 'บันทึกการแก้ไข' }}
            </BaseButton>
          </div>
        </div>
      </form>

      <div v-if="!isNew" class="card mt-6 border border-base-300 bg-base-100">
        <div class="card-body gap-4">
          <h2 class="card-title text-base">ความคืบหน้า</h2>

          <div v-if="canWrite" class="flex flex-col gap-2">
            <BaseTextarea
              v-model="note" label="บันทึกความคืบหน้า" :rows="2" :disabled="addingNote"
            />
            <div class="flex flex-wrap items-end justify-between gap-2">
              <div class="w-full sm:w-56">
                <BaseSelect v-model="noteStatus" label="เปลี่ยนสถานะพร้อมกัน" :disabled="addingNote">
                  <option value="">— ไม่เปลี่ยน —</option>
                  <option v-for="(label, s) in STATUS_LABEL" :key="s" :value="s">{{ label }}</option>
                </BaseSelect>
              </div>
              <BaseButton :loading="addingNote" :disabled="!note.trim()" @click="addNote">
                เพิ่มบันทึก
              </BaseButton>
            </div>
          </div>

          <p v-if="!updates.length" class="text-sm opacity-70">ยังไม่มีบันทึกความคืบหน้า</p>

          <ol v-else class="flex flex-col gap-3">
            <li v-for="u in updates" :key="u.id" class="border-l-2 border-base-300 pl-3 text-sm">
              <div class="flex flex-wrap items-center gap-2">
                <span class="opacity-70">{{ formatDateTime(u.updatedAtEvent) }}</span>
                <span v-if="u.status" class="badge badge-sm" :class="STATUS_BADGE[u.status]">
                  {{ STATUS_LABEL[u.status] }}
                </span>
              </div>
              <p class="mt-1 whitespace-pre-wrap">{{ u.note }}</p>
            </li>
          </ol>
        </div>
      </div>
    </template>
  </AppLayout>
</template>

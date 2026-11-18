<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import { errorMessage } from '@/lib/api'
import {
  addSiteFrequency, deleteSiteFrequency, type SiteFrequency, type SiteLookups,
} from '@/services/sites.api'

/**
 * การ์ดความถี่ในหน้า /sites/:id/edit — เพิ่ม/ลบได้ บันทึกทันที ไม่ผ่านปุ่มบันทึกของฟอร์ม (คนละ endpoint กัน)
 *
 * รายการความถี่เก็บที่หน้าแม่ (v-model:frequencies) ไม่ใช่ที่นี่
 * เพราะภาพภายในสถานี (SiteInfographic) ใช้รายการเดียวกัน เพิ่ม/ลบแล้วภาพต้องเปลี่ยนตาม
 */
const props = defineProps<{
  siteId: string
  frequencies: SiteFrequency[]
  bands: SiteLookups['bands']
  /** = canWriteOriginal ของหน้าแม่ (สิทธิ์ตามจังหวัดที่บันทึกไว้จริง) */
  canEdit: boolean
}>()
const emit = defineEmits<{ 'update:frequencies': [SiteFrequency[]] }>()

/** ย่านที่สถานีนี้ยังไม่มี — เอามาเป็นตัวเลือกของ dropdown "เพิ่มย่าน" */
const bandOptions = computed(() => {
  const have = new Set(props.frequencies.map((f) => f.bandId))
  return props.bands.filter((b) => !have.has(b.id))
})

const newBandId = ref('')
const freqBusy = ref(false)
const freqError = ref<string | null>(null)

async function addBand() {
  if (!newBandId.value) return
  freqBusy.value = true
  freqError.value = null
  try {
    const added = await addSiteFrequency(props.siteId, Number(newBandId.value))
    emit('update:frequencies', [...props.frequencies, added]
      .sort((a, b) => a.code.localeCompare(b.code, 'en')))
    newBandId.value = ''
  } catch (err) {
    freqError.value = errorMessage(err, 'เพิ่มย่านความถี่ไม่สำเร็จ')
  } finally {
    freqBusy.value = false
  }
}

async function removeBand(f: SiteFrequency) {
  freqBusy.value = true
  freqError.value = null
  try {
    await deleteSiteFrequency(props.siteId, f.id)
    emit('update:frequencies', props.frequencies.filter((x) => x.id !== f.id))
  } catch (err) {
    freqError.value = errorMessage(err, 'ลบย่านความถี่ไม่สำเร็จ')
  } finally {
    freqBusy.value = false
  }
}
</script>

<template>
<div class="card border border-base-300 bg-base-100">
  <div class="card-body gap-2 p-4">
    <p class="text-sm font-medium">ความถี่ ({{ frequencies.length }} ย่าน)</p>

    <div v-if="freqError" role="alert" class="alert alert-error py-2 text-xs">
      <span>{{ freqError }}</span>
    </div>

    <div v-if="frequencies.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="f in frequencies" :key="f.id"
        class="badge badge-sm badge-ghost gap-1"
      >
        {{ f.code }}
        <button
          v-if="canEdit" type="button"
          class="opacity-60 hover:opacity-100"
          :disabled="freqBusy" :aria-label="`ลบย่าน ${f.code}`"
          @click="removeBand(f)"
        >✕</button>
      </span>
    </div>
    <p v-else class="text-sm opacity-60">ยังไม่มีข้อมูลความถี่ของสถานีนี้</p>

    <div v-if="canEdit && bandOptions.length" class="flex items-end gap-2">
      <BaseSelect
        v-model="newBandId" label="เพิ่มย่าน" class="flex-1" :disabled="freqBusy"
      >
        <option value="">เลือกย่าน…</option>
        <option v-for="b in bandOptions" :key="b.id" :value="String(b.id)">
          {{ b.code }}<template v-if="b.bandLabel"> · {{ b.bandLabel }}</template>
        </option>
      </BaseSelect>
      <BaseButton
        variant="ghost" :disabled="!newBandId || freqBusy" @click="addBand"
      >เพิ่ม</BaseButton>
    </div>

    <p class="text-xs opacity-60">
      ส่วนนี้บันทึกทันทีที่กด ไม่ต้องกดปุ่มบันทึกด้านบน —
      แต่การลบยังไม่ถาวร ถ้าไฟล์ freq ต้นทางยังมีย่านนั้นอยู่
      การ import รอบหน้าจะใส่กลับเข้ามาใหม่ ต้องแก้ที่ไฟล์ด้วย
    </p>
  </div>
</div>
</template>

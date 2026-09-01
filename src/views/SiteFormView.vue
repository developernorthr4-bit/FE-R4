<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import PageHeader from '../components/PageHeader.vue'
import SiteAssetsList from '../components/SiteAssetsList.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import BaseField from '../components/ui/BaseField.vue'
import BaseSelect from '../components/ui/BaseSelect.vue'
import BaseTextarea from '../components/ui/BaseTextarea.vue'
import { errorMessage } from '../lib/api'
import { categorical } from '../lib/palette'
import {
  canWriteProvince, checkCoords, checkSiteCode, coordToInput, normalizeSiteCode,
  NO_SCOPE_MESSAGE, SITE_STATUS_LABEL, SITE_STATUSES,
  type SitePayload, type SiteStatus,
} from '../lib/sites'
import { loadProvinces, type Province } from '../services/provinces.api'
import {
  addSiteFrequency, createSite, deleteSiteFrequency, getSiteDetail, loadSiteLookups, updateSite,
  type SiteDevice, type SiteFrequency, type SiteLookups,
} from '../services/sites.api'
import { useAuthStore } from '../stores/auth'
import { useFlashStore } from '../stores/flash'
import { useThemeStore } from '../stores/theme'

/**
 * ฟอร์มเพิ่ม/แก้ไขสถานี ใช้ไฟล์เดียวทั้งสองโหมด
 *
 * ฟอร์มนี้แก้ "ตัวสถานี" รวมลักษณะสถานีจากใบตรวจ PM (#1.6–#1.8) และเพิ่ม/ลบ
 * ย่านความถี่ได้ เหลืออุปกรณ์ CPE อย่างเดียวที่ยังแสดงให้ดูเฉย ๆ เพราะมันมาจาก
 * ไฟล์ ring และผูกกับวง/hop ซึ่งเป็นคนละเรื่องกับตัวสถานี
 *
 * ⚠️ ความถี่บันทึกทันทีที่กด ไม่รอปุ่มบันทึกด้านบน (คนละ endpoint กัน)
 *    ส่วนลักษณะสถานีอยู่ใน form ปกติ บันทึกพร้อมช่องอื่นทีเดียว
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()
const flash = useFlashStore()

const id = computed(() => (route.params.id as string | undefined) ?? null)
const isNew = computed(() => id.value === null)

const form = reactive({
  siteCode: '',
  siteName: '',
  provinceId: '',
  districtId: '',
  operatorId: '',
  lat: '',
  lng: '',
  address: '',
  status: 'active' as SiteStatus,
  // สร้างจากหน้าจอ = คนกรอกเอง ไม่ใช่ stub ที่ importer เดาขึ้นมาจากไฟล์ ring/freq
  // จึงถือว่าตรวจสอบแล้วตั้งแต่แรก ต่างจากแถวที่ import เข้ามาซึ่งเริ่มที่ false
  isVerified: true,
  remark: '',

  // ลักษณะสถานีจากใบตรวจ PM — ส่งขึ้นไปเฉพาะโหมดแก้ไข (ดู buildPayload)
  siteType: '',
  siteTypeRemark: '',
  towerType: '',
  towerTypeRemark: '',
  towerHeightM: '',
  towerHeightRemark: '',
  /**
   * true = import ห้ามทับ 6 ช่องข้างบน
   *
   * ยกให้เองทันทีที่ผู้ใช้แตะช่องไหนก็ตามในกลุ่มนั้น (ดู watch ข้างล่าง) — BE ก็ยกให้
   * ซ้ำอีกชั้นอยู่แล้ว ที่ทำในหน้าจอด้วยเพราะช่องติ๊กต้องขยับให้เห็นทันทีตอนพิมพ์
   * ไม่ใช่ไปเซอร์ไพรส์เอาตอนโหลดหน้าใหม่
   */
  pmAttrLock: false,
})

const provinces = ref<Province[]>([])
const lookups = ref<SiteLookups | null>(null)
const frequencies = ref<SiteFrequency[]>([])
const devices = ref<SiteDevice[]>([])

const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
/** true หลังกดบันทึกครั้งแรก — ก่อนหน้านั้นไม่ขึ้นข้อความว่า "กรุณากรอก..." ให้รำคาญ */
const submitted = ref(false)

/**
 * ระหว่างเติมค่าจาก BE อยู่หรือเปล่า
 *
 * จำเป็นเพราะ watch ที่ล้างอำเภอตอนเปลี่ยนจังหวัดจะทำงานตอน hydrate ด้วย
 * แล้วอำเภอที่เพิ่งโหลดมาจะถูกล้างทิ้งทันทีโดยที่ผู้ใช้ยังไม่ได้แตะอะไรเลย
 */
const hydrating = ref(true)

// ── ตัวเลือกที่ขึ้นกับจังหวัด ────────────────────────────────────────────────

const districtOptions = computed(() => {
  const pid = form.provinceId ? Number(form.provinceId) : null
  if (pid === null) return []
  return (lookups.value?.districts ?? [])
    .filter((d) => d.provinceId === pid)
    .sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th'))
})

watch(() => form.provinceId, () => {
  // ย้ายจังหวัดแล้วอำเภอเดิมไม่มีทางถูก ต้องล้างทิ้งไม่ใช่ปล่อยค้าง
  if (!hydrating.value) form.districtId = ''
})

/*
 * แตะลักษณะสถานีเมื่อไร = ยกธงกัน import ทับให้เลย
 *
 * ไม่รอให้ผู้ใช้ไปติ๊กเอง เพราะคนที่เข้ามาแก้ก็แก้เพราะใบตรวจกรอกผิด ถ้าไม่ล็อก
 * import รอบหน้าจะเอาค่าผิดเดิมทับกลับ แล้วจะไม่มีใครรู้ว่าของหายตอนไหน
 * ปลดล็อกได้ด้วยการติ๊กออกเอง (ส่ง pmAttrLock: false ขึ้นไปตรง ๆ)
 *
 * hydrating กันไม่ให้ยกธงตอนเติมค่าจาก BE — ไม่งั้นแค่เปิดหน้าดูเฉย ๆ แล้วกดบันทึก
 * สถานีนั้นก็จะถูกล็อกทั้งที่ไม่มีใครแก้อะไรเลย
 */
watch(
  () => [
    form.siteType, form.siteTypeRemark, form.towerType,
    form.towerTypeRemark, form.towerHeightM, form.towerHeightRemark,
  ],
  () => { if (!hydrating.value) form.pmAttrLock = true },
)

// ── สิทธิ์ ───────────────────────────────────────────────────────────────────

/**
 * จังหวัดต้นทาง — ในโหมดแก้ไข ถ้าย้ายจังหวัดต้องมีสิทธิ์ทั้งจังหวัดเดิมและใหม่
 * ไม่งั้น editor ของเชียงใหม่จะดึงสถานีของน่านเข้ามาเป็นของตัวเองได้
 * (BE ต้องตรวจซ้ำข้อนี้ด้วย ตรงนี้เป็นแค่การซ่อนปุ่ม)
 */
const originalProvinceId = ref<number | null>(null)

const canWriteTarget = computed(() => {
  if (!form.provinceId) return auth.can('editor')
  return canWriteProvince(auth.user?.role, auth.user?.provinceScope, Number(form.provinceId))
})
const canWriteOriginal = computed(() => {
  if (originalProvinceId.value === null) return true
  return canWriteProvince(auth.user?.role, auth.user?.provinceScope, originalProvinceId.value)
})
const canSave = computed(() => canWriteTarget.value && canWriteOriginal.value)

const scopeMessage = computed(() => {
  if (!auth.can('editor')) return 'บัญชีของคุณดูข้อมูลได้อย่างเดียว แก้ไขสถานีไม่ได้'
  if (!canWriteOriginal.value) return `${NO_SCOPE_MESSAGE} (สถานีนี้อยู่นอกขอบเขตของคุณ)`
  if (!canWriteTarget.value) return NO_SCOPE_MESSAGE
  return null
})

// ── การตรวจค่า ───────────────────────────────────────────────────────────────

const coords = computed(() => checkCoords(form.lat, form.lng))

const problems = computed(() => {
  const list: string[] = []
  /*
   * ตรวจรหัสเฉพาะตอนสร้าง — โหมดแก้ไขไม่ได้ส่งรหัสขึ้นไปอยู่แล้ว
   * ถ้าตรวจด้วยจะกลายเป็นว่าสถานีที่ import เข้ามาด้วยรหัสผิดรูปแบบ
   * ถูกล็อกไม่ให้แก้อะไรเลยตลอดกาล ทั้งที่คนแก้ไม่ได้เป็นคนตั้งรหัสนั้น
   */
  if (isNew.value) {
    const codeError = checkSiteCode(form.siteCode)
    if (codeError) list.push(codeError)
  }
  if (!form.provinceId) list.push('กรุณาเลือกจังหวัด')
  if (coords.value.error) list.push(coords.value.error)
  // เพดานเดียวกับ checkHeight ฝั่ง BE — ดักที่นี่ด้วยเพื่อไม่ต้องรอ 400 กลับมา
  if (form.towerHeightM.trim() !== '') {
    const h = Number(form.towerHeightM)
    if (!Number.isFinite(h) || h <= 0 || h > 200) {
      list.push('ความสูงเสาต้องเป็นตัวเลขมากกว่า 0 และไม่เกิน 200 เมตร')
    }
  }
  return list
})

// ── โหลดข้อมูล ───────────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    const [provs, lk] = await Promise.all([loadProvinces(), loadSiteLookups()])
    provinces.value = provs
    lookups.value = lk

    if (isNew.value) {
      // ดูแลจังหวัดเดียว = เลือกให้เลย คนหน้างานกรอกจังหวัดตัวเองซ้ำ ๆ อยู่แล้ว
      const scope = auth.user?.provinceScope
      if (scope?.length === 1) form.provinceId = String(scope[0])
      return
    }

    const data = await getSiteDetail(id.value!)
    const s = data.site
    originalProvinceId.value = s.provinceId
    frequencies.value = data.frequencies
    devices.value = data.devices

    Object.assign(form, {
      siteCode: s.siteCode,
      siteName: s.siteName ?? '',
      provinceId: String(s.provinceId),
      operatorId: s.operatorId ? String(s.operatorId) : '',
      lat: coordToInput(s.lat),
      lng: coordToInput(s.lng),
      address: s.address ?? '',
      status: s.status as SiteStatus,
      isVerified: s.isVerified,
      remark: s.remark ?? '',
      siteType: s.siteType ?? '',
      siteTypeRemark: s.siteTypeRemark ?? '',
      towerType: s.towerType ?? '',
      towerTypeRemark: s.towerTypeRemark ?? '',
      // numeric มาเป็น number แล้วจาก BE — '' ไม่ใช่ '0' เพราะ 0 แปลว่าไม่ระบุ
      towerHeightM: s.towerHeightM === null ? '' : String(s.towerHeightM),
      towerHeightRemark: s.towerHeightRemark ?? '',
      pmAttrLock: s.pmAttrLock,
    })

    /*
     * อำเภอต้องเซ็ตทีหลัง — /sites/:id ส่งมาเป็น districtName ไม่ใช่ districtId
     * จึงต้องย้อนหาจาก lookups ด้วยคู่ (จังหวัด, ชื่อ) ซึ่งเป็น unique key จริง
     * ในตาราง districts (districts_province_name_uq)
     */
    if (s.districtName) {
      const match = lk.districts.find(
        (d) => d.provinceId === s.provinceId && d.nameTh === s.districtName,
      )
      form.districtId = match ? String(match.id) : ''
    }
  } catch (err) {
    error.value = errorMessage(err, 'โหลดข้อมูลสถานีไม่สำเร็จ')
  } finally {
    loading.value = false
    // ปล่อย watch ให้ทำงานได้หลังค่าลงครบแล้ว ไม่งั้นอำเภอที่เพิ่งเซ็ตจะโดนล้าง
    hydrating.value = false
  }
})

// ── บันทึก ───────────────────────────────────────────────────────────────────

function buildPayload(): SitePayload {
  const trim = (v: string) => (v.trim() === '' ? null : v.trim())

  /*
   * ลักษณะสถานีส่งเฉพาะตอนแก้ไข
   *
   * POST /sites ไม่รับ 6 ช่องนี้ (สถานีใหม่ยังไม่เคยมีใบตรวจ PM) ส่งไปก็ถูกเมิน
   * แต่การไม่ส่งชัดเจนกว่า และทำให้ payload ของโหมดสร้างเหมือนเดิมทุกอย่าง
   */
  const pm: Partial<SitePayload> = isNew.value ? {} : {
    siteType: trim(form.siteType),
    siteTypeRemark: trim(form.siteTypeRemark),
    towerType: trim(form.towerType),
    towerTypeRemark: trim(form.towerTypeRemark),
    towerHeightM: form.towerHeightM.trim() === '' ? null : Number(form.towerHeightM),
    towerHeightRemark: trim(form.towerHeightRemark),
    // ส่งทุกครั้งไม่ใช่เฉพาะตอนล็อก — ติ๊กออกคือเจตนา "ให้ไฟล์ทับได้ตามเดิม"
    // ถ้าไม่ส่งตอน false BE จะเห็นเป็น undefined แล้วปลดล็อกไม่ได้เลยสักครั้ง
    pmAttrLock: form.pmAttrLock,
  }

  return {
    ...pm,
    siteCode: normalizeSiteCode(form.siteCode),
    siteName: trim(form.siteName),
    provinceId: Number(form.provinceId),
    districtId: form.districtId ? Number(form.districtId) : null,
    operatorId: form.operatorId ? Number(form.operatorId) : null,
    lat: coords.value.lat,
    lng: coords.value.lng,
    address: trim(form.address),
    status: form.status,
    isVerified: form.isVerified,
    remark: trim(form.remark),
  }
}

async function handleSubmit() {
  submitted.value = true
  error.value = null
  if (problems.value.length || !canSave.value) return

  saving.value = true
  try {
    const payload = buildPayload()
    if (isNew.value) {
      const site = await createSite(payload)
      flash.set(`เพิ่มสถานี ${site.siteCode} แล้ว`)
    } else {
      /*
       * ไม่ส่ง siteCode ตอนแก้ไข — ช่องนั้นล็อกไว้อยู่แล้ว ส่งไปก็มีแต่จะเปิดช่อง
       * ให้พลาด รหัสสถานีเป็นคีย์ที่ importer ทุกตัวใช้จับคู่ ถ้าแก้แล้ว
       * import รอบหน้าจะมองเป็นสถานีคนละตัวแล้วสร้างซ้ำขึ้นมาใหม่
       */
      const rest: Partial<SitePayload> = { ...payload }
      delete rest.siteCode
      const site = await updateSite(id.value!, rest)
      flash.set(`บันทึกการแก้ไข ${site.siteCode} แล้ว`)
    }
    goBack()
  } catch (err) {
    error.value = errorMessage(err, 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

/**
 * ย้อนกลับหน้าก่อนหน้า
 *
 * เช็ค history.state.back ก่อนเสมอ — vue-router ตั้งค่านี้เฉพาะตอนที่หน้าก่อนหน้า
 * อยู่ในแอปเรา ถ้าผู้ใช้เปิดลิงก์นี้ตรง ๆ จากไลน์หรือแท็บใหม่ back() จะพาออกนอกเว็บไปเลย
 */
function goBack() {
  if (window.history.state?.back) router.back()
  else router.replace('/sites/manage')
}

// ── ความถี่ — บันทึกทันที ไม่ผ่านปุ่มบันทึกด้านบน ───────────────────────────

/** ย่านที่สถานีนี้ยังไม่มี — เอามาเป็นตัวเลือกของ dropdown "เพิ่มย่าน" */
const bandOptions = computed(() => {
  const have = new Set(frequencies.value.map((f) => f.bandId))
  return (lookups.value?.bands ?? []).filter((b) => !have.has(b.id))
})

const newBandId = ref('')
const freqBusy = ref(false)
const freqError = ref<string | null>(null)

async function addBand() {
  if (!newBandId.value || !id.value) return
  freqBusy.value = true
  freqError.value = null
  try {
    const added = await addSiteFrequency(id.value, Number(newBandId.value))
    frequencies.value = [...frequencies.value, added]
      .sort((a, b) => a.code.localeCompare(b.code, 'en'))
    newBandId.value = ''
  } catch (err) {
    freqError.value = errorMessage(err, 'เพิ่มย่านความถี่ไม่สำเร็จ')
  } finally {
    freqBusy.value = false
  }
}

async function removeBand(f: SiteFrequency) {
  if (!id.value) return
  freqBusy.value = true
  freqError.value = null
  try {
    await deleteSiteFrequency(id.value, f.id)
    frequencies.value = frequencies.value.filter((x) => x.id !== f.id)
  } catch (err) {
    freqError.value = errorMessage(err, 'ลบย่านความถี่ไม่สำเร็จ')
  } finally {
    freqBusy.value = false
  }
}

const operatorColor = computed(() => {
  const o = lookups.value?.operators.find((x) => String(x.id) === form.operatorId)
  return categorical(o?.colorSlot ?? null, theme.resolved === 'dark')
})
</script>

<template>
  <AppLayout>
    <PageHeader
      :title="isNew ? 'เพิ่มสถานี' : `แก้ไข ${form.siteCode || 'สถานี'}`"
      :description="isNew
        ? 'กรอกข้อมูลสถานีใหม่ — รหัสสถานีตั้งได้ครั้งเดียว แก้ทีหลังไม่ได้'
        : 'แก้ข้อมูลสถานี ลักษณะสถานี ความถี่ ตู้ อุปกรณ์ และแบตเตอรี่ได้ที่นี่'"
    >
      <template #actions>
        <button type="button" class="btn btn-ghost btn-sm" @click="goBack">ย้อนกลับ</button>
      </template>
    </PageHeader>

    <div v-if="loading" class="mt-10 flex justify-center">
      <span class="loading loading-spinner loading-lg opacity-60" />
    </div>

    <template v-else>
      <div v-if="scopeMessage" role="alert" class="alert alert-warning mb-4 text-sm">
        <span>{{ scopeMessage }}</span>
      </div>
      <div v-if="error" role="alert" class="alert alert-error mb-4 text-sm">
        <span>{{ error }}</span>
      </div>
      <div v-if="submitted && problems.length" role="alert" class="alert alert-error mb-4 text-sm">
        <ul class="list-inside list-disc">
          <li v-for="p in problems" :key="p">{{ p }}</li>
        </ul>
      </div>

      <form class="grid gap-4 lg:grid-cols-[1fr_20rem]" @submit.prevent="handleSubmit">
        <!-- ข้อมูลสถานี -->
        <div class="card border border-base-300 bg-base-100">
          <div class="card-body gap-4 p-5">
            <div class="grid gap-4 sm:grid-cols-2">
              <BaseField
                v-model="form.siteCode"
                label="รหัสสถานี"
                :disabled="!isNew || saving"
                :placeholder="isNew ? 'เช่น CMI0003' : ''"
                :hint="isNew
                  ? 'ตัวพิมพ์ใหญ่ ตัวเลข และขีดกลาง — ระบบแปลงเป็นตัวพิมพ์ใหญ่ให้เอง'
                  : 'แก้ไม่ได้ เพราะเป็นคีย์ที่ไฟล์ import ทุกไฟล์ใช้จับคู่กับสถานีนี้'"
                required
                :autofocus="isNew"
              />
              <BaseField
                v-model="form.siteName"
                label="ชื่อสถานี"
                :disabled="saving"
                hint="เว้นว่างได้ — ไฟล์ต้นทางไม่มีคอลัมน์ชื่อ หน้าจอจะแสดงรหัสแทน"
              />
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <BaseSelect v-model="form.provinceId" label="จังหวัด" :disabled="saving" required>
                <option value="">— เลือกจังหวัด —</option>
                <option v-for="p in provinces" :key="p.id" :value="String(p.id)">{{ p.nameTh }}</option>
              </BaseSelect>

              <BaseSelect
                v-model="form.districtId"
                label="อำเภอ"
                :disabled="saving || !form.provinceId"
                :hint="!form.provinceId
                  ? 'เลือกจังหวัดก่อน'
                  : districtOptions.length
                    ? undefined
                    : 'จังหวัดนี้ยังไม่มีอำเภอในระบบ (อำเภอถูกสร้างจากไฟล์สถานีเท่าที่พบจริง)'"
              >
                <option value="">— ไม่ระบุ —</option>
                <option v-for="d in districtOptions" :key="d.id" :value="String(d.id)">
                  {{ d.nameTh }}
                </option>
              </BaseSelect>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <BaseSelect v-model="form.operatorId" label="ค่ายผู้ให้บริการ" :disabled="saving">
                  <option value="">— ยังไม่ระบุ —</option>
                  <option v-for="o in lookups?.operators" :key="o.id" :value="String(o.id)">
                    {{ o.nameTh }}
                  </option>
                </BaseSelect>
                <p class="mt-1.5 flex items-center gap-1.5 text-xs opacity-60">
                  <span class="size-2.5 rounded-full" :style="{ background: operatorColor }" />
                  สีของหมุดบนแผนที่
                </p>
              </div>

              <BaseSelect v-model="form.status" label="สถานะ" :disabled="saving">
                <option v-for="s in SITE_STATUSES" :key="s" :value="s">{{ SITE_STATUS_LABEL[s] }}</option>
              </BaseSelect>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <BaseField
                v-model="form.lat" label="ละติจูด" :disabled="saving" placeholder="18.78765"
              />
              <BaseField
                v-model="form.lng" label="ลองจิจูด" :disabled="saving" placeholder="98.99312"
              />
            </div>

            <p v-if="coords.warning" role="alert" class="alert alert-warning py-2 text-sm">
              <span>{{ coords.warning }}</span>
            </p>
            <p v-else-if="!form.lat && !form.lng" class="-mt-2 text-xs opacity-60">
              ไม่มีพิกัด = สถานีนี้จะไม่ปรากฏบนแผนที่ เข้าถึงได้จากหน้าตารางเท่านั้น
            </p>

            <BaseTextarea v-model="form.address" label="ที่อยู่" :rows="2" :disabled="saving" />
            <BaseTextarea
              v-model="form.remark" label="หมายเหตุ" :rows="2" :disabled="saving"
              hint="บันทึกภายใน เช่น เจ้าของพื้นที่ ทางเข้า หรือเงื่อนไขการเข้าปฏิบัติงาน"
            />

            <label class="label w-fit cursor-pointer justify-start gap-2">
              <input
                v-model="form.isVerified" type="checkbox" class="checkbox checkbox-sm"
                :disabled="saving"
              />
              <span class="label-text">ตรวจสอบข้อมูลแล้ว</span>
            </label>
            <p class="-mt-3 text-xs opacity-60">
              ติ๊กไว้เมื่อข้อมูลถูกยืนยันโดยคน — สถานีที่ importer สร้างขึ้นจากไฟล์ ring/freq
              โดยไม่มีในไฟล์หลักจะไม่ติ๊ก เพื่อให้ไล่ตรวจย้อนได้ว่าอันไหนยังไม่มีใครดู
            </p>

            <div class="flex flex-wrap items-center gap-2 pt-1">
              <BaseButton type="submit" :loading="saving" :disabled="!canSave">
                {{ isNew ? 'เพิ่มสถานี' : 'บันทึกการแก้ไข' }}
              </BaseButton>
              <BaseButton variant="ghost" :disabled="saving" @click="goBack">ยกเลิก</BaseButton>
            </div>
          </div>
        </div>

        <div v-if="!isNew" class="flex flex-col gap-4">
          <!-- ลักษณะสถานีจากใบตรวจ PM — แก้ได้ บันทึกพร้อมปุ่มด้านบน -->
          <div class="card border border-base-300 bg-base-100">
            <div class="card-body gap-3 p-4">
              <p class="text-sm font-medium">ลักษณะสถานี</p>

              <BaseField
                v-model="form.siteType" label="ประเภท" :disabled="saving"
                placeholder="เช่น GBT, RTT"
              />
              <BaseField
                v-model="form.siteTypeRemark" label="หมายเหตุประเภท" :disabled="saving"
              />
              <BaseField
                v-model="form.towerType" label="ชนิดเสา" :disabled="saving"
                placeholder="เช่น Self support"
              />
              <BaseField
                v-model="form.towerTypeRemark" label="หมายเหตุชนิดเสา" :disabled="saving"
              />
              <BaseField
                v-model="form.towerHeightM" label="ความสูง (เมตร)" :disabled="saving"
                placeholder="45"
              />
              <BaseField
                v-model="form.towerHeightRemark" label="หมายเหตุความสูง" :disabled="saving"
              />

              <label class="label w-fit cursor-pointer justify-start gap-2">
                <input
                  v-model="form.pmAttrLock" type="checkbox" class="checkbox checkbox-sm"
                  :disabled="saving"
                />
                <span class="label-text">ล็อกไว้ ไม่ให้ import ทับ</span>
              </label>
              <p class="-mt-2 text-xs opacity-60">
                ติ๊กให้เองทันทีที่แก้ช่องใดช่องหนึ่งข้างบน — ค่าพวกนี้มาจากใบตรวจ PM
                ถ้าไม่ล็อก การ import ไฟล์ PM รอบหน้าจะเอาค่าจากไฟล์ทับกลับ
                ติ๊กออกเมื่อไฟล์ต้นทางถูกแก้ให้ถูกแล้ว และอยากให้ไฟล์เป็นตัวตั้งตามเดิม
              </p>
            </div>
          </div>

          <!-- ความถี่ — เพิ่ม/ลบได้ บันทึกทันที ไม่ผ่านปุ่มด้านบน -->
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
                    v-if="canWriteOriginal" type="button"
                    class="opacity-60 hover:opacity-100"
                    :disabled="freqBusy" :aria-label="`ลบย่าน ${f.code}`"
                    @click="removeBand(f)"
                  >✕</button>
                </span>
              </div>
              <p v-else class="text-sm opacity-60">ยังไม่มีข้อมูลความถี่ของสถานีนี้</p>

              <div v-if="canWriteOriginal && bandOptions.length" class="flex items-end gap-2">
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

          <div class="card border border-base-300 bg-base-100">
            <div class="card-body gap-2 p-4">
              <p class="text-sm font-medium">อุปกรณ์ CPE ({{ devices.length }})</p>
              <ul v-if="devices.length" class="flex flex-col gap-1.5">
                <li
                  v-for="d in devices" :key="d.id"
                  class="rounded-field bg-base-200 px-2.5 py-1.5 text-xs"
                >
                  <p class="font-medium">{{ d.cpeName }}</p>
                  <p class="opacity-70">
                    {{ d.neType ?? '—' }}<template v-if="d.mgmtIp"> · {{ d.mgmtIp }}</template>
                  </p>
                  <p v-if="d.ringCode" class="opacity-70">
                    วง {{ d.ringCode }}<template v-if="d.hopNo !== null"> · hop {{ d.hopNo }}</template>
                  </p>
                </li>
              </ul>
              <p v-else class="text-sm opacity-60">ไม่มีอุปกรณ์ CPE ผูกกับสถานีนี้</p>
            </div>
          </div>

          <p class="px-1 text-xs opacity-60">
            อุปกรณ์ CPE แก้ที่หน้านี้ไม่ได้ — มาจากไฟล์ ring และผูกกับวง/hop
            ซึ่งเป็นคนละเรื่องกับตัวสถานี ถ้าข้อมูลไม่ตรง ให้แก้ที่ไฟล์ต้นทาง
            แล้ว import ใหม่ ส่วนที่เหลือในหน้านี้แก้ได้หมด
          </p>
        </div>

        <!-- โหมดสร้างยังไม่มีอะไรให้แสดงข้างขวา บอกไปตรง ๆ ดีกว่าปล่อยว่าง -->
        <div v-else class="card h-fit border border-base-300 bg-base-100">
          <div class="card-body gap-2 p-4 text-sm opacity-70">
            <p class="font-medium opacity-100">ความถี่และอุปกรณ์</p>
            <p>
              เพิ่มที่นี่ไม่ได้ — สองส่วนนั้นมาจากไฟล์ import
              บันทึกสถานีนี้ก่อน แล้วค่อย import ความถี่/ring เข้ามาผูกด้วยรหัสสถานี
            </p>
          </div>
        </div>
      </form>

      <!--
        ตู้ / อุปกรณ์ / แบตเตอรี่

        อยู่นอก <form> โดยตั้งใจ — ส่วนนี้บันทึกทีละรายการทันทีที่กด ไม่เกี่ยวกับ
        ปุ่มบันทึกด้านบนเลย และตัว component มี <form> ของตัวเองอยู่ในกล่องแก้ไข
        ซึ่งซ้อนใน <form> อีกชั้นไม่ได้ตามสเปก HTML
      -->
      <div class="divider mb-4 mt-8" />

      <section>
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-base font-semibold">ตู้ อุปกรณ์ และแบตเตอรี่</h2>
          <p class="text-sm opacity-70">
            แก้ทีละรายการและบันทึกทันที ไม่ต้องกดปุ่มบันทึกด้านบน
          </p>
        </div>

        <!--
          สิทธิ์ผูกกับ canWriteOriginal ไม่ใช่ canSave — ตั้งใจให้ต่างจากปุ่มบันทึก
          ตู้กับแบตเป็นของสถานีตามจังหวัดที่บันทึกไว้จริงใน DB ส่วน canSave รวม
          จังหวัดปลายทางที่ยังเลือกค้างอยู่ในฟอร์มด้วย ถ้าใช้ตัวเดียวกัน แค่เปลี่ยน
          dropdown จังหวัดค้างไว้โดยยังไม่บันทึก ปุ่มแก้ตู้จะหายทั้งที่ตู้ยังอยู่ที่เดิม
        -->
        <SiteAssetsList v-if="id" :site-id="id" :can-edit="canWriteOriginal" />

        <div v-else class="card border border-base-300 bg-base-100">
          <div class="card-body gap-2 p-4 text-sm opacity-70">
            <p class="font-medium opacity-100">ยังเพิ่มตู้ไม่ได้</p>
            <p>ตู้ต้องผูกกับสถานีที่มีอยู่จริง — บันทึกสถานีนี้ก่อน แล้วกลับมาที่หน้าแก้ไข</p>
          </div>
        </div>
      </section>
    </template>
  </AppLayout>
</template>

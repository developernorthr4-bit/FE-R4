import type L from 'leaflet'
import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import { errorMessage } from '@/lib/api'
import { cableColor as coreColor, coreOrder, drawCables as paintCables } from '@/lib/cable-layer'
import { getCables, type CableHit, type CableView } from '@/services/cables.api'
import { useThemeStore } from '@/stores/theme'

/**
 * ชั้นเคเบิลใยแก้วของ OnlineNetworkMap
 * layer group (gCable) หน้าแม่เป็นคนสร้างใน onMounted — ลำดับ addTo = ลำดับวาดบน canvas (เคเบิลล่างสุด)
 * คลิกถามเคเบิล (getCableAt) อยู่ใน m.on("click") ของหน้าแม่ เพราะใช้ร่วมกับไม้บรรทัด
 */
export function useCableLayer(ctx: {
  map: Ref<L.Map | null>
  renderer: Ref<L.Canvas | null>
  error: Ref<string | null>
  zoom: Ref<number>
}) {
  const { map, renderer, error, zoom } = ctx
  const theme = useThemeStore()

  const cablesOn = ref(false)
  const cableMono = ref(false)
  const cableHidden = ref<number[]>([])
  const cables = ref<CableView | null>(null)
  const cableHit = ref<CableHit | null>(null)
  const gCable = shallowRef<L.LayerGroup | null>(null)

  /**
   * เคเบิลโหลดแยกจากโหนด ไม่ได้รวมใน /online/map
   *
   * เพราะมันเปิด/ปิดได้ และหนักกว่าโหนดหลายเท่า (ที่ซูม 13 กรอบเมืองเชียงใหม่
   * มี 4,185 เส้น 20,576 จุดหลังลดความละเอียดแล้ว) ถ้ารวมเป็น request เดียว
   * คนที่ไม่ได้เปิดชั้นนี้ก็ต้องรอมันทุกครั้งที่แพน
   */
  async function loadCables() {
    const m = map.value
    if (!m) return
    if (!cablesOn.value) {
      cables.value = null
      gCable.value?.clearLayers()
      return
    }
    const b = m.getBounds().pad(0.1)
    try {
      cables.value = await getCables({
        bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()],
        zoom: m.getZoom(),
      })
      drawCables()
    } catch (err) {
      error.value = errorMessage(err, 'โหลดเคเบิลไม่สำเร็จ')
    }
  }

  function cableColor(core: number, dark: boolean): string {
    return coreColor(core, dark, cableMono.value)
  }

  function drawCables() {
    const g = gCable.value
    if (!g) return
    paintCables(g, cables.value, {
      dark: theme.resolved === 'dark',
      mono: cableMono.value,
      hidden: cableHidden.value,
      renderer: renderer.value ?? undefined,
    })
  }

  watch(cablesOn, () => void loadCables())
  watch([cableMono, cableHidden], drawCables, { deep: true })

  /** คอร์ที่มีจริงในกรอบนี้ เรียงตามที่พบบ่อย แล้วต่อท้ายด้วยตัวที่เหลือ */
  const visibleCores = computed(() => {
    return coreOrder((cables.value?.groups ?? []).map((g) => g.core))
  })

  function toggleCore(core: number) {
    const i = cableHidden.value.indexOf(core)
    if (i >= 0) cableHidden.value = cableHidden.value.filter((c) => c !== core)
    else cableHidden.value = [...cableHidden.value, core]
  }

  /** ระดับซูมที่ BE เริ่มส่งเคเบิลมาให้ — ถามจากคำตอบล่าสุด ไม่ได้ตั้งค่าซ้ำฝั่งนี้ */
  const cableMinZoom = computed(() => cables.value?.minZoom ?? 11)
  /** ต้องซูมเข้าอีกกี่ระดับถึงจะเห็นเคเบิล · 0 = เห็นได้แล้ว */
  const cableZoomShort = computed(() => Math.max(0, cableMinZoom.value - zoom.value))

  /*
   * 🪤 animate: false จำเป็น ไม่ใช่แค่เรื่องความสวย
   *
   * การกระโดดซูมหลายระดับทีเดียว (7 → 11) ทำให้แอนิเมชันของ Leaflet ค้างกลางทาง
   * แล้ว zoomend ไม่ยิง — ผลคือ scheduleLoad ไม่ทำงาน ตัวเลขบนแผงค้างที่ค่าเดิม
   * และ canvas ยังเป็นภาพของซูมเก่าที่ถูกยืดจนเบลอ เจอตอนทดสอบบนเบราว์เซอร์จริง
   */
  function zoomToCables() {
    map.value?.setZoom(cableMinZoom.value, { animate: false })
  }

  return {
    cablesOn,
    cableMono,
    cableHidden,
    cables,
    cableHit,
    gCable,
    loadCables,
    cableColor,
    drawCables,
    visibleCores,
    toggleCore,
    cableMinZoom,
    cableZoomShort,
    zoomToCables,
  }
}

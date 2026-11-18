import { computed, ref, type Ref } from 'vue'
import { isPresent, type BatteryRow, type SiteAssets } from '@/lib/assets'

/**
 * ติ๊กเลือกแบตเพื่อย้ายข้ามสถานี (SiteAssetsList)
 * batteriesIn มาจากรายการ — เคารพสวิตช์ "แสดงของที่ถอดแล้ว" เหมือนที่จอแสดง
 */
export function useBatterySelection(
  data: Ref<SiteAssets | null>,
  batteriesIn: (cabinetId: string | null) => BatteryRow[],
) {
  /**
   * ก้อนที่ติ๊กไว้ — ต้อง reassign Set ใหม่ทุกครั้ง ไม่ add/delete ทับของเดิม
   * ไม่งั้น computed ที่อ่าน .size/.has ไม่รู้ว่าค่าเปลี่ยน
   */
  const selected = ref<Set<string>>(new Set())

  /** ย้ายได้เฉพาะก้อนที่ยังอยู่ในสถานี — ถอดแล้ว/หาย/ย้ายไปแล้ว ไม่มีของให้ย้าย */
  function canMove(b: BatteryRow): boolean {
    return isPresent(b.status) && !b.movedTo
  }

  function toggle(id: string) {
    const next = new Set(selected.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected.value = next
  }

  /** ติ๊ก/เอาออกทั้งตู้ — ใช้บ่อยตอนยกทั้งชุดไปอีกสถานี */
  function toggleCabinet(cabinetId: string | null) {
    const ids = batteriesIn(cabinetId).filter(canMove).map((b) => b.id)
    const all = ids.length > 0 && ids.every((id) => selected.value.has(id))
    const next = new Set(selected.value)
    for (const id of ids) {
      if (all) next.delete(id)
      else next.add(id)
    }
    selected.value = next
  }

  function cabinetAllSelected(cabinetId: string | null): boolean {
    const ids = batteriesIn(cabinetId).filter(canMove).map((b) => b.id)
    return ids.length > 0 && ids.every((id) => selected.value.has(id))
  }

  /** เรียงตามตู้แล้วตามช่อง ให้จับคู่กับช่องปลายทางตามลำดับที่คนอ่านเข้าใจ */
  const selectedBatteries = computed(() => {
    const cabCode = new Map((data.value?.cabinets ?? []).map((c) => [c.id, c.cabinetCode]))
    return (data.value?.batteries ?? [])
      .filter((b) => selected.value.has(b.id) && canMove(b))
      .sort((a, b) =>
        (cabCode.get(a.cabinetId ?? '') ?? '').localeCompare(cabCode.get(b.cabinetId ?? '') ?? '', 'th', { numeric: true })
        || (a.bankCode ?? '').localeCompare(b.bankCode ?? '', 'th', { numeric: true }))
  })

  return { selected, canMove, toggle, toggleCabinet, cabinetAllSelected, selectedBatteries }
}

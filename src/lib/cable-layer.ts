import L from 'leaflet'
import { categorical, UNKNOWN_COLOR } from './palette'
import type { CableView } from '../services/cables.api'

/**
 * ชั้นเคเบิลใยแก้วบนแผนที่ — ใช้ร่วมกันระหว่างแผนที่โครงข่าย online กับแผนที่สำรวจ
 * แยกออกมาเพื่อให้สองหน้าให้สีคอร์ตรงกัน คนดูจำสีเดียวได้ทั้งระบบ
 *
 * สีของเคเบิลตามจำนวนคอร์ — ในไฟล์มีคอร์ 16 ค่า แต่กฎใน lib/palette.ts ห้ามเกิน
 * 8 หมวด (เกินนั้นแยกสีไม่ออกภายใต้ภาวะตาบอดสี) จึงจ่ายสีให้ 6 ค่าที่พบบ่อยจริง
 * ซึ่งครอบคลุม 68,479 จาก 73,248 เส้น ที่เหลือยุบเป็น "อื่น ๆ" สีเทา
 */
export const CORE_SLOT: Record<number, number> = { 6: 1, 12: 3, 24: 4, 48: 7, 60: 5, 96: 2 }
export const CORE_ORDER = [24, 6, 12, 48, 60, 96]
/** สีเดียวจาง ๆ ตอนเปิดโหมดไม่แยกคอร์ — เคเบิลเป็นฉากหลัง ไม่ใช่พระเอก */
export const CABLE_MONO = '#5b7086'

export function cableColor(core: number, dark: boolean, mono = false): string {
  if (mono) return CABLE_MONO
  const slot = CORE_SLOT[core]
  return slot ? categorical(slot, dark) : (dark ? UNKNOWN_COLOR.dark : UNKNOWN_COLOR.light)
}

/** ลำดับคอร์ที่จะแสดงในตำนาน — ตัวที่พบบ่อยก่อน ที่เหลือเรียงตัวเลข */
export function coreOrder(cores: Iterable<number>): number[] {
  const here = new Set(cores)
  const ordered = CORE_ORDER.filter((c) => here.has(c))
  const rest = [...here].filter((c) => !CORE_ORDER.includes(c)).sort((a, b) => a - b)
  return [...ordered, ...rest]
}

/**
 * วาดเป็น polyline เดียวต่อกลุ่มคอร์ ไม่ใช่ object ต่อเส้น
 * 4,185 เส้นถ้าแยกเป็น object ละเส้นคือเบราว์เซอร์หนืดทันทีที่แพน
 * แลกกับการที่กดเส้นตรง ๆ ไม่ได้ — จึงถาม BE ว่ากดโดนเส้นไหนแทน (cables/at)
 *
 * 🪤 renderer ต้องเป็นตัวเดียวกับที่หมุดใช้ ไม่งั้น Leaflet สร้าง canvas ใบใหม่
 *    ทับใบเดิมแล้วกลืนคลิก (ดูคำอธิบายยาวใน OnlineNetworkMap.vue)
 */
export function drawCables(
  g: L.LayerGroup,
  data: CableView | null,
  opts: { dark: boolean; mono: boolean; hidden?: number[]; renderer?: L.Renderer },
) {
  g.clearLayers()
  if (!data) return
  for (const grp of data.groups) {
    if (opts.hidden?.includes(grp.core)) continue
    const lines = grp.lines.map((flat) => {
      const out: [number, number][] = []
      for (let i = 0; i < flat.length; i += 2) out.push([flat[i]!, flat[i + 1]!])
      return out
    })
    L.polyline(lines, {
      color: cableColor(grp.core, opts.dark, opts.mono),
      weight: opts.mono ? 1 : 1.4,
      opacity: opts.mono ? 0.35 : 0.6,
      renderer: opts.renderer,
      interactive: false,
    }).addTo(g)
  }
}

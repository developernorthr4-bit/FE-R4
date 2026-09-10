import L from 'leaflet'

/**
 * หมุดที่เป็นรูปทรงอื่นได้ ไม่ใช่วงกลมอย่างเดียว
 *
 * ทำไมต้องมี: แผนที่มีสี่ชั้น (สถานี / OLT / L1 / L2) ถ้าทุกชั้นเป็นวงกลมเหมือนกัน
 * ต่างแค่สีกับขนาด พอจุดหนาแน่นเข้าจะแยกไม่ออกเลยว่าอันไหนเป็นอะไร — และคนที่
 * แยกสีได้ไม่ดีก็หมดทางอ่าน กฎใน lib/palette.ts เขียนไว้อยู่แล้วว่าห้ามให้สีเป็น
 * ช่องทางเดียวที่บอกความหมาย รูปทรงคือช่องทางที่สองที่อ่านได้แม้เป็นภาพขาวดำ
 *
 * ทำไมไม่ใช้ L.marker + divIcon ซึ่งง่ายกว่า: ที่ซูมระดับภาคมีสถานี 6,897 จุด
 * divIcon คือ DOM element 6,897 ตัว เบราว์เซอร์หนืดทันที ส่วนวิธีนี้ยังวาดลง
 * canvas ตัวเดียวเหมือนเดิม เพิ่มแค่คำสั่งวาดเส้นแทน arc()
 *
 * 🪤 ต่อยอดจากภายในของ Leaflet (_renderer, _point, _radius, _fillStroke)
 *    ซึ่งไม่ใช่ API สาธารณะ — เราตรึงเวอร์ชัน leaflet ไว้ที่ 1.9.4 ใน package.json
 *    ถ้าวันหนึ่งอัปเกรดแล้วหมุดหาย ให้มาดูไฟล์นี้ก่อน
 */

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond'

type CanvasWithShape = L.Canvas & {
  _drawing?: boolean
  _ctx?: CanvasRenderingContext2D
  _updateShape?: (layer: ShapeMarkerLayer) => void
  _fillStroke?: (ctx: CanvasRenderingContext2D, layer: L.Path) => void
}

type ShapeMarkerLayer = L.CircleMarker & {
  _point: L.Point
  _radius: number
  _empty: () => boolean
  _renderer: CanvasWithShape
  options: L.CircleMarkerOptions & { shape?: MarkerShape }
}

/**
 * เติมวิธีวาดรูปทรงให้ renderer แบบ canvas
 * ทำครั้งเดียวตอนโหลดโมดูล — ตัวที่ไม่ได้ใช้ shape ยังวาดเหมือนเดิมทุกประการ
 */
const canvasProto = L.Canvas.prototype as unknown as CanvasWithShape

canvasProto._updateShape = function updateShape(layer: ShapeMarkerLayer) {
  if (!this._drawing || layer._empty()) return

  const ctx = this._ctx
  if (!ctx) return

  const p = layer._point
  const r = Math.max(Math.round(layer._radius), 1)

  ctx.beginPath()
  switch (layer.options.shape) {
    case 'square':
      ctx.rect(p.x - r, p.y - r, r * 2, r * 2)
      break

    case 'diamond':
      ctx.moveTo(p.x, p.y - r * 1.25)
      ctx.lineTo(p.x + r * 1.25, p.y)
      ctx.lineTo(p.x, p.y + r * 1.25)
      ctx.lineTo(p.x - r * 1.25, p.y)
      ctx.closePath()
      break

    case 'triangle': {
      // สามเหลี่ยมยอดแหลมขึ้น อ่านออกว่าเป็น "เสา" ได้แม้ขนาดเล็ก
      const h = r * 1.35
      ctx.moveTo(p.x, p.y - h)
      ctx.lineTo(p.x + h * 0.92, p.y + h * 0.72)
      ctx.lineTo(p.x - h * 0.92, p.y + h * 0.72)
      ctx.closePath()
      break
    }

    default:
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2, false)
  }

  this._fillStroke?.(ctx, layer as unknown as L.Path)
}

const ShapeMarkerClass = L.CircleMarker.extend({
  options: { shape: 'circle' as MarkerShape },

  _updatePath(this: ShapeMarkerLayer) {
    /*
     * renderer แบบ SVG ไม่มี _updateShape — ถอยไปวาดเป็นวงกลมแทนที่จะพัง
     * เกิดขึ้นได้ถ้าลืมส่ง renderer มา แล้ว Leaflet เลือก SVG ให้เอง
     */
    if (this._renderer._updateShape) this._renderer._updateShape(this)
    else (L.CircleMarker.prototype as unknown as { _updatePath: () => void })._updatePath.call(this)
  },
})

export type ShapeMarkerOptions = L.CircleMarkerOptions & { shape?: MarkerShape }

export function shapeMarker(
  latlng: L.LatLngExpression,
  options: ShapeMarkerOptions,
): L.CircleMarker {
  return new (ShapeMarkerClass as unknown as new (
    ll: L.LatLngExpression, o: ShapeMarkerOptions,
  ) => L.CircleMarker)(latlng, options)
}

/**
 * จุดของรูปทรงเดียวกันในระบบพิกัด SVG กรอบ -10..10
 * ใช้วาด legend ในแผงควบคุมให้ตรงกับหมุดบนแผนที่เป๊ะ ๆ
 */
export function glyphPoints(shape: MarkerShape): string {
  switch (shape) {
    case 'square': return '-7,-7 7,-7 7,7 -7,7'
    case 'diamond': return '0,-9 9,0 0,9 -9,0'
    case 'triangle': return '0,-9 8,7 -8,7'
    default: return ''
  }
}

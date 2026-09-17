/**
 * ย่อรูปในเบราว์เซอร์ก่อนอัปโหลด
 *
 * BE ไม่ย่อรูปโดยตั้งใจ (ไม่ลง sharp บน Render free) รูปจากกล้องมือถือ 4,000 px
 * 3–5 MB ต้องเหลือ ~200–300 KB ก่อนถึง BE ไม่งั้นโควตา 1 GB หมดใน 300 รูป
 *
 * createImageBitmap กับ imageOrientation:'from-image' ทำให้รูปแนวตั้งจากมือถือ
 * ไม่กลับหัว (EXIF orientation) โดยไม่ต้องอ่าน EXIF เอง — รองรับทุกเบราว์เซอร์
 * ที่ใช้อยู่ตอนนี้ ถ้าไม่รองรับก็ตกไปใช้ <img> ธรรมดา ซึ่งเบราว์เซอร์ใหม่ ๆ
 * ก็หมุนให้ตาม EXIF อยู่แล้ว (image-orientation: from-image เป็นค่าเริ่มต้น)
 */
const MAX_EDGE = 1600
const QUALITY = 0.8

export type ResizedImage = { blob: Blob; width: number; height: number }

export async function resizeImage(file: File, maxEdge = MAX_EDGE): Promise<ResizedImage> {
  const source = await loadBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height))
  const width = Math.round(source.width * scale)
  const height = Math.round(source.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปไม่ได้')
  ctx.drawImage(source, 0, 0, width, height)
  if ('close' in source) source.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
  if (!blob) throw new Error('แปลงรูปไม่สำเร็จ')
  return { blob, width, height }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // บางเบราว์เซอร์ไม่รับ option นี้ — ตกไปใช้ <img>
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('อ่านไฟล์รูปไม่ได้'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

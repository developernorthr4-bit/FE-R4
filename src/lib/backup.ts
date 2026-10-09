/**
 * ชั่วโมงสำรองไฟตามเกรด — ป้าย/สี/ข้อความของหน้าจอ
 *
 * สูตรจริงคำนวณที่ BE ที่เดียว (BE-R4/src/backup/calc.ts) หน้าจอไม่คำนวณเอง
 * ข้อความอธิบายสูตรด้านล่างต้องตรงกับคอมเมนต์ในไฟล์นั้น — แก้สูตรต้องแก้ทั้งสองที่
 */

export type BackupStatus =
  | 'pass' | 'fail' | 'no_grade' | 'abnormal_load' | 'no_load' | 'no_battery' | 'no_cabinet1'

export const BACKUP_STATUSES: BackupStatus[] = [
  'pass', 'fail', 'no_grade', 'abnormal_load', 'no_load', 'no_battery', 'no_cabinet1',
]

export const BACKUP_STATUS_LABEL: Record<BackupStatus, string> = {
  pass: 'ผ่าน',
  fail: 'ไม่ผ่าน',
  no_grade: 'ไม่มีเกรด/เป้า',
  abnormal_load: 'load ผิดปกติ',
  no_load: 'ไม่มีค่า load',
  no_battery: 'ไม่มีแบตในตู้ 1',
  no_cabinet1: 'ไม่มีตู้ 1',
}

/** คำอธิบายสั้นใต้ป้าย — บอกว่าทำไมตัดสินไม่ได้ และต้องไปแก้ที่ไหน */
export const BACKUP_STATUS_HINT: Record<BackupStatus, string> = {
  pass: 'ชั่วโมงสำรองถึงเป้าของเกรด',
  fail: 'ชั่วโมงสำรองต่ำกว่าเป้าของเกรด',
  no_grade: 'สถานีไม่มีเกรด หรือเกรดนี้ยังไม่ได้ตั้งเป้าไว้ — แสดงชั่วโมงอย่างเดียว',
  abnormal_load: 'load สูงกว่าเพดานที่ตั้งไว้ น่าจะกรอกผิด — แสดงชั่วโมงแต่ไม่ตัดสิน',
  no_load: 'ไม่มีผล PM หรือค่า load ของตู้ 1 ว่าง/เป็น 0',
  no_battery: 'ตู้ 1 ไม่มีแบตที่ใช้งานอยู่และรู้ความจุ',
  no_cabinet1: 'สถานีนี้ไม่มีตู้รหัส 1 — สูตรคิดเฉพาะตู้ 1',
}

export const BACKUP_STATUS_BADGE: Record<BackupStatus, string> = {
  pass: 'badge-success',
  fail: 'badge-error',
  no_grade: 'badge-ghost',
  abnormal_load: 'badge-warning',
  no_load: 'badge-ghost',
  no_battery: 'badge-ghost',
  no_cabinet1: 'badge-ghost',
}

/** 4.04 → "4.0 ชม." · 0.5 → "30 นาที" — ต่ำกว่าชั่วโมงอ่านเป็นนาทีเข้าใจง่ายกว่า */
export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return '—'
  if (h < 1) return `${Math.round(h * 60)} นาที`
  return `${h.toFixed(1)} ชม.`
}

/** สูตรสำหรับแสดงบนหน้าจอ (ผู้ใช้ขอให้มี remark สูตรคำนวณ 2026-10-09) */
export const BACKUP_FORMULA = 'ชั่วโมงสำรอง = Σ (Ah × จำนวน × SOH% × DoD) ÷ Load Current (A)'

export const BACKUP_FORMULA_NOTES: string[] = [
  'คิดเฉพาะตู้ 1 ของสถานี · Load มาจากผล PM รอบล่าสุดของตู้ 1 (#11.6)',
  'นับเฉพาะแบตที่สถานะ "ใช้งาน" — ชำรุด / สำรอง / ตามแผน ไม่นับ',
  'สมมติทุกตู้เป็นระบบ 48V และแบตแต่ละแถวเป็นชุด 48V ต่อขนาน จึงบวก Ah กันได้ตรง ๆ',
  'SOH ไม่มีค่า → นับ 100% (ผลเป็นค่าประมาณการ) · เกิน 100 → ตัดเหลือ 100 · 0% → นับเป็น 0 (ควรตรวจซ้ำ)',
  'DoD = สัดส่วนความจุที่ดึงมาใช้ได้จริงก่อนระบบตัด แยกตามชนิดแบต (ตั้งค่าได้)',
  'เป็นค่าประมาณเชิงเส้น ไม่คิดผลของอุณหภูมิ / อัตราคายประจุ (Peukert)',
]

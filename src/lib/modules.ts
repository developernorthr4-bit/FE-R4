import type { Role } from './roles'

/**
 * ทะเบียนโมดูลของระบบ — แหล่งความจริงชุดเดียวของ "ระบบนี้มีงานอะไรบ้าง"
 *
 * ทั้งการ์ดบนหน้าหลักและปุ่มบนแถบด้านบนอ่านจากไฟล์นี้ที่เดียว
 * เพิ่มงานใหม่ = เพิ่มหนึ่งรายการที่นี่ ไม่ต้องไปแก้ Home.vue กับ AppLayout.vue
 * ให้ตรงกันเอง ซึ่งเป็นงานที่ลืมง่ายและอาการที่ได้คือโมดูลโผล่บนเมนูแต่ไม่มีการ์ด
 *
 * ที่สำคัญกว่านั้นคือ `min` — ถ้าแยกรายการเป็นสองชุด กติกาสิทธิ์จะถูกเขียนซ้ำ
 * แล้ววันหนึ่งจะตั้งไม่ตรงกัน ซึ่งกลายเป็นเรื่องสิทธิ์ ไม่ใช่แค่เรื่องหน้าตา
 *
 * ⚠️ นี่เป็นแค่การซ่อนสิ่งที่กดไปก็ไม่ผ่าน — router.beforeEach กันที่ route
 * และ BE ตรวจซ้ำทุก endpoint เสมอ
 */

export type ModuleGroup = 'daily' | 'data' | 'system' | 'track#c'

export type AppModule = {
  to: string
  label: string
  /** บรรทัดเดียวใต้ชื่อบนการ์ด — บอกว่า "เข้าไปแล้วทำอะไรได้" ไม่ใช่ขยายความชื่อ */
  description: string
  group: ModuleGroup
  /** บทบาทขั้นต่ำ — ต่ำกว่านี้ไม่เรนเดอร์ทั้งการ์ดและปุ่มบนเมนู */
  min?: Role
  /**
   * ปักหมุดไว้บนแถบด้านบนด้วยหรือไม่
   *
   * นี่คือตัวที่ทำให้แถบบนไม่ยาวขึ้นเรื่อย ๆ ตามจำนวนงาน — การ์ดขึ้นทุกโมดูล
   * แต่แถบบนขึ้นเฉพาะที่ปักหมุด เพิ่มโมดูลที่ 20 แถบบนก็ยังเท่าเดิม
   */
  nav?: boolean
  /**
   * ไฮไลต์เมนูเฉพาะตอนอยู่ path นี้เป๊ะ ๆ
   *
   * ต้องมีเพราะ RouterLink ถือว่า /sites ยังใช้งานอยู่เมื่ออยู่ที่ /sites/manage
   * (เทียบแบบ prefix) แล้วเมนูจะสว่างพร้อมกันสองอัน
   * ส่วน /events ไม่ต้อง — อยู่ที่ /events/new แล้ว Network Event สว่างถือว่าถูก
   * เพราะเป็นหน้าลูกของมันจริง ๆ ไม่ใช่คนละงาน
   */
  exact?: boolean
  /** ยังไม่ได้ทำ — การ์ดขึ้นแบบจางและกดไม่ได้ คนละเรื่องกับ min ที่ไม่ขึ้นเลย */
  soon?: boolean
}

export const MODULE_GROUPS: { key: ModuleGroup; label: string }[] = [
  { key: 'daily', label: 'งานประจำวัน' },
  { key: 'data', label: 'ข้อมูลหลัก' },
  { key: 'track#c', label: "Track#C"},
  { key: 'system', label: 'ระบบ' },
]

export const MODULES: AppModule[] = [
  {
    to: '/dashboard',
    label: 'แดชบอร์ด',
    description: 'สรุปเหตุการณ์รายสัปดาห์ และภาพรวมงาน PM',
    group: 'daily',
    nav: true,
  },
  {
    to: '/events',
    label: 'Network Event',
    description: 'บันทึกเหตุการณ์ ติดตามสถานะ และปิดงาน',
    group: 'daily',
    nav: true,
  },
  {
    to: '/maintenance',
    label: 'งาน PM',
    description: 'ทะเบียนตู้และแบตเตอรี่ทั้งภาค พร้อมผลตรวจรายปีงบ',
    group: 'daily',
    nav: true,
  },
  {
    to: '/sites',
    label: 'แผนที่สถานี',
    description: 'หมุดสถานีทั้งภาค กรองตามจังหวัด ค่าย และย่านความถี่',
    group: 'data',
    exact: true,
  },
  {
    to: '/sites/manage',
    label: 'จัดการสถานี',
    description: 'เพิ่ม แก้ไข ลบสถานี พร้อมตู้ อุปกรณ์ และแบตเตอรี่ในแต่ละแห่ง',
    group: 'data',
  },
  {
    to: '/online/orphans',
    label: 'OLT ที่ยังไม่ผูกสถานี',
    description: 'รายการ OLT ที่ไฟล์ต้นทางผูกกลับสถานีหลักไม่ได้ พร้อมเหตุผลของแต่ละตัว',
    group: 'data',
  },
  {
    to: '/users',
    label: 'จัดการผู้ใช้',
    description: 'บัญชีผู้ใช้ บทบาท และขอบเขตจังหวัดที่แก้ข้อมูลได้',
    group: 'system',
    min: 'admin',
  },
  {
    to: '/settings',
    label: 'ตั้งค่าระบบ',
    description: 'สวิตช์บันทึก audit ขนาดตาราง และเครื่องมือของผู้พัฒนา',
    group: 'system',
    min: 'dev',
  },
  {
    to: '/olt-bot',
    label: 'OLT Bot',
    description: 'ตรวจค่าแสง 1490Rx ทีละหลายรายการ แล้วได้ผลกลับมาเป็นไฟล์ Excel',
    group: 'track#c',
    min: 'editor',
  },
]

/**
 * กรองด้วยกติกาสิทธิ์ชุดเดียวกันทั้งการ์ดและแถบบน
 *
 * รับ `can` เข้ามาแทนที่จะเรียก store เอง เพื่อให้ไฟล์นี้ไม่ผูกกับ Pinia
 * เอาไปเขียนเทสต์ได้โดยไม่ต้องตั้ง app ทั้งก้อนขึ้นมา (แพตเทิร์นเดียวกับ lib/sites.ts)
 */
export function accessibleModules(
  modules: AppModule[],
  can: (min: Role) => boolean,
): AppModule[] {
  return modules.filter((m) => !m.min || can(m.min))
}

/** โมดูลที่ปักหมุดบนแถบด้านบน — ลำดับตามที่ประกาศไว้ในทะเบียน */
export const NAV_MODULES = MODULES.filter((m) => m.nav && !m.soon)

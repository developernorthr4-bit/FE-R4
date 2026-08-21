import { defineStore } from 'pinia'

/**
 * ข้อความแจ้งผลข้ามหน้า แบบอ่านครั้งเดียวแล้วหาย
 *
 * จำเป็นเพราะหลังบันทึกเราพากลับหน้าก่อนหน้าด้วย router.back() ซึ่งพา state
 * ติดไปด้วยไม่ได้ ถ้าไม่มีตัวนี้ ผู้ใช้กดบันทึกแล้วเด้งกลับเฉย ๆ โดยไม่รู้ว่าสำเร็จไหม
 * และไม่เห็นเลขที่ที่ระบบเพิ่งออกให้
 */
export const useFlashStore = defineStore('flash', {
  state: () => ({ message: null as string | null }),

  actions: {
    set(message: string) {
      this.message = message
    },
    /** อ่านแล้วล้างทันที กันข้อความค้างไปโผล่ซ้ำตอนกลับมาหน้าเดิมอีกรอบ */
    take(): string | null {
      const m = this.message
      this.message = null
      return m
    },
  },
})

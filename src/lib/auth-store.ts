import type { Role, UserStatus } from './roles'

export type User = {
  id: string
  username: string
  email: string
  fullName: string | null
  phone: string | null
  company: string | null
  role: Role
  status: UserStatus
  provinceScope: number[] | null
}

export type Tokens = { accessToken: string; refreshToken: string }

/**
 * เก็บ token ใน localStorage
 *
 * ข้อแลกเปลี่ยนที่รู้ตัว: ถ้ามีช่องโหว่ XSS สคริปต์อ่าน token ไปได้
 * แลกกับการที่ FE ทำงานได้เองโดยไม่ต้องพึ่ง cookie ข้าม domain ระหว่าง Vercel กับ Render
 *
 * ถ้าจะย้ายไป httpOnly cookie ให้แก้แค่ไฟล์นี้กับ lib/api.ts — หน้าจอไม่ต้องแตะ
 */
const KEY_ACCESS = 'r4.accessToken'
const KEY_REFRESH = 'r4.refreshToken'
const KEY_USER = 'r4.user'

/**
 * เหตุผลที่เซสชันจบ — ฝากไว้ให้หน้า login หยิบไปแสดง
 *
 * ใช้ sessionStorage ไม่ใช่ localStorage เพราะเป็นเรื่องเฉพาะแท็บนี้ครั้งนี้
 * ไม่ควรค้างข้ามการปิดเบราว์เซอร์แล้วโผล่มาทีหลังโดยไม่มีที่มาที่ไป
 */
const KEY_ENDED = 'r4.sessionEnded'

export const authStore = {
  getAccessToken(): string | null {
    return localStorage.getItem(KEY_ACCESS)
  },

  getRefreshToken(): string | null {
    return localStorage.getItem(KEY_REFRESH)
  },

  getUser(): User | null {
    const raw = localStorage.getItem(KEY_USER)
    if (!raw) return null
    try {
      return JSON.parse(raw) as User
    } catch {
      // ข้อมูลเสีย ล้างทิ้งดีกว่าปล่อยให้แอปพังทุกครั้งที่เปิด
      localStorage.removeItem(KEY_USER)
      return null
    }
  },

  setTokens(t: Tokens) {
    localStorage.setItem(KEY_ACCESS, t.accessToken)
    localStorage.setItem(KEY_REFRESH, t.refreshToken)
  },

  setUser(user: User) {
    localStorage.setItem(KEY_USER, JSON.stringify(user))
  },

  /** บันทึกว่าทำไมถึงหลุดออกจากระบบ ให้หน้า login เอาไปบอกผู้ใช้ */
  setSessionEndedReason(reason: string) {
    try {
      sessionStorage.setItem(KEY_ENDED, reason)
    } catch {
      // โหมดส่วนตัวบางตัวเขียนไม่ได้ — ไม่ได้ข้อความก็ยังใช้งานต่อได้
    }
  },

  /** อ่านแล้วล้างทิ้งในทีเดียว ข้อความนี้ต้องขึ้นครั้งเดียว ไม่ใช่ทุกครั้งที่เข้าหน้า login */
  takeSessionEndedReason(): string | null {
    const v = sessionStorage.getItem(KEY_ENDED)
    if (v) sessionStorage.removeItem(KEY_ENDED)
    return v
  },

  clear() {
    sessionStorage.removeItem(KEY_ENDED)
    localStorage.removeItem(KEY_ACCESS)
    localStorage.removeItem(KEY_REFRESH)
    localStorage.removeItem(KEY_USER)
  },
}

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

  clear() {
    localStorage.removeItem(KEY_ACCESS)
    localStorage.removeItem(KEY_REFRESH)
    localStorage.removeItem(KEY_USER)
  },
}

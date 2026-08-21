import { defineStore } from 'pinia'
import { setUnauthorizedHandler } from '../lib/api'
import { authStore, type User } from '../lib/auth-store'
import { atLeast, type Role } from '../lib/roles'
import * as authApi from '../services/auth.api'

/**
 * สถานะการล็อกอิน
 *
 * `loading` เป็น true ระหว่างตรวจ token ที่ค้างอยู่ตอนเปิดแอป — router guard
 * ต้องรอค่านี้ก่อนตัดสินใจ ไม่งั้นรีเฟรชหน้าทีจะเด้งไป /login ทุกครั้ง
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: authStore.getUser() as User | null,
    loading: true,
    ready: null as Promise<void> | null,
  }),

  getters: {
    isAuthenticated: (s) => s.user !== null,
    role: (s): Role | undefined => s.user?.role,
    /** ใช้ซ่อนเมนู/ปุ่ม — ไม่ใช่ด่านความปลอดภัย BE ตรวจซ้ำทุก endpoint */
    can: (s) => (min: Role) => atLeast(s.user?.role, min),
  },

  actions: {
    /**
     * ตรวจ session ที่ค้างอยู่ — เรียกได้หลายครั้ง จะทำงานจริงครั้งเดียว
     *
     * ไม่เชื่อ user ที่แคชไว้ใน localStorage เฉย ๆ เพราะ role หรือขอบเขตจังหวัด
     * อาจถูกผู้ดูแลเปลี่ยนไปแล้ว ต้องยืนยันกับ BE เสมอ
     */
    bootstrap(): Promise<void> {
      if (this.ready) return this.ready

      setUnauthorizedHandler(() => { this.user = null })

      this.ready = (async () => {
        if (!authStore.getAccessToken() && !authStore.getRefreshToken()) {
          this.user = null
          this.loading = false
          return
        }
        try {
          const user = await authApi.me()
          authStore.setUser(user)
          this.user = user
        } catch {
          // interceptor พยายาม refresh ให้แล้ว มาถึงตรงนี้แปลว่าไปต่อไม่ได้จริง
          authStore.clear()
          this.user = null
        } finally {
          this.loading = false
        }
      })()

      return this.ready
    },

    async login(identifier: string, password: string) {
      const data = await authApi.login(identifier, password)
      authStore.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken })
      authStore.setUser(data.user)
      this.user = data.user
      this.loading = false
    },

    async logout() {
      try {
        await authApi.logout(authStore.getRefreshToken())
      } catch {
        // ออกจากระบบฝั่งเราให้ได้เสมอ ต่อให้ BE ล่ม
      }
      authStore.clear()
      this.user = null
    },
  },
})

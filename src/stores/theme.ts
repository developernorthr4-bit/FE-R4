import { defineStore } from 'pinia'
import { themeStore, type ResolvedTheme, type Theme } from '../lib/theme-store'

/**
 * ธีม light / dark / system
 *
 * ตัวจัดการ DOM จริงอยู่ใน lib/theme-store.ts ซึ่งไม่ผูกกับ framework
 * store นี้เป็นแค่เปลือกให้ component ใช้ผ่าน reactive state
 */
export const useThemeStore = defineStore('theme', {
  state: () => ({
    theme: themeStore.get() as Theme,
    resolved: themeStore.resolve(themeStore.get()) as ResolvedTheme,
    unsubscribe: null as null | (() => void),
  }),

  actions: {
    /**
     * เรียกครั้งเดียวตอนแอปเริ่ม
     *
     * inline script ใน index.html ปั๊ม data-theme ให้ก่อนวาดเฟรมแรกอยู่แล้ว
     * บรรทัด apply ตรงนี้จึงมักไม่ทำอะไร แต่ต้องมีเผื่อสคริปต์นั้นถูกบล็อก
     * animate=false เพราะเป็นการวาดครั้งแรก ไม่มีสีเดิมให้ค่อย ๆ เปลี่ยนจาก
     */
    init() {
      themeStore.apply(this.resolved, false)
      this.watchSystem()
    },

    /** ตาม OS แบบสด — มีผลเฉพาะตอนเลือก system ไว้ */
    watchSystem() {
      this.unsubscribe?.()
      this.unsubscribe = null
      if (this.theme !== 'system') return
      this.unsubscribe = themeStore.subscribeSystem((next) => {
        this.resolved = next
        themeStore.apply(next, true)
      })
    },

    setTheme(next: Theme) {
      const resolved = themeStore.resolve(next)
      themeStore.set(next)
      themeStore.apply(resolved, true)
      this.theme = next
      this.resolved = resolved
      this.watchSystem()
    },
  },
})

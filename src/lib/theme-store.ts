export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/**
 * เก็บธีมที่ผู้ใช้เลือกไว้ใน localStorage
 *
 * เก็บ 3 ค่า (light/dark/system) แต่สิ่งที่เขียนลง DOM มีแค่ 2 ค่าเสมอ —
 * แปลง system เป็นค่าจริงด้วย JS แล้วปั๊ม data-theme="light|dark" ลง <html>
 * CSS จึงมีแค่สองบล็อกชัด ๆ ไม่ต้องประกาศชุดสีมืดซ้ำใน media query อีกที่
 *
 * ⚠️ ค่าคงที่ 3 ตัวข้างล่างซ้ำอยู่ใน inline script ที่ index.html ด้วย
 * (สคริปต์นั้นต้องรันก่อน React เพื่อกันหน้าจอกระพริบขาว) แก้ที่นี่แล้วแก้ที่นั่นด้วย
 */
const KEY = 'r4.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
const TRANSITION_ATTR = 'data-theme-transition'

/** ระยะที่เปิดให้ transition ทำงาน ต้อง >= ค่าใน index.css เล็กน้อย */
const TRANSITION_MS = 200

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

let transitionTimer: number | null = null

export const themeStore = {
  /** ค่าที่ผู้ใช้เลือก — ไม่ใช่ค่าที่แสดงจริง ถ้าเป็น system ต้อง resolve ก่อน */
  get(): Theme {
    try {
      const raw = localStorage.getItem(KEY)
      return isTheme(raw) ? raw : 'system'
    } catch {
      // โหมดส่วนตัวบางเบราว์เซอร์ห้ามแตะ localStorage — ถือว่าไม่เคยตั้งค่า
      return 'system'
    }
  },

  set(theme: Theme) {
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // เขียนไม่ได้ก็ไม่เป็นไร ธีมยังเปลี่ยนได้ในรอบนี้ แค่ไม่ถูกจำไว้รอบหน้า
    }
  },

  resolve(theme: Theme): ResolvedTheme {
    return theme === 'system' ? systemTheme() : theme
  },

  /**
   * เขียนธีมลง <html>
   *
   * ตั้ง colorScheme ด้วย ไม่งั้น scrollbar กับ input ของ native
   * จะยังเป็นโทนสว่างค้างอยู่บนพื้นมืด
   *
   * animate=false ตอนโหลดหน้าแรก — ไม่มีอะไรให้ค่อย ๆ เปลี่ยนจาก
   */
  apply(resolved: ResolvedTheme, animate: boolean) {
    const el = document.documentElement
    if (el.dataset.theme === resolved) return

    if (animate) {
      el.setAttribute(TRANSITION_ATTR, '')
      // บังคับให้เบราว์เซอร์คำนวณสไตล์รอบหนึ่งก่อน จะได้เห็น "ก่อนเปลี่ยน" ที่มี transition แล้ว
      // ถ้าไม่บังคับ การเพิ่ม transition พร้อมเปลี่ยนสีในจังหวะเดียวกันอาจถูกข้ามไปเลย
      void el.offsetHeight

      if (transitionTimer !== null) clearTimeout(transitionTimer)
      transitionTimer = window.setTimeout(() => {
        el.removeAttribute(TRANSITION_ATTR)
        transitionTimer = null
      }, TRANSITION_MS)
    }

    el.dataset.theme = resolved
    el.style.colorScheme = resolved
  },

  /**
   * ฟังการสลับ light/dark ของ OS
   *
   * จำเป็นเฉพาะตอนผู้ใช้เลือก system ไว้ — เครื่องเปลี่ยนโหมดกลางคัน
   * หน้าเว็บต้องเปลี่ยนตามทันทีโดยไม่ต้องรีเฟรช
   */
  subscribeSystem(onChange: (resolved: ResolvedTheme) => void): () => void {
    const mql = window.matchMedia(DARK_QUERY)
    const handler = (e: MediaQueryListEvent) => onChange(e.matches ? 'dark' : 'light')
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  },
}

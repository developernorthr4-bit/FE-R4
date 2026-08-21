import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { themeStore, type ResolvedTheme, type Theme } from './theme-store'

type ThemeState = {
  /** ค่าที่ผู้ใช้เลือก — ใช้ไฮไลต์ปุ่มที่ถูกเลือกในตัวสลับธีม */
  theme: Theme
  /** ค่าที่แสดงจริงหลังแปลง system แล้ว — ใช้เวลาต้องรู้ว่าตอนนี้มืดหรือสว่าง */
  resolved: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => themeStore.get())
  const [resolved, setResolved] = useState<ResolvedTheme>(() => themeStore.resolve(themeStore.get()))

  /**
   * ซิงก์ครั้งแรกตอน mount
   *
   * ปกติ inline script ใน index.html ปั๊ม data-theme ให้ตรงอยู่แล้ว บรรทัดนี้จึงมัก
   * ไม่ทำอะไร แต่ต้องมีไว้เผื่อสคริปต์นั้นถูกบล็อก หรือ localStorage แตะไม่ได้
   * animate=false เพราะเป็นการวาดครั้งแรก ไม่มีสีเดิมให้ค่อย ๆ เปลี่ยนจาก
   */
  useEffect(() => {
    themeStore.apply(resolved, false)
    // ตั้งใจให้รันครั้งเดียวตอน mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ตาม OS แบบสด — มีผลเฉพาะตอนเลือก system ไว้
  useEffect(() => {
    if (theme !== 'system') return
    return themeStore.subscribeSystem((next) => {
      setResolved(next)
      themeStore.apply(next, true)
    })
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    const nextResolved = themeStore.resolve(next)
    themeStore.set(next)
    themeStore.apply(nextResolved, true)
    setThemeState(next)
    setResolved(nextResolved)
  }, [])

  const value = useMemo<ThemeState>(
    () => ({ theme, resolved, setTheme }),
    [theme, resolved, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme ต้องอยู่ภายใน <ThemeProvider>')
  return ctx
}

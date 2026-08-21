import type { ReactElement } from 'react'
import { useTheme } from '../lib/theme-context'
import type { Theme } from '../lib/theme-store'

/** ไอคอนวาดเอง 3 ตัว — ไม่ดึง icon library เข้ามาเพื่อของแค่นี้ */
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

const OPTIONS: { value: Theme; label: string; icon: () => ReactElement }[] = [
  { value: 'light', label: 'สว่าง', icon: SunIcon },
  { value: 'dark', label: 'มืด', icon: MoonIcon },
  { value: 'system', label: 'ตามระบบ', icon: MonitorIcon },
]

/**
 * ตัวสลับธีมแบบ 3 ช่อง
 *
 * ไม่ใช้ปุ่มเดียวกดวน เพราะค่าเริ่มต้นคือ "ตามระบบ" — ถ้าซ่อนไว้ในวงกด
 * ผู้ใช้จะหาไม่เจอ และแยกไม่ออกว่ามืดเพราะเลือกเองหรือมืดเพราะ OS
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div
      role="group"
      aria-label="ธีมการแสดงผล"
      className="inline-flex rounded-lg border p-0.5"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = theme === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={selected}
            title={label}
            className="inline-flex size-8 items-center justify-center rounded-md transition-colors
                       focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: selected ? 'var(--surface-2)' : 'transparent',
              color: selected ? 'var(--text)' : 'var(--text-muted)',
              outlineColor: 'var(--ring)',
            }}
          >
            <Icon />
            <span className="sr-only">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

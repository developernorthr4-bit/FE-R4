import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { atLeast, ROLE_LABEL, type Role } from '../lib/roles'
import { ThemeToggle } from './theme-toggle'
import { Button } from './ui'

type NavItem = { to: string; label: string; min?: Role }

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'แดชบอร์ด' },
  { to: '/events', label: 'Network Event' },
  { to: '/users', label: 'จัดการผู้ใช้', min: 'admin' },
]

/**
 * โครงหน้าจอที่ใช้ร่วมกันทุกหน้าหลังล็อกอิน
 *
 * ทำตอนที่มี 4 หน้าแล้ว ไม่รอให้ครบ 6 — header ที่ก๊อปกันไว้แต่ละหน้าเริ่มเพี้ยนจากกัน
 * เร็วกว่าที่คิดเสมอ พอมีที่เดียวแล้วเพิ่มเมนูใหม่ก็แก้แค่ NAV ข้างบน
 *
 * เมนูที่ role ไม่ถึงจะไม่ถูกเรนเดอร์ แต่นั่นเป็นแค่การซ่อน — RequireRole กันที่ route
 * และ BE กันอีกชั้น คนพิมพ์ URL เองยังเข้าไม่ได้อยู่ดี
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const items = NAV.filter((n) => !n.min || atLeast(user?.role, n.min))

  async function handleLogout() {
    setBusy(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-full flex-col">
      <header
        className="sticky top-0 z-40 border-b"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold tracking-tight">R4</span>

          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className="rounded-md px-2.5 py-1.5 text-sm transition-colors"
                style={({ isActive }) => ({
                  background: isActive ? 'var(--surface-2)' : 'transparent',
                  color: isActive ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: isActive ? 500 : 400,
                })}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden text-sm sm:inline" style={{ color: 'var(--text-muted)' }}>
              {user?.fullName ?? user?.username}
              {user && ` · ${ROLE_LABEL[user.role]}`}
            </span>
            <ThemeToggle />
            <Button variant="ghost" onClick={handleLogout} loading={busy}>
              ออกจากระบบ
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  )
}

/** หัวข้อของแต่ละหน้า + ที่วางปุ่มด้านขวา */
export function PageHeader({
  title, description, actions,
}: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

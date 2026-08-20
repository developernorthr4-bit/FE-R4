import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import { useAuth } from '../lib/auth-context'

const ROLE_LABEL: Record<string, string> = {
  admin: 'ผู้ดูแลระบบ',
  editor: 'ผู้บันทึกข้อมูล',
  viewer: 'ผู้ดูข้อมูล',
}

/** หน้าเปล่าหลังล็อกอิน มีไว้พิสูจน์ว่า guard และ session ทำงานจริง */
export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function handleLogout() {
    setBusy(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-4 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">แดชบอร์ด</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {user?.fullName ?? user?.username} · {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
          </p>
        </div>
        <Button variant="ghost" onClick={handleLogout} loading={busy}>
          ออกจากระบบ
        </Button>
      </header>

      <div
        className="mt-8 rounded-xl border p-6 text-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <p className="font-medium">เข้าสู่ระบบสำเร็จ</p>
        <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
          หน้านี้ยังว่างอยู่ ขั้นถัดไปคือหน้าบันทึก Network Event รายวัน
          และหน้าสรุปรายสัปดาห์สำหรับผู้บริหาร
        </p>

        <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt style={{ color: 'var(--text-muted)' }}>ชื่อผู้ใช้</dt>
          <dd>{user?.username}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>อีเมล</dt>
          <dd>{user?.email}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>จังหวัดที่ดูแล</dt>
          <dd>{user?.provinceScope?.length ? user.provinceScope.join(', ') : 'ทุกจังหวัด'}</dd>
        </dl>
      </div>
    </div>
  )
}

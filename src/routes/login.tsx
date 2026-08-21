import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../components/theme-toggle'
import { Alert, Button, Field } from '../components/ui'
import { errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth-context'

export default function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ล็อกอินอยู่แล้วไม่ต้องเห็นหน้านี้อีก
  if (!loading && user) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(identifier.trim(), password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'เข้าสู่ระบบไม่สำเร็จ'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">เข้าสู่ระบบ</h1>
            <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
              ระบบติดตาม Network Event ภาคเหนือ
            </p>
          </div>
          <ThemeToggle />
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4 rounded-xl border p-6"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <Field
            label="อีเมล หรือ ชื่อผู้ใช้"
            name="identifier"
            type="text"
            autoComplete="username"
            autoFocus
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={submitting}
          />

          <Field
            label="รหัสผ่าน"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />

          {error && <Alert>{error}</Alert>}

          <Button type="submit" loading={submitting} className="mt-1">
            {submitting ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          ยังไม่มีบัญชี?{' '}
          <Link to="/register" className="underline underline-offset-2" style={{ color: 'var(--brand)' }}>
            สมัครใช้งาน
          </Link>
        </p>

        {/*
          ไม่มีปุ่ม "ลืมรหัสผ่าน" โดยตั้งใจ — ระบบไม่ส่งอีเมล การรีเซ็ตจึงต้องผ่านคน
          ผู้ดูแลกดสร้างลิงก์ให้จากหน้าจัดการผู้ใช้แล้วส่งให้เจ้าตัวเอง
        */}
        <p className="mt-2 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบเพื่อขอลิงก์ตั้งรหัสใหม่
        </p>
      </div>
    </div>
  )
}

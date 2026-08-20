import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
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
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">เข้าสู่ระบบ</h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
            ระบบติดตาม Network Event ภาคเหนือ
          </p>
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
      </div>
    </div>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ThemeToggle } from '../components/theme-toggle'
import { Alert, Button, Card, Field, Notice, Spinner } from '../components/ui'
import { api, errorMessage } from '../lib/api'

type CheckState =
  | { phase: 'checking' }
  | { phase: 'valid'; username: string | null }
  | { phase: 'invalid'; message: string }

/**
 * ตั้งรหัสผ่านใหม่จากลิงก์ที่ผู้ดูแลส่งให้
 *
 * ตรวจ token ก่อนโชว์ฟอร์ม (GET) แล้วค่อยกินทิ้งตอนกดยืนยัน (POST)
 * ถ้าไม่ตรวจก่อน ผู้ใช้จะกรอกรหัสยาว ๆ เสร็จแล้วเพิ่งรู้ว่าลิงก์หมดอายุ
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [check, setCheck] = useState<CheckState>({ phase: 'checking' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setCheck({ phase: 'invalid', message: 'ลิงก์ไม่ถูกต้อง — ไม่พบ token' })
      return
    }
    let cancelled = false
    api.get<{ ok: true; username: string | null }>(`/auth/reset-password/${encodeURIComponent(token)}`)
      .then((res) => {
        if (!cancelled) setCheck({ phase: 'valid', username: res.data.username })
      })
      .catch((err) => {
        if (!cancelled) {
          setCheck({ phase: 'invalid', message: errorMessage(err, 'ลิงก์นี้ใช้ไม่ได้แล้ว') })
        }
      })
    return () => { cancelled = true }
  }, [token])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }

    setSubmitting(true)
    try {
      const res = await api.post<{ message: string }>('/auth/reset-password', { token, password })
      setDone(res.data.message)
    } catch (err) {
      setError(errorMessage(err, 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">ตั้งรหัสผ่านใหม่</h1>
            {check.phase === 'valid' && check.username && (
              <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                สำหรับบัญชี {check.username}
              </p>
            )}
          </div>
          <ThemeToggle />
        </div>

        <Card className="flex flex-col gap-4 p-6">
          {check.phase === 'checking' && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <Spinner /> กำลังตรวจสอบลิงก์…
            </div>
          )}

          {check.phase === 'invalid' && (
            <>
              <Alert>{check.message}</Alert>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                ลิงก์ตั้งรหัสผ่านใช้ได้ครั้งเดียวและหมดอายุใน 30 นาที
                กรุณาติดต่อผู้ดูแลระบบเพื่อขอลิงก์ใหม่
              </p>
              <Button variant="ghost" onClick={() => navigate('/login')}>
                กลับไปหน้าเข้าสู่ระบบ
              </Button>
            </>
          )}

          {check.phase === 'valid' && done && (
            <>
              <Notice>{done}</Notice>
              <Button onClick={() => navigate('/login')}>เข้าสู่ระบบ</Button>
            </>
          )}

          {check.phase === 'valid' && !done && (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <Field
                label="รหัสผ่านใหม่"
                name="password"
                type="password"
                autoComplete="new-password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                hint="อย่างน้อย 8 ตัวอักษร"
              />
              <Field
                label="ยืนยันรหัสผ่านใหม่"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={submitting}
              />

              {error && <Alert>{error}</Alert>}

              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                เมื่อตั้งรหัสใหม่แล้ว ระบบจะออกจากระบบทุกอุปกรณ์ที่ค้างอยู่
              </p>

              <Button type="submit" loading={submitting}>
                {submitting ? 'กำลังบันทึก…' : 'ตั้งรหัสผ่านใหม่'}
              </Button>
            </form>
          )}
        </Card>

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          <Link to="/login" className="underline underline-offset-2" style={{ color: 'var(--brand)' }}>
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </div>
  )
}

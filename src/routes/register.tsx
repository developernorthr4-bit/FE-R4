import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ProvincePicker } from '../components/province-picker'
import { ThemeToggle } from '../components/theme-toggle'
import { Alert, Button, Card, Field, Notice } from '../components/ui'
import { api, errorMessage } from '../lib/api'

type Form = {
  username: string
  email: string
  fullName: string
  phone: string
  company: string
  password: string
  confirm: string
}

const EMPTY: Form = {
  username: '', email: '', fullName: '', phone: '', company: '', password: '', confirm: '',
}

/**
 * สมัครใช้งาน
 *
 * สมัครแล้วยังล็อกอินไม่ได้ทันที ต้องรอ dev/admin อนุมัติก่อน
 * จังหวัดที่ติ๊กที่นี่เป็น "คำขอ" — ผู้อนุมัติแก้ทับได้ตอนกดอนุมัติ
 * ต้องบอกผู้ใช้ให้ชัดตั้งแต่ต้น ไม่งั้นจะงงว่าทำไมกรอกครบแล้วเข้าไม่ได้
 */
export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<Form>(EMPTY)
  const [provinceScope, setProvinceScope] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof Form>(key: K) {
    return (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // เช็คคู่รหัสผ่านฝั่งนี้เลย ไม่ต้องเสียรอบไปถาม BE เพราะ BE ไม่รู้จัก confirm อยู่แล้ว
    if (form.password !== form.confirm) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }

    setSubmitting(true)
    try {
      const res = await api.post<{ message: string }>('/auth/register', {
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        company: form.company.trim() || null,
        password: form.password,
        provinceScope,
      })
      setDone(res.data.message)
      setForm(EMPTY)
      setProvinceScope([])
    } catch (err) {
      setError(errorMessage(err, 'สมัครไม่สำเร็จ'))
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <Card className="flex flex-col gap-4 p-6">
            <h1 className="text-xl font-semibold tracking-tight">ส่งคำขอเรียบร้อย</h1>
            <Notice>{done}</Notice>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              ผู้ดูแลระบบจะตรวจสอบและอาจโทรยืนยันตัวตนตามเบอร์ที่ให้ไว้
              เมื่ออนุมัติแล้วจึงเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านที่ตั้งไว้ได้
            </p>
            <Button onClick={() => navigate('/login')}>กลับไปหน้าเข้าสู่ระบบ</Button>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">สมัครใช้งาน</h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
            ระบบติดตาม Network Event ภาคเหนือ
          </p>
        </div>
        <ThemeToggle />
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <Card className="flex flex-col gap-4 p-6">
          <Field
            label="ชื่อผู้ใช้"
            name="username"
            autoComplete="username"
            autoFocus
            required
            value={form.username}
            onChange={set('username')}
            disabled={submitting}
            hint="ใช้ a-z 0-9 . _ - เท่านั้น ยาว 3–64 ตัว"
          />

          <Field
            label="อีเมล"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={set('email')}
            disabled={submitting}
          />

          <Field
            label="ชื่อ-นามสกุล"
            name="fullName"
            autoComplete="name"
            required
            value={form.fullName}
            onChange={set('fullName')}
            disabled={submitting}
          />

          <Field
            label="เบอร์โทรศัพท์"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            value={form.phone}
            onChange={set('phone')}
            disabled={submitting}
            hint="ผู้ดูแลใช้โทรยืนยันตัวตนก่อนอนุมัติ"
          />

          <Field
            label="หน่วยงาน / บริษัท"
            name="company"
            autoComplete="organization"
            value={form.company}
            onChange={set('company')}
            disabled={submitting}
            hint="ไม่บังคับ"
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">จังหวัดที่ดูแล</span>
            <ProvincePicker
              value={provinceScope}
              onChange={setProvinceScope}
              disabled={submitting}
            />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              เลือกตามพื้นที่ที่รับผิดชอบจริง ผู้ดูแลระบบจะตรวจและปรับให้ตอนอนุมัติ
            </p>
          </div>

          <Field
            label="รหัสผ่าน"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={set('password')}
            disabled={submitting}
            hint="อย่างน้อย 8 ตัวอักษร"
          />

          <Field
            label="ยืนยันรหัสผ่าน"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={set('confirm')}
            disabled={submitting}
          />

          {error && <Alert>{error}</Alert>}

          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            สมัครแล้วยังเข้าใช้งานไม่ได้ทันที ต้องรอผู้ดูแลระบบอนุมัติก่อน
          </p>

          <Button type="submit" loading={submitting} className="mt-1">
            {submitting ? 'กำลังส่งคำขอ…' : 'ส่งคำขอสมัคร'}
          </Button>
        </Card>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        มีบัญชีอยู่แล้ว?{' '}
        <Link to="/login" className="underline underline-offset-2" style={{ color: 'var(--brand)' }}>
          เข้าสู่ระบบ
        </Link>
      </p>
    </div>
  )
}

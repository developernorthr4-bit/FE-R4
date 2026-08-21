import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProvincePicker, useProvinces } from '../components/province-picker'
import { ThemeToggle } from '../components/theme-toggle'
import { Alert, Badge, Button, Card, Notice, Select, Spinner } from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { ROLE_LABEL, STATUS_LABEL, STATUS_TONE, type Role, type UserStatus } from '../lib/roles'

type AdminUser = {
  id: string
  username: string
  email: string
  fullName: string | null
  phone: string | null
  company: string | null
  role: Role
  status: UserStatus
  provinceScope: number[] | null
  approvedAt: string | null
  lastLoginAt: string | null
  createdAt: string
  /** BE คำนวณมาให้ตามกติกา role — ใช้ปิดปุ่ม ไม่ใช่ด่านความปลอดภัย */
  manageable: boolean
}

type ListResponse = { users: AdminUser[]; assignableRoles: Role[] }

const FILTERS: { value: UserStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'รออนุมัติ' },
  { value: 'active', label: 'ใช้งานอยู่' },
  { value: 'suspended', label: 'ถูกระงับ' },
  { value: 'all', label: 'ทั้งหมด' },
]

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

/** แปลง province id เป็นชื่อไทย — ไม่รู้จักก็โชว์ id ไปตรง ๆ ดีกว่าซ่อน */
function useScopeLabel() {
  const { provinces } = useProvinces()
  const byId = useMemo(() => new Map(provinces.map((p) => [p.id, p.nameTh])), [provinces])
  return useCallback(
    (scope: number[] | null) => {
      if (scope === null) return 'ทุกจังหวัด'
      if (scope.length === 0) return '—'
      return scope.map((id) => byId.get(id) ?? `#${id}`).join(', ')
    },
    [byId],
  )
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const scopeLabel = useScopeLabel()

  const [filter, setFilter] = useState<UserStatus | 'all'>('pending')
  const [rows, setRows] = useState<AdminUser[]>([])
  const [assignable, setAssignable] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [resetLink, setResetLink] = useState<{ username: string; url: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = filter === 'all' ? '' : `?status=${filter}`
      const res = await api.get<ListResponse>(`/users${query}`)
      setRows(res.data.users)
      setAssignable(res.data.assignableRoles)
    } catch (err) {
      setError(errorMessage(err, 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ'))
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { void load() }, [load])

  /** เรียก endpoint แล้วรีเฟรชรายการ — รวมการจัดการ error ไว้ที่เดียว */
  async function act(fn: () => Promise<unknown>, okMessage: string) {
    setError(null)
    setNotice(null)
    try {
      await fn()
      setNotice(okMessage)
      await load()
    } catch (err) {
      setError(errorMessage(err, 'ทำรายการไม่สำเร็จ'))
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">จัดการผู้ใช้</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            อนุมัติผู้สมัคร กำหนดบทบาทและจังหวัดที่ดูแล
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/dashboard">
            <Button variant="ghost">กลับแดชบอร์ด</Button>
          </Link>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const on = filter === f.value
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={on}
              className="rounded-md border px-3 py-1.5 text-sm transition-colors
                         focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                background: on ? 'var(--surface-2)' : 'var(--surface)',
                borderColor: on ? 'var(--brand)' : 'var(--border)',
                color: on ? 'var(--text)' : 'var(--text-muted)',
                outlineColor: 'var(--ring)',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {notice && <div className="mt-4"><Notice>{notice}</Notice></div>}
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}

      {resetLink && (
        <Card className="mt-4 flex flex-col gap-2 p-4">
          <p className="text-sm font-medium">ลิงก์ตั้งรหัสผ่านใหม่ของ {resetLink.username}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ใช้ได้ครั้งเดียว หมดอายุใน 30 นาที — คัดลอกส่งให้เจ้าตัวทางช่องทางที่ติดต่อกันอยู่
            ลิงก์นี้แสดงครั้งเดียว ปิดแล้วต้องกดสร้างใหม่
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="flex-1 overflow-x-auto rounded-md border px-2 py-1.5 text-xs whitespace-nowrap"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
            >
              {resetLink.url}
            </code>
            <Button
              variant="ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(resetLink.url)
                setNotice('คัดลอกลิงก์แล้ว')
              }}
            >
              คัดลอก
            </Button>
            <Button variant="ghost" onClick={() => setResetLink(null)}>ปิด</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="mt-10 flex justify-center" style={{ color: 'var(--text-muted)' }}>
          <Spinner className="size-6" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="mt-4 p-6 text-sm" >
          <p style={{ color: 'var(--text-muted)' }}>
            {filter === 'pending' ? 'ไม่มีคำขอรออนุมัติ' : 'ไม่มีผู้ใช้ในสถานะนี้'}
          </p>
        </Card>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {rows.map((u) => (
            <Card key={u.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{u.fullName ?? u.username}</span>
                    <Badge {...STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
                    <Badge bg="var(--surface-2)" fg="var(--text-muted)">{ROLE_LABEL[u.role]}</Badge>
                    {u.id === me?.id && (
                      <Badge bg="var(--surface-2)" fg="var(--text-muted)">คุณเอง</Badge>
                    )}
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt style={{ color: 'var(--text-muted)' }}>ชื่อผู้ใช้</dt>
                    <dd>{u.username}</dd>
                    <dt style={{ color: 'var(--text-muted)' }}>อีเมล</dt>
                    <dd className="break-all">{u.email}</dd>
                    <dt style={{ color: 'var(--text-muted)' }}>เบอร์โทร</dt>
                    <dd>{u.phone ?? '—'}</dd>
                    <dt style={{ color: 'var(--text-muted)' }}>หน่วยงาน</dt>
                    <dd>{u.company ?? '—'}</dd>
                    <dt style={{ color: 'var(--text-muted)' }}>จังหวัดที่ดูแล</dt>
                    <dd>{scopeLabel(u.provinceScope)}</dd>
                    <dt style={{ color: 'var(--text-muted)' }}>
                      {u.status === 'pending' ? 'สมัครเมื่อ' : 'เข้าใช้ล่าสุด'}
                    </dt>
                    <dd>{fmtDate(u.status === 'pending' ? u.createdAt : u.lastLoginAt)}</dd>
                  </dl>
                </div>

                {u.manageable && (
                  <div className="flex flex-wrap gap-2">
                    {u.status === 'pending' ? (
                      <>
                        <Button onClick={() => setEditing(u)}>ตรวจและอนุมัติ</Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            if (!confirm(`ปฏิเสธและลบคำขอของ ${u.username}?`)) return
                            void act(() => api.delete(`/users/${u.id}`), 'ลบคำขอแล้ว')
                          }}
                        >
                          ปฏิเสธ
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" onClick={() => setEditing(u)}>แก้ไข</Button>
                        <Button
                          variant="ghost"
                          onClick={() => void act(
                            () => api.post<{ url: string }>(`/users/${u.id}/reset-link`)
                              .then((res) => setResetLink({ username: u.username, url: res.data.url })),
                            'สร้างลิงก์แล้ว',
                          )}
                        >
                          ลิงก์รีเซ็ตรหัส
                        </Button>
                        {u.status === 'active' ? (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              if (!confirm(`ระงับการใช้งานของ ${u.username}?`)) return
                              void act(() => api.post(`/users/${u.id}/suspend`), 'ระงับการใช้งานแล้ว')
                            }}
                          >
                            ระงับ
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            onClick={() => void act(() => api.post(`/users/${u.id}/activate`), 'คืนสิทธิ์แล้ว')}
                          >
                            คืนสิทธิ์
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <EditDialog
          user={editing}
          assignable={assignable}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            setNotice(message)
            void load()
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

type DialogProps = {
  user: AdminUser
  assignable: Role[]
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}

/**
 * กล่องอนุมัติ/แก้ไข
 *
 * ตอนอนุมัติ ค่าตั้งต้นคือสิ่งที่ผู้สมัครติ๊กมาเอง ผู้อนุมัติแก้ทับได้ก่อนกดยืนยัน
 * ตัวเลือกบทบาทมาจาก assignableRoles ที่ BE ส่งมา ไม่ได้ hardcode ไว้ฝั่งนี้
 */
function EditDialog({ user, assignable, onClose, onSaved, onError }: DialogProps) {
  const approving = user.status === 'pending'
  const [role, setRole] = useState<Role>(user.role)
  const [all, setAll] = useState(user.provinceScope === null)
  const [scope, setScope] = useState<number[]>(user.provinceScope ?? [])
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const payload = { role, provinceScope: all ? null : scope }
      if (approving) {
        await api.post(`/users/${user.id}/approve`, payload)
        onSaved(`อนุมัติ ${user.username} แล้ว`)
      } else {
        await api.patch(`/users/${user.id}`, payload)
        onSaved(`บันทึกการแก้ไข ${user.username} แล้ว`)
      }
    } catch (err) {
      onError(errorMessage(err, 'บันทึกไม่สำเร็จ'))
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'oklch(0% 0 0 / 0.5)' }}
      onClick={onClose}
    >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Card className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
          <div>
            <h2 className="text-lg font-semibold">
              {approving ? 'ตรวจและอนุมัติ' : 'แก้ไขผู้ใช้'}
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {user.fullName ?? user.username} · {user.email}
              {user.phone && ` · ${user.phone}`}
            </p>
          </div>

          {approving && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              จังหวัดด้านล่างคือค่าที่ผู้สมัครติ๊กมาเอง ถือเป็นคำขอ — แก้ให้ตรงกับความจริงก่อนอนุมัติได้
            </p>
          )}

          <Select
            label="บทบาท"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            disabled={busy}
          >
            {assignable.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
            {/* role ปัจจุบันอาจสูงกว่าที่เราแต่งตั้งได้ ต้องมีให้เห็นไม่งั้น select จะว่าง */}
            {!assignable.includes(user.role) && (
              <option value={user.role} disabled>{ROLE_LABEL[user.role]} (แก้ไม่ได้)</option>
            )}
          </Select>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">จังหวัดที่ดูแล</span>
            <ProvincePicker
              value={scope}
              onChange={setScope}
              disabled={busy}
              allowAll
              all={all}
              onAllChange={setAll}
            />
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>ยกเลิก</Button>
            <Button onClick={save} loading={busy}>
              {approving ? 'อนุมัติ' : 'บันทึก'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

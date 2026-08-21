import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppLayout, PageHeader } from '../components/app-layout'
import { SitePicker, type SiteLite } from '../components/site-picker'
import { Alert, Badge, Button, Card, Field, Notice, Select, Spinner } from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import {
  addEventUpdate, createEvent, formatDateTime, formatDuration, fromLocalInput, getEvent,
  loadLookups, STATUS_LABEL, STATUS_TONE, toLocalInput, updateEvent,
  type EventStatus, type EventUpdate, type Lookups,
} from '../lib/events'
import { atLeast } from '../lib/roles'

type FormState = {
  eventDate: string
  provinceId: string
  title: string
  description: string
  eventTypeId: string
  rootCauseId: string
  severityId: string
  startedAt: string
  restoredAt: string
  status: EventStatus
  isServiceAffecting: boolean
  impactSummary: string
}

/** วันนี้ตามเขตเวลาไทย — ค่าตั้งต้นของช่องวันที่ */
function todayTh(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const EMPTY: FormState = {
  eventDate: todayTh(),
  provinceId: '',
  title: '',
  description: '',
  eventTypeId: '',
  rootCauseId: '',
  severityId: '',
  startedAt: '',
  restoredAt: '',
  status: 'open',
  isServiceAffecting: true,
  impactSummary: '',
}

/**
 * ฟอร์มบันทึก/แก้ไขเหตุการณ์ ใช้ไฟล์เดียวทั้งสองโหมด
 *
 * โหมดแก้ไข (`/events/:id`) มีไทม์ไลน์ต่อท้ายให้เพิ่มความคืบหน้า
 * ซึ่งเป็นวัตถุดิบของ narrative ในรายงานสัปดาห์ — เขียนตอนเกิดเหตุแล้วเก็บได้จริง
 * ดีกว่ามาไล่ถามย้อนหลังตอนสิ้นสัปดาห์
 */
export default function EventFormPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const { user } = useAuth()
  const canWrite = atLeast(user?.role, 'editor')

  const [lookups, setLookups] = useState<Lookups | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [sitesPicked, setSitesPicked] = useState<SiteLite[]>([])
  const [updates, setUpdates] = useState<EventUpdate[]>([])
  const [eventNo, setEventNo] = useState<string | null>(null)
  const [durationMin, setDurationMin] = useState<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        const lk = await loadLookups()
        if (cancelled) return
        setLookups(lk)

        if (isNew) {
          // ถ้าผู้ใช้ดูแลจังหวัดเดียว เลือกให้เลย — คนหน้างานส่วนใหญ่กรอกจังหวัดตัวเองซ้ำ ๆ
          const only = user?.provinceScope?.length === 1 ? user.provinceScope[0] : null
          setForm((f) => ({ ...f, provinceId: only ? String(only) : '' }))
          setLoading(false)
          return
        }

        const data = await getEvent(id!)
        if (cancelled) return
        const e = data.event
        setEventNo(e.eventNo)
        setDurationMin(e.durationMin)
        setForm({
          eventDate: e.eventDate,
          provinceId: String(e.provinceId),
          title: e.title,
          description: e.description ?? '',
          eventTypeId: e.eventTypeId ? String(e.eventTypeId) : '',
          rootCauseId: e.rootCauseId ? String(e.rootCauseId) : '',
          severityId: e.severityId ? String(e.severityId) : '',
          startedAt: toLocalInput(e.startedAt),
          restoredAt: toLocalInput(e.restoredAt),
          status: e.status,
          isServiceAffecting: e.isServiceAffecting,
          impactSummary: e.impactSummary ?? '',
        })
        setUpdates(data.updates)

        if (data.sites.length > 0) {
          const res = await api.post<{ sites: SiteLite[] }>('/sites/by-ids', {
            ids: data.sites.map((s) => s.siteId),
          })
          if (!cancelled) setSitesPicked(res.data.sites)
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'โหลดข้อมูลไม่สำเร็จ'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void boot()
    return () => { cancelled = true }
  }, [id, isNew, user?.provinceScope])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  /** เปลี่ยนจังหวัดแล้วสถานีที่เลือกไว้จะข้ามจังหวัดทันที ต้องล้าง — BE ปฏิเสธอยู่แล้วแต่บอกก่อนดีกว่า */
  function changeProvince(next: string) {
    if (next !== form.provinceId && sitesPicked.length > 0) {
      setSitesPicked([])
      setNotice('เปลี่ยนจังหวัดแล้ว รายการสถานีที่เลือกไว้ถูกล้าง')
    }
    set('provinceId', next)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (!form.provinceId) { setError('กรุณาเลือกจังหวัด'); return }

    const payload = {
      eventDate: form.eventDate,
      provinceId: Number(form.provinceId),
      title: form.title,
      description: form.description.trim() || null,
      eventTypeId: form.eventTypeId ? Number(form.eventTypeId) : null,
      rootCauseId: form.rootCauseId ? Number(form.rootCauseId) : null,
      severityId: form.severityId ? Number(form.severityId) : null,
      startedAt: fromLocalInput(form.startedAt),
      restoredAt: fromLocalInput(form.restoredAt),
      status: form.status,
      isServiceAffecting: form.isServiceAffecting,
      impactSummary: form.impactSummary.trim() || null,
      siteIds: sitesPicked.map((s) => s.id),
    }

    setSaving(true)
    try {
      if (isNew) {
        const created = await createEvent(payload)
        navigate(`/events/${created.id}`, { replace: true })
      } else {
        const updated = await updateEvent(id!, payload)
        setDurationMin(updated.durationMin)
        setNotice('บันทึกการแก้ไขแล้ว')
      }
    } catch (err) {
      setError(errorMessage(err, 'บันทึกไม่สำเร็จ'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20" style={{ color: 'var(--text-muted)' }}>
          <Spinner className="size-6" />
        </div>
      </AppLayout>
    )
  }

  const readOnly = !canWrite || saving

  return (
    <AppLayout>
      <PageHeader
        title={isNew ? 'บันทึกเหตุการณ์' : `เหตุการณ์ ${eventNo}`}
        description={
          isNew
            ? 'ระบบออกเลขที่ให้อัตโนมัติหลังบันทึก'
            : `แก้ไขล่าสุด · ระยะเวลา ${formatDuration(durationMin)}`
        }
        actions={<Button variant="ghost" onClick={() => navigate('/events')}>กลับรายการ</Button>}
      />

      {!canWrite && (
        <div className="mb-4">
          <Alert>บัญชีของคุณเป็นสิทธิ์อ่านอย่างเดียว แก้ไขข้อมูลไม่ได้</Alert>
        </div>
      )}
      {notice && <div className="mb-4"><Notice>{notice}</Notice></div>}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <form onSubmit={handleSubmit} noValidate>
        <Card className="flex flex-col gap-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="วันที่เกิดเหตุ"
              type="date"
              required
              value={form.eventDate}
              max={todayTh()}
              onChange={(e) => set('eventDate', e.target.value)}
              disabled={readOnly}
            />

            <Select
              label="จังหวัด"
              required
              value={form.provinceId}
              onChange={(e) => changeProvince(e.target.value)}
              disabled={readOnly}
            >
              <option value="">— เลือกจังหวัด —</option>
              {lookups?.provinces.map((p) => (
                <option key={p.id} value={p.id}>{p.nameTh}</option>
              ))}
            </Select>
          </div>

          <Field
            label="หัวข้อ"
            required
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            disabled={readOnly}
            hint="สรุปสั้น ๆ ว่าเกิดอะไรขึ้น เช่น สายไฟเบอร์ขาดช่วง อ.แม่ริม"
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="ประเภทเหตุการณ์"
              value={form.eventTypeId}
              onChange={(e) => set('eventTypeId', e.target.value)}
              disabled={readOnly}
            >
              <option value="">— ยังไม่ระบุ —</option>
              {lookups?.eventTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.nameTh}</option>
              ))}
            </Select>

            <Select
              label="สาเหตุ"
              value={form.rootCauseId}
              onChange={(e) => set('rootCauseId', e.target.value)}
              disabled={readOnly}
            >
              <option value="">— ยังไม่ทราบ —</option>
              {lookups?.rootCauses.map((rc) => (
                <option key={rc.id} value={rc.id}>{rc.nameTh}</option>
              ))}
            </Select>

            <Select
              label="ระดับความรุนแรง"
              value={form.severityId}
              onChange={(e) => set('severityId', e.target.value)}
              disabled={readOnly}
            >
              <option value="">— ยังไม่ระบุ —</option>
              {lookups?.severities.map((s) => (
                <option key={s.id} value={s.id}>{s.nameTh}</option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="เวลาเริ่มเหตุการณ์"
              type="datetime-local"
              value={form.startedAt}
              onChange={(e) => set('startedAt', e.target.value)}
              disabled={readOnly}
            />
            <Field
              label="เวลากู้คืน"
              type="datetime-local"
              value={form.restoredAt}
              onChange={(e) => set('restoredAt', e.target.value)}
              disabled={readOnly}
              hint='จำเป็นเมื่อสถานะเป็น "แก้ไขแล้ว"'
            />
            <Select
              label="สถานะ"
              value={form.status}
              onChange={(e) => set('status', e.target.value as EventStatus)}
              disabled={readOnly}
            >
              {(Object.keys(STATUS_LABEL) as EventStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isServiceAffecting}
              onChange={(e) => set('isServiceAffecting', e.target.checked)}
              disabled={readOnly}
            />
            กระทบการให้บริการลูกค้า
          </label>

          <TextArea
            label="รายละเอียด"
            value={form.description}
            onChange={(v) => set('description', v)}
            disabled={readOnly}
            rows={4}
          />

          <TextArea
            label="สรุปผลกระทบ"
            value={form.impactSummary}
            onChange={(v) => set('impactSummary', v)}
            disabled={readOnly}
            rows={2}
            hint="ข้อความนี้ถูกใช้ประกอบรายงานสัปดาห์"
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">สถานีที่ได้รับผลกระทบ</span>
            <SitePicker
              provinceId={form.provinceId ? Number(form.provinceId) : null}
              value={sitesPicked}
              onChange={setSitesPicked}
              disabled={readOnly}
            />
          </div>

          {canWrite && (
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => navigate('/events')} disabled={saving}>
                ยกเลิก
              </Button>
              <Button type="submit" loading={saving}>
                {isNew ? 'บันทึกเหตุการณ์' : 'บันทึกการแก้ไข'}
              </Button>
            </div>
          )}
        </Card>
      </form>

      {!isNew && (
        <Timeline
          eventId={id!}
          updates={updates}
          canWrite={canWrite}
          onAdded={(u, status) => {
            setUpdates((list) => [u, ...list])
            if (status) setForm((f) => ({ ...f, status }))
          }}
          onError={setError}
        />
      )}
    </AppLayout>
  )
}

function TextArea({
  label, value, onChange, disabled, rows = 3, hint,
}: {
  label: string; value: string; onChange: (v: string) => void
  disabled?: boolean; rows?: number; hint?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        value={value}
        rows={rows}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-3
                   disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
          // @ts-expect-error ตัวแปร CSS ของ Tailwind สำหรับสี ring
          '--tw-ring-color': 'var(--ring)',
        }}
      />
      {hint && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</span>}
    </label>
  )
}

function Timeline({
  eventId, updates, canWrite, onAdded, onError,
}: {
  eventId: string
  updates: EventUpdate[]
  canWrite: boolean
  onAdded: (u: EventUpdate, status?: EventStatus) => void
  onError: (m: string) => void
}) {
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<EventStatus | ''>('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!note.trim()) return
    setBusy(true)
    try {
      const created = await addEventUpdate(eventId, note.trim(), status || undefined)
      onAdded(created, status || undefined)
      setNote('')
      setStatus('')
    } catch (err) {
      onError(errorMessage(err, 'เพิ่มบันทึกไม่สำเร็จ'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-6 flex flex-col gap-4 p-6">
      <h2 className="text-base font-semibold">ความคืบหน้า</h2>

      {canWrite && (
        <div className="flex flex-col gap-2">
          <TextArea label="บันทึกความคืบหน้า" value={note} onChange={setNote} disabled={busy} rows={2} />
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="w-full sm:w-56">
              <Select
                label="เปลี่ยนสถานะพร้อมกัน"
                value={status}
                onChange={(e) => setStatus(e.target.value as EventStatus | '')}
                disabled={busy}
              >
                <option value="">— ไม่เปลี่ยน —</option>
                {(Object.keys(STATUS_LABEL) as EventStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </Select>
            </div>
            <Button onClick={add} loading={busy} disabled={!note.trim()}>เพิ่มบันทึก</Button>
          </div>
        </div>
      )}

      {updates.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>ยังไม่มีบันทึกความคืบหน้า</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {updates.map((u) => (
            <li
              key={u.id}
              className="border-l-2 pl-3 text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span style={{ color: 'var(--text-muted)' }}>{formatDateTime(u.updatedAtEvent)}</span>
                {u.status && <Badge {...STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{u.note}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

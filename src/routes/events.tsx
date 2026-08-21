import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppLayout, PageHeader } from '../components/app-layout'
import { Alert, Badge, Button, Card, Spinner } from '../components/ui'
import { errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import {
  formatDate, formatDuration, listEvents, loadLookups,
  STATUS_LABEL, STATUS_TONE,
  type EventFilters, type EventRow, type EventStatus, type Lookups,
} from '../lib/events'
import { atLeast } from '../lib/roles'

const PAGE_SIZE = 25

const EMPTY_FILTERS: EventFilters = {
  province: [], from: '', to: '', status: '', type: '', cause: '', q: '', offset: 0,
}

export default function EventsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canWrite = atLeast(user?.role, 'editor')

  const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS)
  const [lookups, setLookups] = useState<Lookups | null>(null)
  const [rows, setRows] = useState<EventRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadLookups().then(setLookups).catch(() => {
      setError('โหลดตัวเลือกไม่สำเร็จ')
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listEvents({ ...filters, limit: PAGE_SIZE })
      setRows(data.events)
      setTotal(data.total)
    } catch (err) {
      setError(errorMessage(err, 'โหลดรายการเหตุการณ์ไม่สำเร็จ'))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { void load() }, [load])

  /** แก้ตัวกรองแล้วต้องกลับหน้าแรกเสมอ ไม่งั้นจะค้างอยู่หน้า 3 ของผลลัพธ์ที่มี 2 แถว */
  function setFilter<K extends keyof EventFilters>(key: K, value: EventFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value, offset: 0 }))
  }

  const offset = filters.offset ?? 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  return (
    <AppLayout>
      <PageHeader
        title="Network Event"
        description="เหตุการณ์รายวันแยกตามจังหวัด"
        actions={canWrite && (
          <Button onClick={() => navigate('/events/new')}>บันทึกเหตุการณ์</Button>
        )}
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="ค้นหา">
            <input
              type="search"
              value={filters.q ?? ''}
              onChange={(e) => setFilter('q', e.target.value)}
              placeholder="เลขที่ หรือ หัวข้อ"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </FilterField>

          <FilterField label="จังหวัด">
            <select
              value={filters.province?.[0] ?? ''}
              onChange={(e) => setFilter('province', e.target.value ? [Number(e.target.value)] : [])}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <option value="">ทุกจังหวัด</option>
              {lookups?.provinces.map((p) => (
                <option key={p.id} value={p.id}>{p.nameTh}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="สถานะ">
            <select
              value={filters.status ?? ''}
              onChange={(e) => setFilter('status', e.target.value as EventStatus | '')}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <option value="">ทุกสถานะ</option>
              {(Object.keys(STATUS_LABEL) as EventStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="ประเภท">
            <select
              value={filters.type ?? ''}
              onChange={(e) => setFilter('type', e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <option value="">ทุกประเภท</option>
              {lookups?.eventTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.nameTh}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="ตั้งแต่วันที่">
            <input
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => setFilter('from', e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </FilterField>

          <FilterField label="ถึงวันที่">
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => setFilter('to', e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </FilterField>

          <div className="flex items-end">
            <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>ล้างตัวกรอง</Button>
          </div>
        </div>
      </Card>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {loading ? (
        <div className="mt-10 flex justify-center" style={{ color: 'var(--text-muted)' }}>
          <Spinner className="size-6" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-sm">
          <p style={{ color: 'var(--text-muted)' }}>
            ไม่พบเหตุการณ์ตามเงื่อนไขนี้
            {canWrite && ' — กด "บันทึกเหตุการณ์" เพื่อเพิ่มรายการแรก'}
          </p>
        </Card>
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
                >
                  <Th>เลขที่</Th>
                  <Th>วันที่</Th>
                  <Th>จังหวัด</Th>
                  <Th>หัวข้อ</Th>
                  <Th>ประเภท</Th>
                  <Th>สถานะ</Th>
                  <Th className="text-right">ระยะเวลา</Th>
                  <Th className="text-right">สถานี</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <Td>
                      <Link
                        to={`/events/${e.id}`}
                        className="font-medium underline underline-offset-2"
                        style={{ color: 'var(--brand)' }}
                      >
                        {e.eventNo}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">{formatDate(e.eventDate)}</Td>
                    <Td className="whitespace-nowrap">{e.provinceName}</Td>
                    <Td>
                      <span className="line-clamp-2">{e.title}</span>
                      {!e.isServiceAffecting && (
                        <span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                          (ไม่กระทบบริการ)
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {e.eventTypeName ?? '—'}
                    </Td>
                    <Td>
                      <Badge {...STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-right">{formatDuration(e.durationMin)}</Td>
                    <Td className="text-right">{e.siteCount || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span style={{ color: 'var(--text-muted)' }}>
              ทั้งหมด {total} รายการ · หน้า {page} จาก {pages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={offset === 0}
                onClick={() => setFilters((f) => ({ ...f, offset: Math.max(offset - PAGE_SIZE, 0) }))}
              >
                ก่อนหน้า
              </Button>
              <Button
                variant="ghost"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setFilters((f) => ({ ...f, offset: offset + PAGE_SIZE }))}
              >
                ถัดไป
              </Button>
            </div>
          </div>
        </>
      )}
    </AppLayout>
  )
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-medium whitespace-nowrap ${className}`}>{children}</th>
}

function Td({
  children, className = '', style,
}: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <td className={`px-3 py-2.5 align-top ${className}`} style={style}>{children}</td>
}

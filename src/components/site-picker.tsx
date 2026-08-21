import { useEffect, useRef, useState } from 'react'
import { api, errorMessage } from '../lib/api'
import { Spinner } from './ui'

export type SiteLite = {
  id: string
  siteCode: string
  siteName: string | null
  provinceId: number
  provinceName: string
  status: string
}

type Props = {
  /** จังหวัดของเหตุการณ์ — จำกัดผลค้นหาให้เลือกข้ามจังหวัดไม่ได้ */
  provinceId: number | null
  value: SiteLite[]
  onChange: (sites: SiteLite[]) => void
  disabled?: boolean
}

/**
 * ค้นหาและเลือกสถานีที่ได้รับผลกระทบ
 *
 * ไม่โหลดรายชื่อทั้งหมดมาใส่ dropdown เพราะมีสถานี 7,300 แห่ง — ค้นทีละครั้งผ่าน
 * /sites/search แล้วให้ BE ตัดเหลือ 20 รายการ
 *
 * ไม่บังคับให้เลือก: ตอนเหตุการณ์เพิ่งเกิดมักยังไม่รู้ว่ากระทบสถานีไหน
 * บันทึกไว้ก่อนแล้วกลับมาเติมทีหลังได้
 */
export function SitePicker({ provinceId, value, onChange, disabled }: Props) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<SiteLite[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // ปิดผลค้นหาเมื่อคลิกนอกกล่อง ไม่งั้นรายการจะค้างทับเนื้อหาข้างล่าง
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  /**
   * หน่วง 300ms ก่อนยิง และทิ้งผลของคำค้นที่ล้าสมัย
   *
   * ถ้าไม่ทิ้ง ผลของ "CM" ที่กลับมาช้ากว่าผลของ "CMI" จะเขียนทับรายการที่ถูกต้อง
   * — อาการคลาสสิกที่ผู้ใช้เห็นเป็น "พิมพ์เร็วแล้วผลไม่ตรง"
   */
  useEffect(() => {
    if (!term.trim() || provinceId === null) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      api.get<{ sites: SiteLite[] }>('/sites/search', {
        params: { q: term.trim(), provinceId, limit: 20 },
      })
        .then((res) => { if (!cancelled) { setResults(res.data.sites); setError(null) } })
        .catch((err) => { if (!cancelled) setError(errorMessage(err, 'ค้นหาสถานีไม่สำเร็จ')) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 300)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [term, provinceId])

  function add(site: SiteLite) {
    if (!value.some((s) => s.id === site.id)) onChange([...value, site])
    setTerm('')
    setResults([])
    setOpen(false)
  }

  function remove(id: string) {
    onChange(value.filter((s) => s.id !== id))
  }

  const unpicked = results.filter((r) => !value.some((s) => s.id === r.id))

  return (
    <div className="flex flex-col gap-2" ref={boxRef}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
            >
              <span className="font-medium">{s.siteCode}</span>
              {s.siteName && (
                <span style={{ color: 'var(--text-muted)' }}>{s.siteName}</span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  aria-label={`เอา ${s.siteCode} ออก`}
                  className="ml-0.5 rounded px-1 leading-none"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={term}
          disabled={disabled || provinceId === null}
          onChange={(e) => { setTerm(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={
            provinceId === null ? 'เลือกจังหวัดก่อนจึงจะค้นหาสถานีได้' : 'พิมพ์รหัสหรือชื่อสถานี'
          }
          className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-shadow
                     focus:ring-3 disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
            // @ts-expect-error ตัวแปร CSS ของ Tailwind สำหรับสี ring
            '--tw-ring-color': 'var(--ring)',
          }}
        />

        {open && term.trim() && (
          <div
            className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border shadow-lg"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            {searching ? (
              <p className="flex items-center gap-2 px-3 py-2.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                <Spinner /> กำลังค้นหา…
              </p>
            ) : unpicked.length === 0 ? (
              <p className="px-3 py-2.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                ไม่พบสถานีที่ตรงกับคำค้นในจังหวัดนี้
              </p>
            ) : (
              unpicked.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => add(s)}
                  className="block w-full px-3 py-2 text-left text-sm transition-colors hover:opacity-80"
                >
                  <span className="font-medium">{s.siteCode}</span>
                  {s.siteName && (
                    <span className="ml-2" style={{ color: 'var(--text-muted)' }}>{s.siteName}</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        เลือกแล้ว {value.length} สถานี — ไม่บังคับ ถ้ายังไม่รู้ว่ากระทบที่ไหนเว้นว่างไว้ได้ แล้วกลับมาเติมทีหลัง
      </p>
    </div>
  )
}

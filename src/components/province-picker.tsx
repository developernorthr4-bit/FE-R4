import { useEffect, useState } from 'react'
import { api, errorMessage } from '../lib/api'
import { Spinner } from './ui'

export type Province = {
  id: number
  code: string
  nameTh: string
  nameEn: string | null
}

/**
 * โหลดรายชื่อจังหวัดในขอบเขต
 *
 * แคชไว้ในตัวแปรระดับโมดูล เพราะทั้งหน้า register และหน้าจัดการผู้ใช้เรียกใช้
 * และรายชื่อ 15 จังหวัดนี้แทบไม่เปลี่ยน ไม่คุ้มที่จะยิงซ้ำทุกครั้งที่เปิดหน้า
 */
let cache: Province[] | null = null
let inflight: Promise<Province[]> | null = null

export async function loadProvinces(): Promise<Province[]> {
  if (cache) return cache
  inflight ??= api.get<{ provinces: Province[] }>('/provinces')
    .then((res) => {
      cache = res.data.provinces
      return cache
    })
    .finally(() => { inflight = null })
  return inflight
}

export function useProvinces() {
  const [provinces, setProvinces] = useState<Province[]>(cache ?? [])
  const [loading, setLoading] = useState(!cache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cache) return
    let cancelled = false
    loadProvinces()
      .then((rows) => { if (!cancelled) setProvinces(rows) })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, 'โหลดรายชื่อจังหวัดไม่สำเร็จ')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { provinces, loading, error }
}

type Props = {
  value: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
  /** โชว์ปุ่ม "ทุกจังหวัด" ให้ผู้อนุมัติเลือกได้ — หน้า register ไม่ควรมี */
  allowAll?: boolean
  /** true = ผู้ใช้เลือก "ทุกจังหวัด" (province_scope = null) */
  all?: boolean
  onAllChange?: (all: boolean) => void
}

/**
 * เลือกจังหวัดหลายอัน
 *
 * ใช้ปุ่ม toggle แทน <select multiple> เพราะบนมือถือ select multiple
 * แทบกดไม่ได้ และผู้ใช้จริงของระบบนี้กรอกจากหน้างานเป็นหลัก
 */
export function ProvincePicker({
  value, onChange, disabled, allowAll = false, all = false, onAllChange,
}: Props) {
  const { provinces, loading, error } = useProvinces()
  const locked = disabled || all

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Spinner /> กำลังโหลดรายชื่อจังหวัด…
      </div>
    )
  }
  if (error) return <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>

  return (
    <div className="flex flex-col gap-2">
      {allowAll && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={all}
            disabled={disabled}
            onChange={(e) => onAllChange?.(e.target.checked)}
          />
          ทุกจังหวัด (ไม่จำกัดขอบเขต)
        </label>
      )}

      <div className="flex flex-wrap gap-1.5" style={{ opacity: locked && all ? 0.5 : 1 }}>
        {provinces.map((p) => {
          const on = value.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              disabled={locked}
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              className="rounded-md border px-2.5 py-1 text-sm transition-colors
                         disabled:cursor-not-allowed
                         focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                background: on ? 'var(--brand)' : 'var(--surface)',
                borderColor: on ? 'var(--brand)' : 'var(--border)',
                color: on ? '#fff' : 'var(--text-muted)',
                outlineColor: 'var(--ring)',
              }}
            >
              {p.nameTh}
            </button>
          )
        })}
      </div>

      {!all && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          เลือกแล้ว {value.length} จาก {provinces.length} จังหวัด
        </p>
      )}
    </div>
  )
}

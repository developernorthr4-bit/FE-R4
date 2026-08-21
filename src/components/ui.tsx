import type {
  ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes,
} from 'react'
import { useId } from 'react'

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="กำลังโหลด"
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
  variant?: 'primary' | 'ghost'
}

export function Button({ loading, variant = 'primary', children, className = '', ...rest }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ' +
    'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'disabled:cursor-not-allowed disabled:opacity-60'

  const styles =
    variant === 'primary'
      ? 'text-white'
      : 'border'

  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`${base} ${styles} ${className}`}
      style={
        variant === 'primary'
          ? { background: 'var(--brand)', outlineColor: 'var(--ring)' }
          : { borderColor: 'var(--border)', color: 'var(--text)', outlineColor: 'var(--ring)' }
      }
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: ReactNode
}

export function Field({ label, hint, className = '', ...rest }: FieldProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        {...rest}
        id={id}
        className={`rounded-lg border px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-3 ${className}`}
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
          // @ts-expect-error ตัวแปร CSS ของ Tailwind สำหรับสี ring
          '--tw-ring-color': 'var(--ring)',
        }}
      />
      {hint && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  )
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg px-3 py-2.5 text-sm"
      style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
    >
      {children}
    </p>
  )
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  hint?: ReactNode
}

export function Select({ label, hint, className = '', children, ...rest }: SelectProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        {...rest}
        id={id}
        className={`rounded-lg border px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-3 ${className}`}
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
          // @ts-expect-error ตัวแปร CSS ของ Tailwind สำหรับสี ring
          '--tw-ring-color': 'var(--ring)',
        }}
      >
        {children}
      </select>
      {hint && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  )
}

/** ป้ายสถานะเล็ก ๆ — สีส่งเข้ามาจากผู้เรียกเพื่อให้ผูกกับตัวแปรธีมได้ */
export function Badge({ children, bg, fg }: { children: ReactNode; bg: string; fg: string }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  )
}

/** ข้อความแจ้งผลสำเร็จ — คู่กับ Alert ที่ใช้แจ้ง error */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-lg px-3 py-2.5 text-sm"
      style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}
    >
      {children}
    </p>
  )
}

/** กล่องเนื้อหามาตรฐาน — ใช้ซ้ำแทนการก๊อป style เดิมทุกหน้า */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border ${className}`}
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {children}
    </div>
  )
}

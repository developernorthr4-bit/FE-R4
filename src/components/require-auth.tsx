import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { atLeast, type Role } from '../lib/roles'
import { Spinner } from './ui'

/**
 * กันไม่ให้เข้าหน้าที่ต้องล็อกอิน
 *
 * ระหว่าง loading ต้องแสดงตัวหมุน ไม่ใช่เด้งไป /login ทันที
 * ไม่งั้นทุกครั้งที่รีเฟรชหน้าจะกระพริบไปหน้า login แป๊บหนึ่งก่อนเด้งกลับ
 *
 * state.from เก็บหน้าที่ตั้งใจจะเข้าไว้ เพื่อพากลับมาหลังล็อกอินสำเร็จ
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return <>{children}</>
}

/**
 * กันหน้าที่ต้องมีบทบาทขั้นต่ำ
 *
 * เป็นแค่การซ่อนหน้าจอ ไม่ใช่ความปลอดภัย — BE ตรวจซ้ำทุก endpoint อยู่แล้ว
 * คนที่พิมพ์ URL เข้ามาตรง ๆ จะเห็นหน้าเปล่าที่ยิง API ไม่ผ่าน จึงเด้งกลับดีกว่า
 *
 * ส่งไป /dashboard ไม่ใช่ /login เพราะเขาล็อกอินแล้ว แค่สิทธิ์ไม่ถึง
 */
export function RequireRole({ min, children }: { min: Role; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!atLeast(user.role, min)) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}

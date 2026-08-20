import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, setUnauthorizedHandler } from './api'
import { authStore, type Tokens, type User } from './auth-store'

type AuthState = {
  user: User | null
  /** true ระหว่างตรวจ token ที่ค้างอยู่ตอนเปิดแอป — อย่าเพิ่งตัดสินว่ายังไม่ล็อกอิน */
  loading: boolean
  login: (identifier: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

type LoginResponse = Tokens & { user: User; expiresIn: number }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => authStore.getUser())
  const [loading, setLoading] = useState(true)

  // interceptor เรียกตัวนี้เมื่อ refresh ไม่สำเร็จ
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  /**
   * ตอนเปิดแอป: ถ้ามี token ค้างอยู่ให้ยืนยันกับ BE ก่อนว่ายังใช้ได้
   * ไม่เชื่อ user ที่แคชไว้ใน localStorage เฉย ๆ เพราะ role อาจถูกเปลี่ยนไปแล้ว
   */
  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      if (!authStore.getAccessToken() && !authStore.getRefreshToken()) {
        if (!cancelled) { setUser(null); setLoading(false) }
        return
      }
      try {
        const res = await api.get<{ user: User }>('/auth/me')
        if (cancelled) return
        authStore.setUser(res.data.user)
        setUser(res.data.user)
      } catch {
        // interceptor พยายาม refresh ให้แล้ว มาถึงตรงนี้แปลว่าไปต่อไม่ได้จริง
        if (cancelled) return
        authStore.clear()
        setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void bootstrap()
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api.post<LoginResponse>('/auth/login', { identifier, password })
    authStore.setTokens({ accessToken: res.data.accessToken, refreshToken: res.data.refreshToken })
    authStore.setUser(res.data.user)
    setUser(res.data.user)
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = authStore.getRefreshToken()
    try {
      await api.post('/auth/logout', { refreshToken })
    } catch {
      // ออกจากระบบฝั่งเราให้ได้เสมอ ต่อให้ BE ล่ม
    }
    authStore.clear()
    setUser(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth ต้องอยู่ภายใน <AuthProvider>')
  return ctx
}

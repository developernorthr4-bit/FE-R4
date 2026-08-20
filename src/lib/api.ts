import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { authStore, type Tokens, type User } from './auth-store'

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20_000,
})

/** ให้ AuthProvider ลงทะเบียนไว้ เพื่อให้ interceptor สั่งออกจากระบบได้ */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

api.interceptors.request.use((config) => {
  const token = authStore.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/**
 * refresh ที่กำลังวิ่งอยู่ — ใช้ร่วมกันทุก request (single-flight)
 *
 * จำเป็นเพราะ BE หมุน refresh token ทุกครั้งที่ใช้ ถ้ามี 3 request หมดอายุพร้อมกัน
 * แล้วต่างคนต่างยิง /auth/refresh จะมีแค่ใบแรกที่ผ่าน อีก 2 ใบจะถูกมองว่าเป็น
 * การใช้ token ซ้ำ แล้วโดนเพิกถอนทั้งหมด ผู้ใช้จะหลุดออกจากระบบทั้งที่ไม่ได้ทำอะไรผิด
 */
let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refreshToken = authStore.getRefreshToken()
  if (!refreshToken) throw new Error('no refresh token')

  // ใช้ axios ตัวเปล่า ไม่ผ่าน interceptor ของ api เพื่อไม่ให้วนซ้ำตัวเอง
  const res = await axios.post<Tokens & { user: User }>(
    `${baseURL}/auth/refresh`,
    { refreshToken },
    { headers: { 'Content-Type': 'application/json' }, timeout: 20_000 },
  )
  authStore.setTokens({ accessToken: res.data.accessToken, refreshToken: res.data.refreshToken })
  if (res.data.user) authStore.setUser(res.data.user)
  return res.data.accessToken
}

type RetriableConfig = AxiosRequestConfig & { _retried?: boolean }

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined
    const status = error.response?.status

    // ลองใหม่ครั้งเดียวเท่านั้น และไม่ลองกับ endpoint ของ auth เอง
    const isAuthCall = config?.url?.includes('/auth/refresh') || config?.url?.includes('/auth/login')
    if (status !== 401 || !config || config._retried || isAuthCall) {
      return Promise.reject(error)
    }

    config._retried = true
    try {
      refreshPromise ??= refreshAccessToken().finally(() => { refreshPromise = null })
      const accessToken = await refreshPromise
      config.headers = { ...config.headers, Authorization: `Bearer ${accessToken}` }
      return api.request(config)
    } catch {
      authStore.clear()
      onUnauthorized?.()
      return Promise.reject(error)
    }
  },
)

/** ดึงข้อความ error ที่ BE ส่งมา ถ้าไม่มีค่อยใช้ข้อความสำรอง */
export function errorMessage(err: unknown, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined
    if (data?.message) return data.message
    if (err.code === 'ECONNABORTED') return 'เชื่อมต่อเซิร์ฟเวอร์นานเกินไป'
    if (!err.response) return `ติดต่อเซิร์ฟเวอร์ไม่ได้ (${baseURL})`
  }
  return fallback
}

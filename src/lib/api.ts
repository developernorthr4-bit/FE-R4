import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { authStore, type Tokens, type User } from './auth-store'

/**
 * หา URL ของ BE จาก env ตอน build
 *
 * ต้องเช็คสตริงว่างด้วย ไม่ใช่แค่ ?? เพราะถ้า VITE_API_URL ถูกตั้งเป็นค่าว่าง
 * (เช่นสร้างตัวแปรไว้บน Vercel แต่ไม่ได้ใส่ค่า) axios จะยิงแบบ relative
 * ไปที่ตัวเอง แล้วได้ 405 Method Not Allowed ซึ่งอ่านแล้วไม่มีทางเดาสาเหตุถูก
 *
 * เผื่อกรณีวางค่าพร้อมเครื่องหมายคำพูดมาจาก .env ด้วย เพราะ Vercel เก็บเป็น
 * ตัวอักษรตรง ๆ ไม่ได้แกะ quote ให้เหมือน dotenv
 */
function resolveBaseUrl(): { url: string; error: string | null } {
  const raw = (import.meta.env.VITE_API_URL ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\/+$/, '')

  if (raw) return { url: raw, error: null }
  if (import.meta.env.DEV) return { url: 'http://localhost:8787', error: null }

  return {
    url: '',
    error:
      'ยังไม่ได้ตั้งค่า VITE_API_URL ตอน build — ตั้งค่าใน Vercel ให้ชี้ไปที่ URL ของ BE ' +
      'แล้ว redeploy ใหม่ (Vite ฝังค่านี้ตอน build ตั้งค่าเฉย ๆ ไม่พอ)',
  }
}

const resolved = resolveBaseUrl()
export const apiBaseUrl = resolved.url
export const apiConfigError = resolved.error

if (apiConfigError) console.error(`[R4] ${apiConfigError}`)

export const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000,
})

// ตั้งค่าผิดตั้งแต่ build แล้ว ปฏิเสธตั้งแต่ยังไม่ยิงออกไป จะได้เห็นสาเหตุจริง
api.interceptors.request.use((config) => {
  if (apiConfigError) throw new Error(apiConfigError)
  return config
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
    `${apiBaseUrl}/auth/refresh`,
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
  if (apiConfigError) return apiConfigError
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined
    if (data?.message) return data.message
    if (err.code === 'ECONNABORTED') return 'เชื่อมต่อเซิร์ฟเวอร์นานเกินไป'
    if (err.response?.status === 405) {
      return `ปลายทางไม่รับคำสั่งนี้ — ตรวจว่า VITE_API_URL ชี้ไปที่ BE จริง (ตอนนี้: ${apiBaseUrl || 'ว่าง'})`
    }
    if (!err.response) return `ติดต่อเซิร์ฟเวอร์ไม่ได้ (${apiBaseUrl})`
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

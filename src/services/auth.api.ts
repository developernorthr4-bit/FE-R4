import { api } from '../lib/api'
import type { Tokens, User } from '../lib/auth-store'

export type LoginResponse = Tokens & { user: User; expiresIn: number }

export async function login(identifier: string, password: string) {
  const res = await api.post<LoginResponse>('/auth/login', { identifier, password })
  return res.data
}

export type RegisterPayload = {
  username: string
  email: string
  fullName: string
  phone: string
  company: string | null
  password: string
  provinceScope: number[]
}

export async function register(payload: RegisterPayload) {
  const res = await api.post<{ message: string }>('/auth/register', payload)
  return res.data.message
}

export async function me() {
  const res = await api.get<{ user: User }>('/auth/me')
  return res.data.user
}

export async function logout(refreshToken: string | null) {
  await api.post('/auth/logout', { refreshToken })
}

export async function checkResetToken(token: string) {
  const res = await api.get<{ ok: true; username: string | null }>(
    `/auth/reset-password/${encodeURIComponent(token)}`,
  )
  return res.data
}

export async function resetPassword(token: string, password: string) {
  const res = await api.post<{ message: string }>('/auth/reset-password', { token, password })
  return res.data.message
}

import axios from 'axios'
import { reactive } from 'vue'
import { apiBaseUrl, apiConfigError, getLastOkAt, markApiOk } from './api'

/**
 * ปลุก BE บน Render free tier ที่หลับเมื่อไม่มีคำขอ 15 นาที (ตื่นช้า ~30–60 วิ)
 *
 * ยิง /health (BE ตอบโดยไม่แตะ DB) ถ้าตอบภายใน QUIET_MS = ตื่นอยู่แล้ว ไม่โชว์อะไร
 * จอจะได้ไม่กระพริบตอนใช้งานปกติ · ช้ากว่านั้นค่อยเปิดหน้าจอรอ (ServerWakeOverlay)
 *
 * mode: 'full' = จอเต็ม (เปิดเว็บครั้งแรก ยังไม่มีอะไรให้ดู)
 *       'bar'  = แถบบนสุด (กลับมาที่แท็บเดิม / เปลี่ยนหน้าหลังว่างนาน — ยังเห็นหน้าเดิมอยู่)
 *
 * ไฟล์นี้ import api.ts ทางเดียว (api.ts ไม่ import กลับ) กันวงกลม
 */

const QUIET_MS = 1_500
const PING_TIMEOUT_MS = 10_000
const RETRY_MS = 2_500
const GIVE_UP_MS = 120_000
/** Render หลับที่ 15 นาที — เผื่อไว้ 1 นาที */
const STALE_MS = 14 * 60_000

export type WakeMode = 'full' | 'bar'

export const serverWake = reactive({
  phase: 'idle' as 'idle' | 'waking' | 'failed',
  mode: 'full' as WakeMode,
  startedAt: 0,
})

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function ping(): Promise<boolean> {
  try {
    await axios.get(`${apiBaseUrl}/health`, { timeout: PING_TIMEOUT_MS })
    markApiOk()
    return true
  } catch {
    return false
  }
}

async function run(mode: WakeMode): Promise<boolean> {
  const started = Date.now()
  const first = ping()
  const quick = await Promise.race([first, sleep(QUIET_MS).then(() => null)])
  if (quick === true) return true

  serverWake.mode = mode
  serverWake.startedAt = started
  serverWake.phase = 'waking'

  let ok = quick === null ? await first : false
  while (!ok && Date.now() - started < GIVE_UP_MS) {
    await sleep(RETRY_MS)
    ok = await ping()
  }
  serverWake.phase = ok ? 'idle' : 'failed'
  return ok
}

/** single-flight — เรียกซ้ำระหว่างที่กำลังปลุกอยู่ได้ชุดเดียวกัน */
let inflight: Promise<boolean> | null = null

export function wakeServer(mode: WakeMode = 'full'): Promise<boolean> {
  if (apiConfigError) return Promise.resolve(false)
  if (inflight) {
    // มีคนรอแบบจอเต็มเข้ามาระหว่างแถบบางกำลังโชว์ — ขยายเป็นจอเต็ม
    if (mode === 'full') serverWake.mode = 'full'
    return inflight
  }
  inflight = run(mode).finally(() => { inflight = null })
  return inflight
}

/** ไม่มีคำขอสำเร็จมานานพอที่ Render จะหลับไปแล้ว (หรือยังไม่เคยสำเร็จเลย) */
export function isServerStale(): boolean {
  return Date.now() - getLastOkAt() > STALE_MS
}

const retryWaiters: Array<() => void> = []

/**
 * รอจน BE ตื่นจริง — ปลุกไม่สำเร็จจะค้างที่หน้าจอ "ลองใหม่" ไม่ปล่อยให้ไปต่อ
 *
 * จำเป็นเพราะ auth.bootstrap() ล้าง token ทิ้งเมื่อ /auth/me ล้มแบบใดก็ได้
 * ถ้าปล่อยให้ไปต่อตอน BE ยังไม่ตื่น ผู้ใช้จะหลุดออกจากระบบทั้งที่เซสชันยังดีอยู่
 */
export async function ensureServerAwake(mode: WakeMode): Promise<void> {
  while (!(await wakeServer(mode))) {
    await new Promise<void>((r) => retryWaiters.push(r))
  }
}

/** ปุ่ม "ลองใหม่" บนหน้าจอรอ */
export function retryWake(): void {
  const waiters = retryWaiters.splice(0)
  if (waiters.length) waiters.forEach((r) => r())
  else void wakeServer(serverWake.mode)
}

/** กลับมาที่แท็บที่เปิดค้างไว้นาน — ปลุกล่วงหน้าแบบแถบบาง ไม่บังหน้าเดิม */
export function watchTabReturn(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isServerStale()) void wakeServer('bar')
  })
}

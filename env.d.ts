/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL ของ BE — Vite ฝังค่านี้ตอน build ไม่ใช่ตอนรัน */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

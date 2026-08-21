# FE-R4

หน้าเว็บของระบบติดตาม Network Event ภาคเหนือ — Vite + React + TypeScript

```
FE-R4 (Vercel)  ──axios + JWT──►  BE-R4 (Render)  ──►  Supabase
```

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env        # ตั้ง VITE_API_URL ให้ชี้ไปที่ BE
npm run dev                 # http://localhost:5173
```

ต้องมี **BE-R4 ทำงานอยู่ก่อน** ถึงจะล็อกอินได้ — ไม่มี mock

```bash
cd ../BE-R4 && npm run dev  # http://localhost:8787
```

## โครงสร้าง

```
src/
  main.tsx                  BrowserRouter + StrictMode
  App.tsx                   เส้นทาง: /login · /dashboard · redirect
  index.css                 Tailwind v4 + ตัวแปรสีของธีม
  lib/
    theme-store.ts          อ่าน/เขียนธีมใน localStorage + apply ลง <html>
    theme-context.tsx       ThemeProvider · useTheme
    api.ts                  axios instance + interceptor แนบ token และ refresh อัตโนมัติ
    auth-store.ts           อ่าน/เขียน/ล้าง token ใน localStorage
    auth-context.tsx        AuthProvider · useAuth · ตรวจ session ตอนเปิดแอป
  components/
    theme-toggle.tsx        สลับธีม สว่าง/มืด/ตามระบบ
    ui.tsx                  Button · Field · Alert · Spinner
    require-auth.tsx        กันหน้าที่ต้องล็อกอิน
  routes/
    login.tsx
    dashboard.tsx           หน้าเปล่า มีไว้พิสูจน์ว่า guard ทำงาน
```

## จุดที่ต้องรู้ก่อนแก้

**single-flight refresh** (`lib/api.ts`) — ส่วนที่พังง่ายที่สุดถ้าแก้ผิด

BE หมุน refresh token ทุกครั้งที่ใช้ ใบเก่าจะถูกเพิกถอนทันที ถ้ามีหลาย request
หมดอายุพร้อมกันแล้วต่างคนต่างยิง `/auth/refresh` จะมีแค่ใบแรกที่ผ่าน ที่เหลือ BE
จะมองว่าเป็นการใช้ token ซ้ำ แล้วเพิกถอนทั้งหมด — ผู้ใช้หลุดออกจากระบบทั้งที่ไม่ได้ทำอะไรผิด

จึงต้องแชร์ promise ตัวเดียวกันเสมอ

```ts
refreshPromise ??= refreshAccessToken().finally(() => { refreshPromise = null })
```

**อย่าเด้งไป /login ระหว่าง loading** (`components/require-auth.tsx`)
ตอนเปิดแอปต้องรอผล `/auth/me` ก่อน ถ้าเช็คแค่ `!user` หน้าจะกระพริบไป login
ทุกครั้งที่รีเฟรช แล้วค่อยเด้งกลับ

**token อยู่ใน localStorage** — แลกความปลอดภัยจาก XSS กับความเรียบง่าย
ถ้าจะย้ายไป httpOnly cookie แก้แค่ `lib/auth-store.ts` กับ `lib/api.ts` หน้าจอไม่ต้องแตะ

**ธีม light/dark/system** ใช้ตัวแปร CSS ใน `index.css` ไม่ใช่คลาสสีของ Tailwind ตรง ๆ

ผู้ใช้เลือกได้ 3 แบบ แต่ CSS รู้จักแค่ 2 สถานะ — JS แปลง `system` เป็นค่าจริงแล้วปั๊ม
`data-theme="light|dark"` ลง `<html>` จึงไม่ต้องประกาศชุดสีมืดซ้ำใน `@media` อีกที่
เพิ่มสีใหม่ให้ประกาศทั้ง `:root` และ `:root[data-theme='dark']` เสมอ

```
index.html               inline script ปั๊ม data-theme ก่อนวาดครั้งแรก (กันหน้าขาววาบ)
lib/theme-store.ts       อ่าน/เขียน localStorage · resolve system · apply ลง DOM
lib/theme-context.tsx    ThemeProvider · useTheme() -> { theme, resolved, setTheme }
components/theme-toggle.tsx   ปุ่ม 3 ช่อง อยู่บนหน้า login และ dashboard
```

จุดที่พังง่าย 3 อย่าง

- **คีย์ `r4.theme` กับ `data-theme` ซ้ำอยู่ใน `index.html`** เพราะสคริปต์นั้นต้องรันก่อน React
  แก้ที่ `theme-store.ts` แล้วต้องไล่แก้ที่ `index.html` ด้วย
- **`colorScheme` ต้องตั้งคู่ไปกับ `data-theme`** ไม่งั้น scrollbar กับ input ของ native
  จะยังเป็นโทนสว่างค้างบนพื้นมืด
- **transition เปิดเฉพาะตอนสลับธีม** — `theme-store` ติด `data-theme-transition` ไว้ ~200ms
  แล้วถอดออก ถ้าปล่อยไว้ตลอดจะเห็นสีไล่แวบ ๆ ทุกครั้งที่เปลี่ยนหน้า

## ขึ้น Vercel

```
Framework Preset   Vite
Root Directory     FE-R4
Build Command      npm run build
Output Directory   dist
Environment        VITE_API_URL = https://<ชื่อ>.onrender.com
```

`vercel.json` ตั้ง rewrite ทุก path กลับไป `index.html` ไว้แล้ว
ถ้าไม่มีบรรทัดนี้ การเข้า `/dashboard` ตรง ๆ หรือกดรีเฟรชจะได้ 404 เพราะเป็น SPA

หลัง deploy ต้องกลับไปเพิ่ม URL ของ Vercel ลงใน `CORS_ORIGIN` ของ BE ด้วย
ไม่งั้นเบราว์เซอร์จะบล็อกทุก request

## ทดสอบด้วยมือ

1. เข้า `/dashboard` ทั้งที่ยังไม่ล็อกอิน → ต้องเด้งไป `/login`
2. ล็อกอินผิด → ขึ้นข้อความไทย ไม่ใช่ error ดิบ
3. ล็อกอินถูก → เข้า `/dashboard` เห็นชื่อผู้ใช้
4. รีเฟรชหน้า → ยังล็อกอินอยู่ ไม่กระพริบไปหน้า login
5. ลบ `r4.accessToken` ใน localStorage (เหลือ `r4.refreshToken`) แล้วรีเฟรช → ต้องต่อ session ได้เอง
6. ลบทั้งสองคีย์ แล้วรีเฟรช → เด้งไป `/login`
7. ออกจากระบบ → กลับไป `/login` และเข้า `/dashboard` ซ้ำไม่ได้
8. กดธีม "มืด" → รีเฟรช → ต้องมืดตั้งแต่เฟรมแรก ไม่เห็นพื้นขาววาบ
9. เลือก "ตามระบบ" แล้วสลับ dark mode ที่ OS → หน้าเว็บต้องเปลี่ยนตามทันทีโดยไม่ต้องรีเฟรช
"# FE-R4" 
"# FE_R4" 
"# FE_R4" 
"# FE-R4" 
